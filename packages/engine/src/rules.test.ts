import { describe, it, expect } from 'vitest';
import type { Ctx } from 'boardgame.io';
import { setupGame } from './setup';
import { incomeFor, applyIncome } from './income';
import {
  godsForCycle,
  setupAuction,
  applyBid,
  applyApollo,
  auctionComplete,
  resolveAuction,
  paymentFor,
} from './auction';
import { applyRecruit, applyBuild, advanceTurn } from './actions';
import { checkMetropolis, applyPlaceMetropolis } from './metropolis';
import { metropolisCount, islandsOf, freeSlots } from './helpers';
import { CycladesGame } from './game';
import type { CycladesState } from './types';

function ctxFor(n: number): Ctx {
  const playOrder = Array.from({ length: n }, (_, i) => String(i));
  return {
    numPlayers: n,
    playOrder,
    playOrderPos: 0,
    currentPlayer: '0',
    turn: 1,
    phase: 'auction',
    numMoves: 0,
  } as unknown as Ctx;
}

describe('setup', () => {
  it('раздаёт домашние острова, золото и стартовые юниты (2 игрока)', () => {
    const ctx = ctxFor(2);
    const G = setupGame(ctx);
    expect(Object.keys(G.players)).toHaveLength(2);
    expect(G.players['0'].gold).toBe(5);
    // Красный (0) ставит войска на Афины (2,1) и Серифос (7,6).
    expect(G.territories['home_n'].kind === 'island' && G.territories['home_n'].ownerId).toBe('0');
    expect(G.territories['serifos'].kind === 'island' && G.territories['serifos'].ownerId).toBe('0');
    // Чёрный (1) — на Спарту (3,5) и Коринф (7,1).
    expect(G.territories['home_e'].kind === 'island' && G.territories['home_e'].ownerId).toBe('1');
    const ath = G.territories['home_n'];
    if (ath.kind === 'island') expect(ath.troops).toBe(1);
    // По 2 флота у каждого из 2 игроков.
    const fleets = Object.values(G.territories).filter((t) => t.kind === 'sea' && t.fleets > 0);
    expect(fleets).toHaveLength(4);
  });
});

describe('доход', () => {
  it('начисляет золото за рога изобилия, занятые флотом', () => {
    const ctx = ctxFor(2);
    const G = setupGame(ctx);
    // Обнуляем флоты и владение островами, чтобы считать только заданный рог.
    for (const t of Object.values(G.territories)) {
      if (t.kind === 'sea') { t.fleets = 0; t.ownerId = null; }
      if (t.kind === 'island') t.ownerId = null;
    }
    const corn = Object.values(G.territories).find((t) => t.kind === 'sea' && t.cornucopia > 0);
    expect(corn).toBeDefined();
    if (corn && corn.kind === 'sea') {
      corn.ownerId = '0';
      corn.fleets = 1;
      expect(incomeFor(G, '0')).toBe(1);
    }
    const before1 = G.players['1'].gold;
    applyIncome(G);
    expect(G.players['1'].gold).toBe(before1);
    expect(G.players['0'].gold).toBe(5 + 1);
  });

  it('всего на доске 6 рогов изобилия', () => {
    const G = setupGame(ctxFor(2));
    const total = Object.values(G.territories).filter((t) => t.kind === 'sea' && t.cornucopia > 0).length;
    expect(total).toBe(6);
  });
});

