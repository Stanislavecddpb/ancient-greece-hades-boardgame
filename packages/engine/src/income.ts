import type { CycladesState, PlayerID } from './types';
import { isSea } from './board';
import { log } from './helpers';

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
}
