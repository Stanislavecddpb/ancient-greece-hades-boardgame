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
  placeBoardCreature,
  expireBoardCreatures,
  applySellUnits,
  applyChimeraReplay,
  endChimera,
} from './creatures';
import { applyPegasusMove } from './movement';
import type { CycladesState, Sea } from './types';

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
  it('покупка снизу (за 2): купленное в сброс, слот — рубашкой (null), без сдвига', () => {
    const G = withMarket(['a', 'b', 'minotaur'], ['d']); // minotaur снизу (за 2), цель — остров
    G.players['0'].gold = 9;
    const isl = G.territories['home_n'];
    if (isl.kind !== 'island') throw new Error('home_n');
    const gold0 = G.players['0'].gold;
    expect(applyBuyCreature(G, '0', 2, 'home_n')).toBeNull();
    expect(G.players['0'].gold).toBe(gold0 - 2); // нижний слот — 2
    expect(G.creatures.market).toEqual(['a', 'b', null]); // слот пуст, остальные на месте
    expect(G.creatures.discard).toContain('minotaur');
    // прокрутка заполняет: верхнее съезжает вниз, сверху новое из колоды
    advanceCreatureMarket(G.creatures);
    expect(G.creatures.market).toEqual(['d', 'a', 'b']);
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

});

describe('фигуры существ на доске', () => {
  it('фигурное существо ставится на доску (без мгновенного эффекта), слот — рубашкой', () => {
    const G = withMarket(['minotaur', 'a', 'b']);
    G.players['0'].gold = 9;
    const isl = G.territories['home_n'];
    const troopsBefore = isl.kind === 'island' ? isl.troops : 0;
    expect(applyBuyCreature(G, '0', 0, 'home_n')).toBeNull();
    expect(G.boardCreatures).toHaveLength(1);
    expect(G.boardCreatures[0]).toMatchObject({ kind: 'minotaur', ownerId: '0', location: 'home_n' });
    expect(G.creatures.market[0]).toBeNull();
    if (isl.kind === 'island') expect(isl.troops).toBe(troopsBefore); // войска НЕ добавились
  });

  it('две фигуры на одной клетке уничтожают друг друга', () => {
    const G = setupGame(ctxFor(2));
    placeBoardCreature(G, 'minotaur', '0', 'home_n');
    expect(G.boardCreatures).toHaveLength(1);
    placeBoardCreature(G, 'chiron', '1', 'home_n');
    expect(G.boardCreatures).toHaveLength(0);
  });

  it('фигура снимается в начале хода владельца в следующем цикле', () => {
    const G = setupGame(ctxFor(2));
    placeBoardCreature(G, 'minotaur', '0', 'home_n'); // placedCycle = 1
    G.cycle = 2;
    expireBoardCreatures(G, '1'); // чужой ход — не снимает
    expect(G.boardCreatures).toHaveLength(1);
    expireBoardCreatures(G, '0'); // ход владельца — снимает
    expect(G.boardCreatures).toHaveLength(0);
  });

  it('Кракен при покупке топит флот в выбранной зоне и встаёт фигурой', () => {
    const G = withMarket(['kraken', 'a', 'b']);
    G.players['0'].gold = 9;
    const sea = Object.values(G.territories).find((t) => t.kind === 'sea')!;
    if (sea.kind !== 'sea') throw new Error('sea');
    sea.ownerId = '1'; sea.fleets = 2;
    G.players['1'].fleetsSupply = 0;
    expect(applyBuyCreature(G, '0', 0, sea.id)).toBeNull();
    expect(sea.fleets).toBe(0);
    expect(sea.ownerId).toBeNull();
    expect(G.players['1'].fleetsSupply).toBe(2);
    expect(G.boardCreatures.some((c) => c.kind === 'kraken' && c.location === sea.id)).toBe(true);
  });

  it('Сфинкс: покупка открывает распродажу, sellUnits продаёт выбранное по 2🪙', () => {
    const G = withMarket(['sphinx', 'a', 'b']);
    G.players['0'].gold = 9;
    expect(applyBuyCreature(G, '0', 0)).toBeNull();
    expect(G.sphinxResell).toBe('0');
    G.players['0'].priests = 2; G.players['0'].philosophers = 1;
    const gold0 = G.players['0'].gold;
    expect(applySellUnits(G, '0', 0, 0, 1, 1)).toBeNull(); // продать 1 жреца + 1 философа
    expect(G.players['0'].priests).toBe(1);
    expect(G.players['0'].philosophers).toBe(0);
    expect(G.players['0'].gold).toBe(gold0 + 4); // 2 юнита × 2
    expect(G.sphinxResell).toBeNull();
  });

  it('Хирон защищает остров от Гиганта/Гарпии', () => {
    const G = withMarket(['giant', 'a', 'b']);
    G.players['0'].gold = 9;
    const enemy = G.territories['home_e'];
    if (enemy.kind === 'island') { enemy.ownerId = '1'; enemy.buildings = [{ type: 'port', ownerId: '1' }]; }
    placeBoardCreature(G, 'chiron', '1', 'home_e');
    expect(applyBuyCreature(G, '0', 0, 'home_e')).toBe('остров под защитой Хирона');
  });
});

