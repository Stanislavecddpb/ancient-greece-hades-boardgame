import type { CycladesState, PlayerID } from './types';
import { islandsOf, log } from './helpers';

/** Доход игрока за цикл = сумма prosperity его островов. */
export function incomeFor(G: CycladesState, pid: PlayerID): number {
  return islandsOf(G, pid).reduce((sum, i) => sum + i.prosperity, 0);
}

/** Начисляет доход всем живым игрокам. */
export function applyIncome(G: CycladesState): void {
  for (const pid of Object.keys(G.players)) {
    const p = G.players[pid];
    if (p.isEliminated) continue;
    const income = incomeFor(G, pid);
    p.gold += income;
    log(G, `${p.name} получает ${income} золота (доход).`);
  }
}
