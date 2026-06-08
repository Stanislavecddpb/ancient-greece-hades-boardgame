import { describe, it, expect } from 'vitest';
import type { Ctx } from 'boardgame.io';
import { setupGame } from './setup';
import {
  CREATURES,
  createCreatureMarket,
  creaturePriceAt,
  advanceCreatureMarket,
  applyBuyCreature,
  applyCycleCreatures,
} from './creatures';
import type { CycladesState } from './types';

function ctxFor(n: number): Ctx {
  return {
    numPlayers: n,
    playOrder: Array.from({ length: n }, (_, i) => String(i)),
    playOrderPos: 0,
    currentPlayer: '0',
    turn: 1,
    phase: 'actions',
    numMoves: 0,
  } as unknown as Ctx;
}

/** Готовит состояние с фазой действий и фиксированным рынком существ. */
function withMarket(market: string[], deck: string[] = ['fates', 'giant', 'dryad']): CycladesState {
  const G = setupGame(ctxFor(2));
  G.creatures = { deck: [...deck], market: [...market], discard: [] };
  G.actions = { queue: [{ god: 'zeus', playerId: '0' }], index: 0, recruited: 0, built: false };
  return G;
}

describe('рынок существ', () => {
  it('стартовый рынок открывает 3 существа, в колоде остальное', () => {
    const m = createCreatureMarket();
    expect(m.market).toHaveLength(3);
    expect(m.deck.length).toBe(Object.keys(CREATURES).length - 3);
    expect(m.discard).toHaveLength(0);
  });

  it('все id каталога — латиницей и без «the»', () => {
    for (const id of Object.keys(CREATURES)) expect(id).toMatch(/^[a-z]+$/);
    expect(CREATURES).toHaveProperty('kraken');
    expect(CREATURES).not.toHaveProperty('thekraken');
  });
});

describe('цена по позиции', () => {
  it('верхнее 4, среднее 3, нижнее 2', () => {
    const G = withMarket(['minotaur', 'dryad', 'fates']);
    expect(creaturePriceAt(G, '0', 0)).toBe(4);
    expect(creaturePriceAt(G, '0', 1)).toBe(3);
    expect(creaturePriceAt(G, '0', 2)).toBe(2);
  });

  it('храм снижает цену позиции (минимум 1)', () => {
    const G = withMarket(['kraken', 'dryad', 'fates']);
    const isl = G.territories['home_n'];
    if (isl.kind === 'island') {
      isl.buildings.push({ type: 'temple', ownerId: '0' });
      isl.buildings.push({ type: 'temple', ownerId: '0' });
    }
    expect(creaturePriceAt(G, '0', 0)).toBe(2); // 4 − 2 храма
    expect(creaturePriceAt(G, '0', 2)).toBe(1); // 2 − 2 = 0 → минимум 1
  });
});

describe('сдвиг рынка', () => {
  it('конец раунда/Зевс: нижнее в сброс, остальные дешевеют, сверху новое', () => {
    const c = { deck: ['d'], market: ['a', 'b', 'c'], discard: [] as string[] };
    advanceCreatureMarket(c);
    expect(c.market).toEqual(['d', 'a', 'b']); // a:4→3, b:3→2, c в сброс, d сверху
    expect(c.discard).toEqual(['c']);
  });

  it('Зевс сдвигает рынок на одну позицию (бесплатно, один раз за ход)', () => {
    const G = withMarket(['a', 'b', 'c'], ['d']);
    const gold0 = G.players['0'].gold;
    expect(applyCycleCreatures(G, '0')).toBeNull();
    expect(G.creatures.market).toEqual(['d', 'a', 'b']);
    expect(G.creatures.discard).toEqual(['c']);
    expect(G.players['0'].gold).toBe(gold0); // бесплатно
    expect(applyCycleCreatures(G, '0')).toBe('колода уже прокручена в этот ход');
  });
});

describe('покупка существ', () => {
  it('покупка снизу (за 2): купленное в сброс, остальные дешевеют, сверху новое', () => {
    const G = withMarket(['a', 'b', 'minotaur'], ['d']); // minotaur снизу (за 2), цель — остров
    G.players['0'].gold = 9;
    const isl = G.territories['home_n'];
    if (isl.kind !== 'island') throw new Error('home_n');
    const gold0 = G.players['0'].gold;
    expect(applyBuyCreature(G, '0', 2, 'home_n')).toBeNull();
    expect(G.players['0'].gold).toBe(gold0 - 2); // нижний слот — 2
    expect(G.creatures.market).toEqual(['d', 'a', 'b']);
    expect(G.creatures.discard).toContain('minotaur');
  });

  it('Грифон сверху стоит 4 и крадёт половину золота', () => {
    const G = withMarket(['griffon', 'dryad', 'fates']);
    G.players['0'].gold = 5; G.players['1'].gold = 8;
    expect(applyBuyCreature(G, '0', 0)).toBeNull(); // верхний слот — 4
    expect(G.players['1'].gold).toBe(8 - 4);
    expect(G.players['0'].gold).toBe(5 + 4 - 4);
  });

  it('одно существо за активацию', () => {
    const G = withMarket(['fates', 'dryad', 'giant']);
    expect(applyBuyCreature(G, '0', 0)).toBeNull();
    expect(applyBuyCreature(G, '0', 1)).toBe('существо уже куплено в этот ход');
  });

  it('Минотавр ставит 2 войска на свой остров', () => {
    const G = withMarket(['minotaur', 'dryad', 'fates']);
    G.players['0'].gold = 9;
    const isl = G.territories['home_n'];
    if (isl.kind !== 'island') throw new Error('home_n');
    const before = isl.troops;
    const supply = G.players['0'].troopsSupply;
    expect(applyBuyCreature(G, '0', 0, 'home_n')).toBeNull();
    expect(isl.troops).toBe(before + 2);
    expect(G.players['0'].troopsSupply).toBe(supply - 2);
  });
});