describe('Пегас', () => {
  it('покупка открывает переброску; войска едут со своего острова на свой без моста', () => {
    const G = withMarket(['pegasus', 'a', 'b']);
    G.players['0'].gold = 9;
    expect(applyBuyCreature(G, '0', 0)).toBeNull();
    expect(G.pegasusMove).toBe('0');
    const a = G.territories['home_n'];
    const b = G.territories['home_e'];
    if (a.kind === 'island') { a.ownerId = '0'; a.troops = 3; }
    if (b.kind === 'island') { b.ownerId = '0'; b.troops = 0; }
    expect(applyPegasusMove(G, '0', 'home_n', 'home_e', 2)).toBeNull();
    if (a.kind === 'island') expect(a.troops).toBe(1);
    if (b.kind === 'island') expect(b.troops).toBe(2);
    expect(G.pegasusMove).toBeNull();
  });

  it('нельзя перебросить на чужой остров', () => {
    const G = withMarket(['pegasus', 'a', 'b']);
    G.players['0'].gold = 9;
    applyBuyCreature(G, '0', 0);
    const a = G.territories['home_n'];
    const b = G.territories['home_e'];
    if (a.kind === 'island') { a.ownerId = '0'; a.troops = 3; }
    if (b.kind === 'island') { b.ownerId = '1'; b.troops = 1; }
    expect(applyPegasusMove(G, '0', 'home_n', 'home_e', 1)).toBe('цель — не ваш остров');
  });
});

describe('Сирена', () => {
  it('убирает вражеский корабль и занимает опустевшую зону своим из запаса', () => {
    const G = withMarket(['siren', 'a', 'b']);
    G.players['0'].gold = 9;
    const sea = Object.values(G.territories).find((t): t is Sea => t.kind === 'sea')!;
    sea.ownerId = '1'; sea.fleets = 1;
    G.players['1'].fleetsSupply = 0;
    G.players['0'].fleetsSupply = 3;
    expect(applyBuyCreature(G, '0', 0, sea.id)).toBeNull();
    expect(sea.fleets).toBe(1);
    expect(sea.ownerId).toBe('0');
    expect(G.players['1'].fleetsSupply).toBe(1); // вражеский вернулся в запас
    expect(G.players['0'].fleetsSupply).toBe(2); // свой ушёл из запаса на доску
  });

  it('без запаса берёт корабль с другой своей зоны', () => {
    const G = withMarket(['siren', 'a', 'b']);
    G.players['0'].gold = 9;
    const seas = Object.values(G.territories).filter((t): t is Sea => t.kind === 'sea');
    const enemySea = seas[0];
    const ownSea = seas[1];
    enemySea.ownerId = '1'; enemySea.fleets = 1;
    ownSea.ownerId = '0'; ownSea.fleets = 1;
    G.players['0'].fleetsSupply = 0;
    expect(applyBuyCreature(G, '0', 0, enemySea.id)).toBeNull();
    expect(enemySea.fleets).toBe(1);
    expect(enemySea.ownerId).toBe('0');
    expect(ownSea.fleets).toBe(0);
    expect(ownSea.ownerId).toBeNull();
  });
});

describe('Химера', () => {
  it('разыгрывает существо из сброса, затем сброс уходит в колоду', () => {
    const G = withMarket(['chimera', 'a', 'b']);
    G.players['0'].gold = 9; G.players['1'].gold = 8;
    G.creatures.discard = ['griffon'];
    expect(applyBuyCreature(G, '0', 0)).toBeNull(); // верхний слот — 4
    expect(G.chimeraPick).toBe('0');
    expect(G.creatures.discard).toContain('chimera');
    expect(applyChimeraReplay(G, '0', 'griffon')).toBeNull(); // крадёт половину золота
    expect(G.players['1'].gold).toBe(4);
    expect(G.players['0'].gold).toBe(9 - 4 + 4);
    expect(G.chimeraPick).toBeNull();
    expect(G.creatures.discard).toHaveLength(0);
    expect(G.creatures.deck).toContain('griffon');
    expect(G.creatures.deck).toContain('chimera');
  });

  it('нельзя разыграть фигурное существо', () => {
    const G = withMarket(['chimera', 'a', 'b']);
    G.players['0'].gold = 9;
    G.creatures.discard = ['kraken'];
    applyBuyCreature(G, '0', 0);
    expect(applyChimeraReplay(G, '0', 'kraken')).toBe('Химерой нельзя разыграть это существо');
  });

  it('endChimera перетасовывает сброс без розыгрыша', () => {
    const G = withMarket(['chimera', 'a', 'b']);
    G.players['0'].gold = 9;
    G.creatures.discard = ['dryad'];
    applyBuyCreature(G, '0', 0);
    expect(endChimera(G, '0')).toBeNull();
    expect(G.chimeraPick).toBeNull();
    expect(G.creatures.discard).toHaveLength(0);
    expect(G.creatures.deck).toContain('dryad');
  });
});
