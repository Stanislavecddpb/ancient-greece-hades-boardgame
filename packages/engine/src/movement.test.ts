import { describe, it, expect } from 'vitest';
import type { Ctx } from 'boardgame.io';
import { setupGame } from './setup';
import { fleetReachable, applyFleetMove, troopReachable, applyTroopMove, applyCombatRound, applyCombatRetreat } from './movement';
import { isSea, isIsland } from './board';
import type { CycladesState, Sea } from './types';

function ctxFor(n: number): Ctx {
  return { numPlayers: n, playOrder: Array.from({ length: n }, (_, i) => String(i)), playOrderPos: 0, currentPlayer: '0' } as unknown as Ctx;
}
const always = (v: number) => () => v;

function freshSeas(G: CycladesState): Sea[] {
  return Object.values(G.territories).filter(isSea);
}

/** Доводит текущий бой до конца раундами с фиксированным броском. */
function fightToEnd(G: CycladesState, pid: string, roll = 0): void {
  let guard = 0;
  while (G.combat && guard++ < 50) applyCombatRound(G, pid, always(roll));
}

describe('движение флота', () => {
  it('флот перемещается на пустую соседнюю клетку', () => {
    const G = setupGame(ctxFor(2));
    const own = freshSeas(G).find((s) => s.ownerId === '0' && s.fleets > 0)!;
    const reach = fleetReachable(G, own.id, '0');
    expect(reach.size).toBeGreaterThan(0);
    const destId = [...reach].find((id) => {
      const t = G.territories[id];
      return t && isSea(t) && t.fleets === 0;
    })!;
    const moved = own.fleets;
    expect(applyFleetMove(G, '0', own.id, destId)).toBeNull();
    expect((G.territories[destId] as Sea).fleets).toBe(moved);
    expect(own.fleets).toBe(0);
  });

  it('морской бой: перевес атакующего захватывает клетку', () => {
    const G = setupGame(ctxFor(2));
    // Берём две соседние морские клетки.
    const a = freshSeas(G).find((s) => s.adjacentSeas.some((nb) => { const t = G.territories[nb]; return t && isSea(t); }))!;
    const bId = a.adjacentSeas.find((nb) => { const t = G.territories[nb]; return t && isSea(t); })!;
    const b = G.territories[bId] as Sea;
    a.ownerId = '0'; a.fleets = 3;
    b.ownerId = '1'; b.fleets = 1;
    expect(applyFleetMove(G, '0', a.id, b.id)).toBeNull();
    expect(G.combat).not.toBeNull(); // бой начался, ждёт раундов
    fightToEnd(G, '0');
    expect(b.ownerId).toBe('0');
    expect(b.fleets).toBe(3);
    expect(a.fleets).toBe(0);
  });
});

describe('движение войск', () => {
  it('войска ходят по мосту из флотов и захватывают вражеский остров', () => {
    const G = setupGame(ctxFor(2));
    const home = G.territories['home_n'];
    if (!isIsland(home)) throw new Error('home');
    home.ownerId = '0'; home.troops = 3;
    // Ставим свой флот на соседнюю клетку и находим вражеский остров у этой клетки.
    let target: string | null = null;
    for (const sid of home.adjacentSeas) {
      const s = G.territories[sid];
      if (!isSea(s)) continue;
      s.ownerId = '0'; s.fleets = 1;
      const other = s.adjacentIslands.find((iid) => iid !== 'home_n');
      if (other) { target = other; break; }
    }
    expect(target).toBeTruthy();
    const enemy = G.territories[target!];
    if (!isIsland(enemy)) throw new Error('enemy');
    enemy.ownerId = '1'; enemy.troops = 1; enemy.buildings = [];

    expect(troopReachable(G, 'home_n', '0').has(target!)).toBe(true);
    expect(applyTroopMove(G, '0', 'home_n', target!, 2)).toBeNull();
    expect(G.combat).not.toBeNull();
    fightToEnd(G, '0');
    expect(enemy.ownerId).toBe('0');
    expect(enemy.troops).toBe(2);
  });
});

describe('интерактивный бой', () => {
  function setupNavalFight() {
    const G = setupGame(ctxFor(2));
    const a = freshSeas(G).find((s) => s.adjacentSeas.some((nb) => isSea(G.territories[nb])))!;
    const bId = a.adjacentSeas.find((nb) => isSea(G.territories[nb]))!;
    const b = G.territories[bId] as Sea;
    a.ownerId = '0'; a.fleets = 2;
    b.ownerId = '1'; b.fleets = 2;
    return { G, a, b };
  }

  it('отступление возвращает выживших на исходную клетку', () => {
    const { G, a, b } = setupNavalFight();
    expect(applyFleetMove(G, '0', a.id, b.id)).toBeNull();
    expect(a.fleets).toBe(0); // флот «в пути»
    // один раунд по равенству (бросок 0) — обе стороны теряют по фишке
    applyCombatRound(G, '0', always(0));
    expect(G.combat!.attackerUnits).toBe(1);
    expect(G.combat!.defenderUnits).toBe(1);
    // отступаем
    expect(applyCombatRetreat(G, '0')).toBeNull();
    expect(G.combat).toBeNull();
    expect(a.fleets).toBe(1); // выживший вернулся
    expect(a.ownerId).toBe('0');
    expect(b.ownerId).toBe('1'); // защитник удержал клетку
  });

  it('чужой не может управлять боем', () => {
    const { G, a, b } = setupNavalFight();
    applyFleetMove(G, '0', a.id, b.id);
    expect(applyCombatRound(G, '1', always(0))).toBe('не ваш бой');
    void b;
  });
});
