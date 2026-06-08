import { describe, it, expect } from 'vitest';
import type { Ctx } from 'boardgame.io';
import { setupGame } from './setup';
import {
  CREATURES,
  createCreatureMarket,
  creatureCost,
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
function withMarket(market: string[]): CycladesState {
  const G = setupGame(ctxFor(2));
  G.creatures = { deck: ['fates', 'giant', 'dryad'], market: [...market], discard: [] };
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
    for (const id of Object.keys(CREATURES)) {
      expect(id).toMatch(/^[a-z]+$/);
    }
    expect(CREATURES).toHaveProperty('kraken');
    expect(CREATURES).toHaveProperty('chimera');
    expect(CREATURES).not.toHaveProperty('thekraken');
  });
});

describe('эффекты существ', () => {
  it('Минотавр требует свой остров и ставит 2 войска', () => {
    const G = withMarket(['minotaur', 'dryad', 'fates']);
    const isl = G.territories['home_n'];
    if (isl.kind !== 'island') throw new Error('home_n');
    const before = isl.troops;
    const supply = G.players['0'].troopsSupply;
    expect(applyBuyCreature(G, '0', 0, 'home_n')).toBeNull();
    expect(isl.troops).toBe(before + 2);
    expect(G.players['0'].troopsSupply).toBe(supply - 2);
    expect(G.actions!.creatureBought).toBe(true);
  });

  it('Кракен топит весь вражеский флот в зоне', () => {
    const G = withMarket(['kraken', 'dryad', 'fates']);
    const sea = Object.values(G.territories).find((t) => t.kind === 'sea')!;
    if (sea.kind !== 'sea') throw new Error('sea');
    sea.ownerId = '1'; sea.fleets = 3;
    G.players['1'].fleetsSupply = 0; // чтобы возврат 3 фигурок не упёрся в лимит запаса
    expect(applyBuyCreature(G, '0', 0, sea.id)).toBeNull();
    expect(sea.fleets).toBe(0);
    expect(sea.ownerId).toBeNull();
    expect(G.players['1'].fleetsSupply).toBe(3);
  });

  it('Грифон крадёт половину золота богатейшего соперника', () => {
    const G = withMarket(['griffon', 'dryad', 'fates']);
    G.players['0'].gold = 5; G.players['1'].gold = 8;
    expect(applyBuyCreature(G, '0', 0)).toBeNull(); // griffon — без цели
    expect(G.players['1'].gold).toBe(8 - 4);
    // +4 украдено, −3 цена грифона
    expect(G.players['0'].gold).toBe(5 + 4 - 3);
  });

  it('одно существо за активацию', () => {
    const G = withMarket(['fates', 'dryad', 'giant']);
    expect(applyBuyCreature(G, '0', 0)).toBeNull();
    expect(applyBuyCreature(G, '0', 1)).toBe('существо уже куплено в этот ход');
  });

  it('храм снижает цену существа (минимум 1)', () => {
    const G = withMarket(['kraken', 'dryad', 'fates']);
    const isl = G.territories['home_n'];
    if (isl.kind === 'island') {
      isl.buildings.push({ type: 'temple', ownerId: '0' });
      isl.buildings.push({ type: 'temple', ownerId: '0' });
    }
    expect(creatureCost(G, '0', CREATURES.kraken)).toBe(2); // 4 − 2 храма
    expect(creatureCost(G, '0', CREATURES.dryad)).toBe(1); // не ниже 1
  });
});

describe('прокрутка колоды Зевсом', () => {
  it('бесплатно меняет рынок, один раз за ход', () => {
    const G = withMarket(['minotaur', 'pegasus', 'cyclops']);
    const before = [...G.creatures.market];
    const gold0 = G.players['0'].gold;
    expect(applyCycleCreatures(G, '0')).toBeNull();
    expect(G.players['0'].gold).toBe(gold0); // бесплатно
    expect(G.creatures.market).not.toEqual(before);
    expect(G.creatures.discard).toEqual(expect.arrayContaining(before));
    expect(applyCycleCreatures(G, '0')).toBe('колода уже прокручена в этот ход');
  });
});
