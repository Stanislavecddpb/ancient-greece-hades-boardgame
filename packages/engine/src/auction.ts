import type { Ctx } from 'boardgame.io';
import {
  type CycladesState,
  type GodName,
  type GodSlot,
  type PlayerID,
  COMPETITIVE_GODS,
} from './types';
import { log, islandsOf } from './helpers';
import { markHadesSlot } from './hades';

/**
 * Боги, выставляемые на аукцион в этом цикле: numPlayers конкурентных богов
 * (с ротацией по циклам) + Аполлон всегда доступен отдельно. При 4 игроках
 * выставляются все четыре конкурентных бога.
 */
export function godsForCycle(numPlayers: number, cycle: number): GodName[] {
  // Всего открыто богов = числу игроков, включая Аполлона. Значит конкурентных
  // (не-Аполлон) богов выставляется numPlayers − 1.
  const count = Math.min(numPlayers - 1, COMPETITIVE_GODS.length);
  const start = (cycle - 1) % COMPETITIVE_GODS.length;
  const chosen = new Set<GodName>();
  for (let i = 0; i < count; i++) {
    chosen.add(COMPETITIVE_GODS[(start + i) % COMPETITIVE_GODS.length]);
  }
  // Сохраняем канонический порядок исполнения.
  return COMPETITIVE_GODS.filter((g) => chosen.has(g));
}

/** Сколько игрок реально заплатит за ставку с учётом жрецов (минимум 1). */
export function paymentFor(player: { priests: number }, bid: number): number {
  return Math.max(1, bid - player.priests);
}

/** Игрок уже где-то «встал» (на боге или у Аполлона)? */
export function isSettled(a: CycladesState['auction'], pid: PlayerID): boolean {
  if (!a) return false;
  return a.apollo.includes(pid) || a.slots.some((s) => s.occupantId === pid);
}

/** Следующий не определившийся игрок по часовой стрелке после fromPid; null — все встали. */
export function nextToAct(G: CycladesState, ctx: Ctx, fromPid: PlayerID): PlayerID | null {
  const order = ctx.playOrder;
  const startPos = order.indexOf(fromPid);
  for (let step = 1; step <= order.length; step++) {
    const pid = order[(startPos + step) % order.length];
    if (!G.players[pid].isEliminated && !isSettled(G.auction, pid)) return pid;
  }
  return null;
}

/** Готовит состояние аукциона в начале фазы. */
export function setupAuction(G: CycladesState, ctx: Ctx): void {
  const gods = godsForCycle(ctx.numPlayers, G.cycle);
  const slots: GodSlot[] = gods.map((god) => ({ god, occupantId: null, bid: 0 }));
  const starter = ctx.playOrder[G.startIndex % ctx.playOrder.length];
  G.auction = { slots, apollo: [], toAct: starter };
  // Если Аид активен в этом цикле — его тайл накрывает бога над Аполлоном.
  markHadesSlot(G);
  log(G, `Цикл ${G.cycle}: аукцион богов начинается. Первым предлагает ${G.players[starter].name}.`);
}

/**
 * Эффект ставки на конкурентного бога (чистая логика, без событий boardgame.io).
 * Возвращает текст ошибки или null при успехе; при успехе двигает `toAct` дальше.
 */
export function applyBid(
  G: CycladesState,
  ctx: Ctx,
  pid: PlayerID,
  god: GodName,
  amount: number,
): string | null {
  const a = G.auction;
  if (!a || pid !== a.toAct) return 'не ваш ход';
  const slot = a.slots.find((s) => s.god === god);
  if (!slot) return 'нет такого бога';
  if (slot.occupantId === pid) return 'вы уже стоите здесь';
  if (!Number.isInteger(amount) || amount < 1) return 'ставка должна быть >= 1';
  const minBid = slot.occupantId ? slot.bid + 1 : 1;
  if (amount < minBid) return `нужно минимум ${minBid}`;
  if (paymentFor(G.players[pid], amount) > G.players[pid].gold) return 'не хватает золота';

  const displaced = slot.occupantId; // кого выбиваем (или null, если бог был свободен)
  if (displaced) {
    log(G, `${G.players[pid].name} перебивает ставку за ${godLabel(god)}.`);
  }
  slot.occupantId = pid;
  slot.bid = amount;

  // Выбитый игрок переставляет ставку сразу же; иначе ход идёт дальше по кругу.
  if (displaced && displaced !== pid && !G.players[displaced].isEliminated) {
    a.toAct = displaced;
  } else {
    const next = nextToAct(G, ctx, pid);
    if (next) a.toAct = next;
  }
  return null;
}

/** Эффект ухода под Аполлона. */
export function applyApollo(G: CycladesState, ctx: Ctx, pid: PlayerID): string | null {
  const a = G.auction;
  if (!a || pid !== a.toAct) return 'не ваш ход';
  for (const s of a.slots) if (s.occupantId === pid) { s.occupantId = null; s.bid = 0; }
  if (!a.apollo.includes(pid)) a.apollo.push(pid);
  const next = nextToAct(G, ctx, pid);
  if (next) a.toAct = next;
  return null;
}

/** Все ли живые игроки определились. */
export function auctionComplete(G: CycladesState, ctx: Ctx): boolean {
  return ctx.playOrder
    .filter((pid) => !G.players[pid].isEliminated)
    .every((pid) => isSettled(G.auction, pid));
}

/**
 * Списывает оплату с победителей и собирает очередь исполнения действий.
 * Возвращает очередь «бог → игрок» в каноническом порядке (Аполлоны — в конце).
 */
export function resolveAuction(G: CycladesState, ctx: Ctx): void {
  const a = G.auction;
  if (!a) return;

  for (const slot of a.slots) {
    if (!slot.occupantId) continue;
    const player = G.players[slot.occupantId];
    const pay = paymentFor(player, slot.bid);
    player.gold -= pay;
    log(G, `${player.name} получает ${godLabel(slot.god)}, заплатив ${pay} золота.`);
  }

  // Аполлон: контролирующий ≤1 остров получает 4 золота, иначе 1.
  // Установку рога изобилия первым выбравшим Аполлона делает фаза действий.
  for (const pid of a.apollo) {
    const gold = islandsOf(G, pid).length <= 1 ? 4 : 1;
    G.players[pid].gold += gold;
    log(G, `${G.players[pid].name} следует за Аполлоном (+${gold} золота).`);
  }
  // Внимание: сам G.auction обнуляется вызывающей стороной ПОСЛЕ построения
  // очереди действий (startActionsPhase читает слоты).
}

const GOD_LABELS: Record<GodName, string> = {
  ares: 'Ареса',
  poseidon: 'Посейдона',
  zeus: 'Зевса',
  athena: 'Афину',
  apollo: 'Аполлона',
};
export function godLabel(g: GodName): string {
  return GOD_LABELS[g];
}
