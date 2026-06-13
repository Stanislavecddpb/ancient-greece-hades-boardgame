import type { Ctx } from 'boardgame.io';
import {
  type CycladesState,
  type GodName,
  type ActionTurn,
  type TerritoryId,
  COMPETITIVE_GODS,
  GOD_BUILDING,
  MAX_RECRUIT_PER_TURN,
  BUILDING_COST,
} from './types';
import { isIsland, isSea } from './board';
import { islandsOf, freeSlots, log } from './helpers';
import { checkMetropolis } from './metropolis';
import { advanceCreatureMarket, cleanupBoardCreatures } from './creatures';
import { endHadesCycle } from './hades';

/** Что и почём нанимает каждый бог за одну активацию. */
type RecruitKind = 'troop' | 'fleet' | 'priest' | 'philosopher';
interface RecruitConfig {
  kind: RecruitKind;
  /** Стоимость n-го найма (0-индекс): 1-й, 2-й, 3-й... */
  costs: number[];
  max: number;
}
export const RECRUIT_CONFIG: Record<GodName, RecruitConfig | null> = {
  ares: { kind: 'troop', costs: [0, 2, 3, 4], max: MAX_RECRUIT_PER_TURN },
  poseidon: { kind: 'fleet', costs: [0, 1, 2, 3], max: MAX_RECRUIT_PER_TURN },
  zeus: { kind: 'priest', costs: [0, 4], max: 2 },
  athena: { kind: 'philosopher', costs: [0, 4], max: 2 },
  apollo: null,
};

/** Стоимость следующего найма для бога при уже нанятых `recruited`. */
export function recruitCost(god: GodName, recruited: number): number {
  const cfg = RECRUIT_CONFIG[god];
  if (!cfg) return Infinity;
  return cfg.costs[Math.min(recruited, cfg.costs.length - 1)];
}

/** Собирает очередь исполнения из результатов аукциона и запускает фазу действий. */
export function startActionsPhase(G: CycladesState): void {
  const a = G.auction;
  const queue: ActionTurn[] = [];
  if (a) {
    for (const god of COMPETITIVE_GODS) {
      const slot = a.slots.find((s) => s.god === god && s.occupantId);
      if (slot && slot.occupantId) {
        queue.push(slot.isHades ? { god, playerId: slot.occupantId, isHades: true } : { god, playerId: slot.occupantId });
      }
    }
  }
  G.actions = { queue, index: 0, recruited: 0, built: false, creatureBought: false, creatureCycled: false };
}

/** Текущий пункт очереди действий (бог + игрок) или null. */
export function currentTurn(G: CycladesState): ActionTurn | null {
  const s = G.actions;
  if (!s || s.index >= s.queue.length) return null;
  return s.queue[s.index];
}

/** Игрок, который сейчас исполняет действия. */
export function activePlayerId(G: CycladesState): string | null {
  return currentTurn(G)?.playerId ?? null;
}

/** Можно ли разместить флот в этой морской зоне (рядом со своим островом или где уже есть флот). */
export function canPlaceFleet(G: CycladesState, pid: string, seaId: TerritoryId): boolean {
  const sea = G.territories[seaId];
  if (!sea || !isSea(sea)) return false;
  if (sea.fleets > 0 && sea.ownerId !== pid) return false; // занято врагом
  const touchesOwnIsland = sea.adjacentIslands.some((iid) => {
    const isl = G.territories[iid];
    return isl && isIsland(isl) && isl.ownerId === pid;
  });
  return touchesOwnIsland || sea.ownerId === pid;
}

// --- Эффекты действий (мутируют G; валидация — в обёртках-ходах) ---

export function applyRecruit(
  G: CycladesState,
  pid: string,
  god: GodName,
  targetId?: TerritoryId,
): string | null {
  const cfg = RECRUIT_CONFIG[god];
  const s = G.actions;
  if (!cfg || !s) return 'нет действия';
  if (s.recruited >= cfg.max) return 'лимит найма за ход';
  const cost = recruitCost(god, s.recruited);
  const player = G.players[pid];
  if (player.gold < cost) return 'не хватает золота';

  switch (cfg.kind) {
    case 'troop': {
      if (player.troopsSupply <= 0) return 'нет фигурок войск';
      const island = targetId ? G.territories[targetId] : undefined;
      if (!island || !isIsland(island) || island.ownerId !== pid) return 'нужен свой остров';
      island.troops += 1;
      player.troopsSupply -= 1;
      break;
    }
    case 'fleet': {
      if (player.fleetsSupply <= 0) return 'нет фигурок флота';
      if (!targetId || !canPlaceFleet(G, pid, targetId)) return 'нельзя разместить флот здесь';
      const sea = G.territories[targetId];
      if (!isSea(sea)) return 'нужна морская зона';
      sea.fleets += 1;
      sea.ownerId = pid;
      player.fleetsSupply -= 1;
      break;
    }
    case 'priest':
      player.priests += 1;
      break;
    case 'philosopher':
      player.philosophers += 1;
      break;
  }

  player.gold -= cost;
  s.recruited += 1;
  log(G, `${player.name}: найм (${cfg.kind}) за ${cost} золота.`);
  if (cfg.kind === 'philosopher') checkMetropolis(G, pid);
  return null;
}

