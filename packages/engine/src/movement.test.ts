import { describe, it, expect } from 'vitest';
import type { Ctx } from 'boardgame.io';
import { setupGame } from './setup';
import { startFleetMove, hopFleet, troopReachable, applyTroopMove, applyCombatRound, applyCombatRetreat } from './movement';
import { placeBoardCreature } from './creatures';
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

describe('приказ флоту (Посейдон)', () => {
  /** Своя клетка с флотом и соседняя пустая морская клетка. */
  function adjEmpty(G: CycladesState) {
    const a = freshSeas(G).find((s) => s.ownerId === '0' && s.fleets > 0
      && s.adjacentSeas.some((nb) => { const t = G.territories[nb]; return t && isSea(t) && t.fleets === 0; }))!;
    const bId = a.adjacentSeas.find((nb) => { const t = G.territories[nb]; return t && isSea(t) && t.fleets === 0; })!;
    return { a, b: G.territories[bId] as Sea };
  }

  it('переход в соседнюю пустую клетку стоит 1 монету', () => {
    const G = setupGame(ctxFor(2));
    G.players['0'].gold = 5;
    const { a, b } = adjEmpty(G);
    const moved = a.fleets;
    expect(startFleetMove(G, '0', a.id)).toBeNull();
    expect(hopFleet(G, '0', b.id, moved)).toBeNull();
    expect(b.fleets).toBe(moved);
    expect(a.fleets).toBe(0);
    expect(G.players['0'].gold).toBe(4); // списана 1 монета
  });

  it('нельзя начать приказ без монеты', () => {
    const G = setupGame(ctxFor(2));
    const { a } = adjEmpty(G);
    G.players['0'].gold = 0;
    expect(startFleetMove(G, '0', a.id)).toBe('нужна 1 монета');
  });

  it('высадка по пути: часть кораблей остаётся, часть идёт дальше', () => {
    const G = setupGame(ctxFor(2));
    G.players['0'].gold = 5;
    // Строим цепочку из трёх своих/пустых клеток a→b→c.
    const a = freshSeas(G).find((s) => {
      const b = s.adjacentSeas.map((id) => G.territories[id]).find((t) => t && isSea(t) && t.fleets === 0) as Sea | undefined;
      if (!b) return false;
      const c = b.adjacentSeas.map((id) => G.territories[id]).find((t) => t && isSea(t) && t.fleets === 0 && t.id !== s.id) as Sea | undefined;
      return !!c;
    })!;
    const b = a.adjacentSeas.map((id) => G.territories[id]).find((t) => t && isSea(t) && t.fleets === 0) as Sea;
    const c = b.adjacentSeas.map((id) => G.territories[id]).find((t) => t && isSea(t) && t.fleets === 0 && t.id !== a.id) as Sea;
    a.ownerId = '0'; a.fleets = 3;

    expect(startFleetMove(G, '0', a.id)).toBeNull();
    expect(hopFleet(G, '0', b.id, 3)).toBeNull();   // ведём все 3 в b
    expect(hopFleet(G, '0', c.id, 2)).toBeNull();   // 2 идут в c, 1 остаётся в b
    expect(b.fleets).toBe(1);
    expect(c.fleets).toBe(2);
    expect(G.players['0'].gold).toBe(4); // одна монета на весь приказ
  });

  it('дальность ограничена 3 переходами', () => {
    const G = setupGame(ctxFor(2));
    G.players['0'].gold = 9;
    const own = freshSeas(G).find((s) => s.ownerId === '0' && s.fleets > 0)!;
    expect(startFleetMove(G, '0', own.id)).toBeNull();
    expect(G.fleetMove!.stepsLeft).toBe(3);
  });

  it('морской бой: перевес атакующего захватывает клетку', () => {
    const G = setupGame(ctxFor(2));
    G.players['0'].gold = 5;
    const a = freshSeas(G).find((s) => s.adjacentSeas.some((nb) => { const t = G.territories[nb]; return t && isSea(t); }))!;
    const bId = a.adjacentSeas.find((nb) => { const t = G.territories[nb]; return t && isSea(t); })!;
    const b = G.territories[bId] as Sea;
    a.ownerId = '0'; a.fleets = 3;
    b.ownerId = '1'; b.fleets = 1;
    expect(startFleetMove(G, '0', a.id)).toBeNull();
    expect(hopFleet(G, '0', b.id, 3)).toBeNull();
    expect(G.combat).not.toBeNull(); // бой начался
    expect(G.fleetMove).toBeNull();  // приказ завершён
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

  it('Минотавр на острове даёт +2 к защите при штурме', () => {
    const G = setupGame(ctxFor(2));
    G.players['0'].gold = 5;
    const home = G.territories['home_n'];
    if (!isIsland(home)) throw new Error('home');
    home.ownerId = '0'; home.troops = 3;
    let target: string | null = null;
    for (const sid of home.adjacentSeas) {
      const s = G.territories[sid];
      if (!isSea(s)) continue;
      s.ownerId = '0'; s.fleets = 1;
      const other = s.adjacentIslands.find((iid) => iid !== 'home_n');
      if (other) { target = other; break; }
    }
    const enemy = G.territories[target!];
    if (!isIsland(enemy)) throw new Error('enemy');
    enemy.ownerId = '1'; enemy.troops = 1; enemy.buildings = [];
    placeBoardCreature(G, 'minotaur', '1', target!); // фигура Минотавра на защищаемом острове
    expect(applyTroopMove(G, '0', 'home_n', target!, 2)).toBeNull();
    expect(G.combat!.defenderBonus).toBe(2); // крепостей нет, но Минотавр даёт +2
  });
});

describe('интерактивный бой', () => {
  function setupNavalFight() {
    const G = setupGame(ctxFor(2));
    G.players['0'].gold = 5;
    const a = freshSeas(G).find((s) => s.adjacentSeas.some((nb) => isSea(G.territories[nb])))!;
    const bId = a.adjacentSeas.find((nb) => isSea(G.territories[nb]))!;
    const b = G.territories[bId] as Sea;
    a.ownerId = '0'; a.fleets = 2;
    b.ownerId = '1'; b.fleets = 2;
    startFleetMove(G, '0', a.id);
    hopFleet(G, '0', b.id, 2); // атакуем всеми двумя
    return { G, a, b };
  }

  it('отступление возвращает выживших на исходную клетку', () => {
    const { G, a, b } = setupNavalFight();
    expect(a.fleets).toBe(0); // флот «в пути»
    expect(G.combat).not.toBeNull();
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
    const { G, b } = setupNavalFight();
    expect(applyCombatRound(G, '1', always(0))).toBe('не ваш бой');
    void b;
  });
});

describe('фигуры существ в движении', () => {
  it('Медуза запрещает уводить войска с острова', () => {
    const G = setupGame(ctxFor(2));
    const home = G.territories['home_n'];
    if (!isIsland(home)) throw new Error('home');
    home.ownerId = '0'; home.troops = 3;
    for (const sid of home.adjacentSeas) {
      const s = G.territories[sid];
      if (isSea(s)) { s.ownerId = '0'; s.fleets = 1; }
    }
    placeBoardCreature(G, 'medusa', '1', 'home_n');
    expect(troopReachable(G, 'home_n', '0').size).toBe(0);
    G.players['0'].gold = 5;
    expect(applyTroopMove(G, '0', 'home_n', 'home_e', 1)).toBe('остров под Медузой: войска нельзя уводить');
  });

  it('Кракен закрывает морскую зону для флота', () => {
    const G = setupGame(ctxFor(2));
    G.players['0'].gold = 5;
    const a = freshSeas(G).find((s) => s.adjacentSeas.some((nb) => isSea(G.territories[nb])))!;
    const bId = a.adjacentSeas.find((nb) => isSea(G.territories[nb]))!;
    a.ownerId = '0'; a.fleets = 1;
    placeBoardCreature(G, 'kraken', '1', bId);
    startFleetMove(G, '0', a.id);
    expect(hopFleet(G, '0', bId, 1)).toBe('зона закрыта (Кракен/Полифем)');
  });

  it('Полифем не пускает флот в соседние зоны своего острова', () => {
    const G = setupGame(ctxFor(2));
    G.players['0'].gold = 5;
    // ищем море, соседнее с островом, и своё море рядом с этим морем
    const isl = Object.values(G.territories).find(isIsland)!;
    const adjSeaId = isl.adjacentSeas.find((sid) => isSea(G.territories[sid]))!;
    const adjSea = G.territories[adjSeaId] as Sea;
    const myId = adjSea.adjacentSeas.find((sid) => isSea(G.territories[sid]))!;
    const my = G.territories[myId] as Sea;
    my.ownerId = '0'; my.fleets = 1;
    placeBoardCreature(G, 'polyphemus', '1', isl.id);
    startFleetMove(G, '0', myId);
    expect(hopFleet(G, '0', adjSeaId, 1)).toBe('зона закрыта (Кракен/Полифем)');
  });
});