describe('аукцион', () => {
  it('godsForCycle выдаёт (игроки−1) богов и ротируется по циклам', () => {
    expect(godsForCycle(4, 1)).toEqual(['ares', 'poseidon', 'zeus']);
    expect(godsForCycle(2, 1)).toEqual(['ares']);
    expect(godsForCycle(2, 2)).toEqual(['poseidon']);
    expect(godsForCycle(5, 1)).toEqual(['ares', 'poseidon', 'zeus', 'athena']);
  });

  it('вытеснение: перебитый игрок снова ходит и оплата считается с учётом жрецов', () => {
    const ctx = ctxFor(2);
    const G = setupGame(ctx);
    // Ручной аукцион с двумя богами для проверки вытеснения.
    G.auction = {
      slots: [
        { god: 'ares', occupantId: null, bid: 0 },
        { god: 'poseidon', occupantId: null, bid: 0 },
      ],
      apollo: [],
      toAct: '0',
    };

    expect(applyBid(G, ctx, '0', 'ares', 2)).toBeNull(); // '0' встаёт на Ареса
    expect(G.auction!.toAct).toBe('1');
    expect(applyBid(G, ctx, '1', 'ares', 3)).toBeNull(); // '1' перебивает, '0' вытеснен
    expect(G.auction!.toAct).toBe('0');
    expect(auctionComplete(G, ctx)).toBe(false);
    expect(applyBid(G, ctx, '0', 'poseidon', 1)).toBeNull(); // '0' уходит на Посейдона
    expect(auctionComplete(G, ctx)).toBe(true);

    const gold0 = G.players['0'].gold;
    const gold1 = G.players['1'].gold;
    resolveAuction(G, ctx);
    expect(G.players['1'].gold).toBe(gold1 - 3); // Арес за 3
    expect(G.players['0'].gold).toBe(gold0 - 1); // Посейдон за 1
  });

  it('выбитый игрок переставляет ставку сразу, а не после следующего по кругу', () => {
    const ctx = ctxFor(3);
    const G = setupGame(ctx);
    G.auction = {
      slots: [
        { god: 'ares', occupantId: null, bid: 0 },
        { god: 'poseidon', occupantId: null, bid: 0 },
      ],
      apollo: [],
      toAct: '0',
    };

    expect(applyBid(G, ctx, '0', 'ares', 2)).toBeNull(); // '0' на Ареса
    expect(G.auction!.toAct).toBe('1');                  // дальше по кругу
    expect(applyBid(G, ctx, '1', 'ares', 3)).toBeNull(); // '1' перебивает '0'
    expect(G.auction!.toAct).toBe('0');                  // сразу выбитый '0', НЕ '2'
    expect(applyBid(G, ctx, '0', 'ares', 4)).toBeNull(); // '0' перебивает обратно
    expect(G.auction!.toAct).toBe('1');                  // снова выбитый '1', НЕ '2'
    expect(applyBid(G, ctx, '1', 'poseidon', 1)).toBeNull(); // '1' уходит на Посейдона
    expect(G.auction!.toAct).toBe('2');                  // теперь ход дошёл до '2'
  });

  it('жрецы дают скидку на оплату (минимум 1)', () => {
    expect(paymentFor({ priests: 0 }, 3)).toBe(3);
    expect(paymentFor({ priests: 2 }, 3)).toBe(1);
    expect(paymentFor({ priests: 5 }, 3)).toBe(1);
  });

  it('нельзя поставить больше, чем сможешь оплатить', () => {
    const ctx = ctxFor(2);
    const G = setupGame(ctx);
    setupAuction(G, ctx);
    G.players['0'].gold = 3;
    expect(applyBid(G, ctx, '0', 'ares', 6)).not.toBeNull();
  });

  it('Аполлон бесплатен и допускает нескольких', () => {
    const ctx = ctxFor(2);
    const G = setupGame(ctx);
    setupAuction(G, ctx);
    expect(applyApollo(G, ctx, '0')).toBeNull();
    expect(applyApollo(G, ctx, '1')).toBeNull();
    expect(auctionComplete(G, ctx)).toBe(true);
    const g0 = G.players['0'].gold;
    const expected = islandsOf(G, '0').length <= 1 ? 4 : 1;
    resolveAuction(G, ctx);
    expect(G.players['0'].gold).toBe(g0 + expected);
  });
});

describe('действия', () => {
  function actionsState(G: CycladesState, god: 'ares' | 'poseidon' | 'zeus' | 'athena', pid = '0') {
    G.actions = { queue: [{ god, playerId: pid }], index: 0, recruited: 0, built: false };
  }

  it('наём войск: первый бесплатно, далее по растущей цене, из запаса', () => {
    const ctx = ctxFor(2);
    const G = setupGame(ctx);
    actionsState(G, 'ares');
    const gold0 = G.players['0'].gold;
    const supply0 = G.players['0'].troopsSupply;

    expect(applyRecruit(G, '0', 'ares', 'home_n')).toBeNull(); // 1-й бесплатно
    expect(applyRecruit(G, '0', 'ares', 'home_n')).toBeNull(); // 2-й за 2
    expect(G.players['0'].gold).toBe(gold0 - 2);
    expect(G.players['0'].troopsSupply).toBe(supply0 - 2);
    const home0 = G.territories['home_n'];
    if (home0.kind === 'island') expect(home0.troops).toBe(3); // было 1 + 2
  });

  it('нельзя нанимать войска на чужой остров', () => {
    const ctx = ctxFor(2);
    const G = setupGame(ctx);
    actionsState(G, 'ares');
    expect(applyRecruit(G, '0', 'ares', 'home_s')).not.toBeNull();
  });

  it('постройка здания стоит 2 и занимает слот; один раз за активацию', () => {
    const ctx = ctxFor(2);
    const G = setupGame(ctx);
    actionsState(G, 'ares');
    const gold0 = G.players['0'].gold;
    expect(applyBuild(G, '0', 'ares', 'home_n')).toBeNull();
    expect(G.players['0'].gold).toBe(gold0 - 2);
    const home0 = G.territories['home_n'];
    if (home0.kind === 'island') expect(home0.buildings.map((b) => b.type)).toContain('fortress');
    expect(applyBuild(G, '0', 'ares', 'home_n')).not.toBeNull(); // второй раз нельзя
  });
});

