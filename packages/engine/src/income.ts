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

/**
 * Доход игрока за цикл = сумма рогов изобилия на морских клетках, где стоит
 * его флот. Рога лежат на воде — кто держит там корабль, тот и получает золото.
 */
export function incomeFor(G: CycladesState, pid: PlayerID): number {
  let sum = 0;
  for (const t of Object.values(G.territories)) {
    // Рог на воде — доход тому, чей флот на клетке.
    if (isSea(t) && t.cornucopia > 0 && t.ownerId === pid && t.fleets > 0) {
      sum += t.cornucopia;
    }
    // Рог на суше — доход владельцу острова.
    if (t.kind === 'island' && t.cornucopia > 0 && t.ownerId === pid) {
      sum += t.cornucopia;
    }
  }
  return sum;
}

/** Начисляет доход всем живым игрокам. */
export function applyIncome(G: CycladesState): void {
  for (const pid of Object.keys(G.players)) {
    const p = G.players[pid];
    if (p.isEliminated) continue;
    const income = incomeFor(G, pid);
    if (income > 0) {
      p.gold += income;
      log(G, `${p.name} получает ${income} золота с рогов изобилия.`);
    }
  }
  collectNecropolisGold(G);
}

/**
 * Владелец острова с накопленным золотом Некрополя забирает его в фазе дохода.
 * Золото лежит на острове (а не на игроке), поэтому при захвате острова его
 * получает новый владелец, а при переносе Некрополя — старый остров сохраняет
 * накопленное до ближайшей фазы дохода (Модуль 2).
 */
export function collectNecropolisGold(G: CycladesState): void {
  for (const t of Object.values(G.territories)) {
    if (!isIsland(t) || t.necropolisGold <= 0) continue;
    if (!t.ownerId) continue; // ничей остров — золото ждёт владельца
    const amount = t.necropolisGold;
    G.players[t.ownerId].gold += amount;
    t.necropolisGold = 0;
    log(G, `${G.players[t.ownerId].name} забирает ${amount}🪙 с Некрополя (${t.name}).`);
  }
}
