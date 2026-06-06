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
import { checkMetropolis } from './metropolis';
import { metropolisCount, islandsOf } from './helpers';
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
    // Домашние острова для 2 игроков — по диагонали.
    expect(G.territories['home_n'].kind === 'island' && G.territories['home_n'].ownerId).toBe('0');
    expect(G.territories['home_s'].kind === 'island' && G.territories['home_s'].ownerId).toBe('1');
    const home0 = G.territories['home_n'];
    if (home0.kind === 'island') expect(home0.troops).toBe(3);
    // По одному флоту у каждого где-то стоит.
    const fleets = Object.values(G.territories).filter((t) => t.kind === 'sea' && t.fleets > 0);
    expect(fleets).toHaveLength(2);
  });
});

describe('доход', () => {
  it('начисляет золото по сумме prosperity островов', () => {
    const ctx = ctxFor(2);
    const G = setupGame(ctx);
    const before = G.players['0'].gold;
    const inc = incomeFor(G, '0'); // только домашний остров (prosperity 2)
    expect(inc).toBe(2);
    applyIncome(G);
    expect(G.players['0'].gold).toBe(before + 2);
  });
});

describe('аукцион', () => {
  it('godsForCycle выдаёт numPlayers богов и ротируется по циклам', () => {
    expect(godsForCycle(4, 1)).toEqual(['ares', 'poseidon', 'zeus', 'athena']);
    expect(godsForCycle(2, 1)).toEqual(['ares', 'poseidon']);
    expect(godsForCycle(2, 2)).toEqual(['poseidon', 'zeus']);
  });

  it('вытеснение: перебитый игрок снова ходит и оплата считается с учётом жрецов', () => {
    const ctx = ctxFor(2);
    const G = setupGame(ctx);
    setupAuction(G, ctx);
    expect(G.auction!.toAct).toBe('0');

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
    resolveAuction(G, ctx);
    expect(G.players['0'].gold).toBe(g0 + 2); // первый получил +2
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
    if (home0.kind === 'island') expect(home0.troops).toBe(5); // было 3 + 2
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
  it('4 типа зданий превращаются в Метрополию', () => {
    const ctx = ctxFor(2);
    const G = setupGame(ctx);
    const home0 = G.territories['home_n'];
    if (home0.kind === 'island') {
      home0.buildings = (['port', 'fortress', 'temple', 'university'] as const).map((type) => ({ type, ownerId: '0' }));
    }
    checkMetropolis(G, '0');
    expect(metropolisCount(G, '0')).toBe(1);
    if (home0.kind === 'island') expect(home0.buildings).toHaveLength(0); // здания израсходованы
  });

  it('4 философа превращаются в Метрополию', () => {
    const ctx = ctxFor(2);
    const G = setupGame(ctx);
    G.players['0'].philosophers = 4;
    checkMetropolis(G, '0');
    expect(metropolisCount(G, '0')).toBe(1);
    expect(G.players['0'].philosophers).toBe(0);
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