export function applyBuild(G: CycladesState, pid: string, god: GodName, islandId: TerritoryId): string | null {
  const s = G.actions;
  if (!s) return 'нет действия';
  if (s.built) return 'здание уже построено в этот ход';
  const type = GOD_BUILDING[god];
  if (!type) return 'этот бог не строит';
  const player = G.players[pid];
  if (player.gold < BUILDING_COST) return 'не хватает золота';
  const island = G.territories[islandId];
  if (!island || !isIsland(island) || island.ownerId !== pid) return 'нужен свой остров';
  if (freeSlots(island) <= 0) return 'нет свободных слотов';
  // Здание того же типа разрешено — был бы свободный слот (важно для скидки храмов).

  island.buildings.push({ type, ownerId: pid });
  player.gold -= BUILDING_COST;
  s.built = true;
  log(G, `${player.name} строит ${type} на острове ${island.name}.`);
  checkMetropolis(G, pid);
  return null;
}

/**
 * Установка рога изобилия первым выбравшим Аполлона: +1 к доходу выбранного
 * своего острова. Возвращает текст ошибки или null при успехе (сбрасывает флаг).
 */
export function applyPlaceCornucopia(G: CycladesState, pid: string, islandId: TerritoryId): string | null {
  if (G.pendingCornucopia !== pid) return 'сейчас не ваш рог изобилия';
  const isl = G.territories[islandId];
  if (!isl || !isIsland(isl) || isl.ownerId !== pid) return 'нужен свой остров';
  isl.cornucopia += 1;
  if (isl.cornucopiaSpots.length > 0) isl.cornucopiaSpots[0].count += 1;
  else isl.cornucopiaSpots.push({ pos: { ...isl.cells[0].pos }, count: 1 });
  G.pendingCornucopia = null;
  log(G, `${G.players[pid].name} кладёт рог изобилия на ${isl.name} (Аполлон).`);
  return null;
}

/** Завершает активацию текущего бога; продвигает очередь. Возвращает true, если фаза действий окончена. */
export function advanceTurn(G: CycladesState): boolean {
  const s = G.actions;
  if (!s) return true;
  s.index += 1;
  s.recruited = 0;
  s.built = false;
  s.creatureBought = false;
  s.creatureCycled = false;
  if (s.index >= s.queue.length) {
    G.actions = null;
    return true;
  }
  return false;
}

/** Бухгалтерия конца цикла: чистка пустого флота, ротация стартового игрока, новый цикл. */
export function endCycle(G: CycladesState, ctx: Ctx): void {
  // Удаляем «осиротевший» признак владельца у пустых морей.
  for (const t of Object.values(G.territories)) {
    if (isSea(t) && t.fleets === 0) t.ownerId = null;
  }
  // Простая проверка вылета: нет ни островов, ни юнитов на доске.
  for (const pid of ctx.playOrder) {
    const p = G.players[pid];
    if (p.isEliminated) continue;
    const hasIsland = islandsOf(G, pid).length > 0;
    const hasUnits = Object.values(G.territories).some(
      (t) => (isIsland(t) && t.ownerId === pid && t.troops > 0) || (isSea(t) && t.ownerId === pid && t.fleets > 0),
    );
    if (!hasIsland && !hasUnits) {
      p.isEliminated = true;
      log(G, `${p.name} выбывает из игры.`);
    }
  }
  // Рынок существ сдвигается на одну позицию в конце раунда.
  advanceCreatureMarket(G.creatures);
  // Подстраховка: убираем фигуры существ старше текущего цикла.
  cleanupBoardCreatures(G);
  // Если в этом цикле был активен Аид — Нежить уходит, трек Угрозы сбрасывается.
  endHadesCycle(G);

  G.startIndex = (G.startIndex + 1) % ctx.playOrder.length;
  G.cycle += 1;
}
