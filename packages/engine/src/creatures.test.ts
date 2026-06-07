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
  G.creatures = { deck: ['satyrs', 'satyrs', 'nymph'], market: [...market], discard: [] };
  G.actions = { queue: [{ god: 'zeus', playerId: '0' }], index: 0, recruited: 0, built: false };
  return G;
}

describe('рынок существ', () => {
  it('стартовый рынок открывает 3 существа, в колоде остальное', () => {
    const m = createCreatureMarket();
    expect(m.market).toHaveLength(3);
    expect(m.deck.length).toBe(Object.keys(CREATURES).length * 2 - 3);
    expect(m.discard).toHaveLength(0);
  });

  it('Shuffle применяется, если передан', () => {
    const reversed = createCreatureMarket((a) => [...a].reverse());
    const normal = createCreatureMarket();
    expect(reversed.market).not.toEqual(normal.market);
  });
});

describe('покупка существ', () => {
  it('Сатиры дают 3 золота, существо уходит в сброс, рынок добирается', () => {
    const G = withMarket(['satyrs', 'nymph', 'minotaur']);
    const gold0 = G.players['0'].gold;
    expect(applyBuyCreature(G, '0', 0)).toBeNull();
    expect(G.players['0'].gold).toBe(gold0 + 3 - 1); // +3 эффект, −1 цена Сатиров
    expect(G.creatures.discard).toContain('satyrs');
    expect(G.creatures.market).toHaveLength(3); // добрали из колоды
    expect(G.actions!.creatureBought).toBe(true);
  });

  it('одно существо за активацию', () => {
    const G = withMarket(['satyrs', 'nymph', 'muse']);
    expect(applyBuyCreature(G, '0', 0)).toBeNull();
    expect(applyBuyCreature(G, '0', 0)).toBe('существо уже куплено в этот ход');
  });

  it('Минотавр требует свой остров и ставит 2 войска', () => {
    const G = withMarket(['minotaur', 'nymph', 'satyrs']);
    const isl = G.territories['home_n'];
    if (isl.kind !== 'island') throw new Error('home_n должен быть островом');
    const before = isl.troops;
    const supply = G.players['0'].troopsSupply;
    expect(applyBuyCreature(G, '0', 0, 'home_n')).toBeNull();
    expect(isl.troops).toBe(before + 2);
    expect(G.players['0'].troopsSupply).toBe(supply - 2);
    // на чужой остров — нельзя
    const G2 = withMarket(['minotaur', 'nymph', 'satyrs']);
    expect(applyBuyCreature(G2, '0', 0, 'home_e')).toBe('нужен свой остров');
  });

  it('Циклоп убивает вражеское войско и возвращает фигурку в запас врага', () => {
    const G = withMarket(['cyclops', 'nymph', 'satyrs']);
    const enemy = G.territories['home_e'];
    if (enemy.kind !== 'island') throw new Error('home_e должен быть островом');
    enemy.troops = 2;
    const enemySupply = G.players['1'].troopsSupply;
    expect(applyBuyCreature(G, '0', 0, 'home_e')).toBeNull();
    expect(enemy.troops).toBe(1);
    expect(G.players['1'].troopsSupply).toBe(enemySupply + 1);
  });

  it('нельзя купить без золота', () => {
    const G = withMarket(['minotaur', 'nymph', 'satyrs']);
    G.players['0'].gold = 0;
    expect(applyBuyCreature(G, '0', 0, 'home_n')).toBe('не хватает золота');
  });

  it('храм снижает цену существа (минимум 1)', () => {
    const G = withMarket(['minotaur', 'nymph', 'satyrs']);
    const isl = G.territories['home_n'];
    if (isl.kind === 'island') {
      isl.buildings.push({ type: 'temple', ownerId: '0' });
      isl.buildings.push({ type: 'temple', ownerId: '0' });
    }
    expect(creatureCost(G, '0', CREATURES.minotaur)).toBe(2); // 4 − 2 храма
    expect(creatureCost(G, '0', CREATURES.satyrs)).toBe(1); // не ниже 1
  });
});

describe('прокрутка колоды Зевсом', () => {
  it('меняет рынок за 1 золото, один раз за ход', () => {
    const G = withMarket(['minotaur', 'pegasus', 'cyclops']);
    const before = [...G.creatures.market];
    const gold0 = G.players['0'].gold;
    expect(applyCycleCreatures(G, '0')).toBeNull();
    expect(G.players['0'].gold).toBe(gold0 - 1);
    expect(G.creatures.market).not.toEqual(before);
    expect(G.creatures.discard).toEqual(expect.arrayContaining(before));
    expect(applyCycleCreatures(G, '0')).toBe('колода уже прокручена в этот ход');
  });
});
