import type { CycladesState, PlayerID, Island } from './types';
import { isSea, isIsland } from './board';
import { log } from './helpers';

/** Остров с построенным Некрополем (на поле он один) или undefined. */
export function necropolisIsland(G: CycladesState): Island | undefined {
  return Object.values(G.territories).find((t): t is Island => isIsland(t) && t.necropolis);
}

/**
 * Кладёт `n` золота на Некрополь (если он есть на поле). Вызывается при гибели
 * каждого ОБЫЧНОГО (не Нежить) Войска/Флотилии — в бою или от Мифического Существа.
 */
export function addNecropolisGold(G: CycladesState, n: number): void {
  if (n <= 0) return;
  const isl = necropolisIsland(G);
  if (isl) isl.necropolisGold += n;
}

/** Цербер на этой клетке (Модуль 3): собирает доход вместо владельца. */
function cerberusOn(G: CycladesState, location: PlayerID): PlayerID | null {
  const c = G.boardCreatures.find((bc) => bc.kind === 'cerberus' && bc.location === location);
  return c ? c.ownerId : null;
}

/**
 * Доход игрока с его собственных территорий = рога изобилия + маркеры процветания
 * (на суше — владельцу; на воде — держащему там флот). Используется Мойрами
 * (повторный доход) и Деметрой; перенаправление Цербером тут не учитывается.
 */
export function incomeFor(G: CycladesState, pid: PlayerID): number {
  let sum = 0;
  for (const t of Object.values(G.territories)) {
    if (isSea(t) && t.ownerId === pid && t.fleets > 0) sum += t.cornucopia + t.prosperity;
    if (isIsland(t) && t.ownerId === pid) sum += t.cornucopia + t.prosperity;
  }
  return sum;
}

/** Начисляет доход всем живым игрокам (с учётом Цербера, перенаправляющего доход острова). */
export function applyIncome(G: CycladesState): void {
  const credit: Record<PlayerID, number> = {};
  const give = (pid: PlayerID | null, n: number) => {
    if (!pid || n <= 0) return;
    const p = G.players[pid];
    if (!p || p.isEliminated) return;
    credit[pid] = (credit[pid] ?? 0) + n;
  };
  for (const t of Object.values(G.territories)) {
    if (isIsland(t) && t.ownerId) {
      // Доход острова забирает Цербер (если стоит), иначе владелец.
      give(cerberusOn(G, t.id) ?? t.ownerId, t.cornucopia + t.prosperity);
    } else if (isSea(t) && t.ownerId && t.fleets > 0) {
      give(t.ownerId, t.cornucopia + t.prosperity);
    }
  }
  for (const [pid, n] of Object.entries(credit)) {
    G.players[pid].gold += n;
    log(G, `${G.players[pid].name} получает ${n} золота с рогов изобилия.`);
  }
  collectNecropolisGold(G);
}

/**
 * Золото Некрополя забирает в фазе дохода владелец острова (или Цербер, если он
 * на этом острове — FAQ: Цербер забирает и ЗМ Некрополя). Золото лежит на
 * острове: при захвате достаётся новому владельцу, при переносе Некрополя
 * остаётся на старом острове до ближайшего дохода.
 */
export function collectNecropolisGold(G: CycladesState): void {
  for (const t of Object.values(G.territories)) {
    if (!isIsland(t) || t.necropolisGold <= 0) continue;
    const collector = cerberusOn(G, t.id) ?? t.ownerId;
    if (!collector) continue; // ничей остров без Цербера — золото ждёт владельца
    const amount = t.necropolisGold;
    G.players[collector].gold += amount;
    t.necropolisGold = 0;
    log(G, `${G.players[collector].name} забирает ${amount}🪙 с Некрополя (${t.name}).`);
  }
}