describe('Метрополия', () => {
  it('4 типа зданий автоматически дают Метрополию: здания расходуются, игрок выбирает остров', () => {
    const ctx = ctxFor(2);
    const G = setupGame(ctx);
    const home0 = G.territories['home_n'];
    if (home0.kind === 'island') {
      home0.buildings = (['port', 'fortress', 'temple', 'university'] as const).map((type) => ({ type, ownerId: '0' }));
    }
    checkMetropolis(G, '0');
    expect(G.metropolisPlace).toMatchObject({ playerId: '0', source: 'buildings' });
    if (home0.kind === 'island') expect(home0.buildings).toHaveLength(0); // по одному каждого типа израсходовано
    expect(applyPlaceMetropolis(G, '0', 'serifos')).toBeNull(); // 1 клетка, есть место
    expect(metropolisCount(G, '0')).toBe(1);
    expect(G.metropolisPlace).toBeNull();
  });

  it('4 философа автоматически дают Метрополию (расходуются)', () => {
    const ctx = ctxFor(2);
    const G = setupGame(ctx);
    G.players['0'].philosophers = 4;
    checkMetropolis(G, '0');
    expect(G.metropolisPlace).toMatchObject({ playerId: '0', source: 'philosophers' });
    expect(G.players['0'].philosophers).toBe(0);
    expect(applyPlaceMetropolis(G, '0', 'home_n')).toBeNull();
    expect(metropolisCount(G, '0')).toBe(1);
  });

  it('при нехватке места под Метрополию сносятся свои здания', () => {
    const ctx = ctxFor(2);
    const G = setupGame(ctx);
    const serifos = G.territories['serifos']; // 1 клетка
    if (serifos.kind === 'island') { serifos.ownerId = '0'; serifos.buildings = [{ type: 'temple', ownerId: '0' }]; }
    G.players['0'].philosophers = 4;
    checkMetropolis(G, '0');
    expect(applyPlaceMetropolis(G, '0', 'serifos')).toBeNull();
    if (serifos.kind === 'island') {
      expect(serifos.hasMetropolis).toBe(true);
      expect(serifos.buildings).toHaveLength(0); // здание снесено под Метрополию
    }
  });

  it('если все острова уже с Метрополией — ресурс просто сбрасывается (замена)', () => {
    const ctx = ctxFor(2);
    const G = setupGame(ctx);
    for (const isl of islandsOf(G, '0')) isl.hasMetropolis = true;
    const before = metropolisCount(G, '0');
    G.players['0'].philosophers = 4;
    checkMetropolis(G, '0');
    expect(G.metropolisPlace).toBeNull();
    expect(G.players['0'].philosophers).toBe(0);
    expect(metropolisCount(G, '0')).toBe(before);
  });

  it('слоты: метрополия занимает 2 слота на острове ≥2 клеток, 1 — на одноклеточном', () => {
    const G = setupGame(ctxFor(2));
    const naxos = G.territories['naxos']; // 2 клетки
    const serifos = G.territories['serifos']; // 1 клетка
    if (naxos.kind === 'island') { naxos.ownerId = '0'; naxos.hasMetropolis = true; expect(freeSlots(naxos)).toBe(0); }
    if (serifos.kind === 'island') { serifos.ownerId = '0'; serifos.hasMetropolis = true; expect(freeSlots(serifos)).toBe(0); }
  });
});

describe('победа', () => {
  it('endIf объявляет победителя при 2 Метрополиях между циклами', () => {
    const ctx = ctxFor(2);
    const G = setupGame(ctx);
    // Две Метрополии на островах игрока '0'.
    for (const id of ['home_n', 'naxos']) {
      const isl = G.territories[id];
      if (isl.kind === 'island') {
        isl.ownerId = '0';
        isl.hasMetropolis = true;
      }
    }
    expect(islandsOf(G, '0').filter((i) => i.hasMetropolis)).toHaveLength(2);
    G.actions = null; // стык циклов
    const result = (CycladesGame.endIf as any)({ G, ctx });
    expect(result).toEqual({ winner: '0' });
  });

  it('во время фазы действий победа не засчитывается', () => {
    const ctx = ctxFor(2);
    const G = setupGame(ctx);
    for (const id of ['home_n', 'naxos']) {
      const isl = G.territories[id];
      if (isl.kind === 'island') { isl.ownerId = '0'; isl.hasMetropolis = true; }
    }
    G.actions = { queue: [{ god: 'ares', playerId: '0' }], index: 0, recruited: 0, built: false };
    expect((CycladesGame.endIf as any)({ G, ctx })).toBeUndefined();
  });
});

describe('очередь действий', () => {
  it('advanceTurn проходит очередь и закрывает фазу в конце', () => {
    const ctx = ctxFor(2);
    const G = setupGame(ctx);
    G.actions = {
      queue: [
        { god: 'ares', playerId: '0' },
        { god: 'poseidon', playerId: '1' },
      ],
      index: 0,
      recruited: 2,
      built: true,
    };
    expect(advanceTurn(G)).toBe(false);
    expect(G.actions!.index).toBe(1);
    expect(G.actions!.recruited).toBe(0); // сброс на новой активации
    expect(advanceTurn(G)).toBe(true);
    expect(G.actions).toBeNull();
  });
});
