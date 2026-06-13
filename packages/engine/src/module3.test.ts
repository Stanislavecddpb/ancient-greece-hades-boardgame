import { describe, it, expect } from 'vitest';
import type { Ctx } from 'boardgame.io';
import { setupGame } from './setup';
import { applyIncome, incomeFor } from './income';
import { applyBuyCreature, applyFuriesTake, endFuries, placeBoardCreature } from './creatures';
import { isIsland, isSea } from './board';
import type { CycladesState, Island } from './types';

function ctxFor(n: number): Ctx {
  return {
    numPlayers: n, playOrder: Array.from({ length: n }, (_, i) => String(i)),
    playOrderPos: 0, currentPlayer: '0', turn: 1, phase: 'actions', numMoves: 0,
  } as unknown as Ctx;
}

function islandOf(G: CycladesState, pid: string): Island {
  return Object.values(G.territories).find((t): t is Island => isIsland(t) && t.ownerId === pid)!;
}

/** Обнуляет весь доход на доске (для изоляции отдельного источника в тестах). */
function clearIncome(G: CycladesState): void {
  for (const t of Object.values(G.territories)) {
    t.cornucopia = 0; t.prosperity = 0;
    if (isIsland(t)) { t.necropolis = false; t.necropolisGold = 0; }
    if (isSea(t)) t.fleets = 0;
  }
}

function zeusTurn(G: CycladesState): void {
  G.actions = { queue: [{ god: 'zeus', playerId: '0' }], index: 0, recruited: 0, built: false };
}

describe('маркеры процветания', () => {
  it('дают доход владельцу острова', () => {
    const G = setupGame(ctxFor(2));
    const isl = islandOf(G, '0');
    const before = incomeFor(G, '0');
    isl.prosperity += 3;
    expect(incomeFor(G, '0')).toBe(before + 3);
  });
});

describe('Цербер', () => {
  it('забирает доход и ЗМ Некрополя с острова вместо владельца', () => {
    const G = setupGame(ctxFor(2));
    clearIncome(G);
    const x = islandOf(G, '1');
    x.cornucopia = 5;
    x.necropolis = true;
    x.necropolisGold = 4;
    placeBoardCreature(G, 'cerberus', '0', x.id);

    const g0 = G.players['0'].gold;
    const g1 = G.players['1'].gold;
    applyIncome(G);
    expect(G.players['0'].gold).toBe(g0 + 5 + 4); // доход острова + ЗМ Некрополя
    expect(G.players['1'].gold).toBe(g1);
  });
});

describe('Эмпуса', () => {
  it('крадёт всё золото с Некрополя', () => {
    const G = setupGame(ctxFor(2));
    const necro = islandOf(G, '0');
    necro.necropolis = true;
    necro.necropolisGold = 6;
    zeusTurn(G);
    G.creatures.market = ['empusa', null, null];
    G.players['0'].gold = 5;

    expect(applyBuyCreature(G, '0', 0)).toBeNull();
    expect(G.players['0'].gold).toBe(5 - 4 + 6); // -цена слота (4) + украдено (6)
    expect(necro.necropolisGold).toBe(0);
  });

  it('Хирон на острове Некрополя защищает от Эмпусы (покупка не проходит)', () => {
    const G = setupGame(ctxFor(2));
    const necro = islandOf(G, '0');
    necro.necropolis = true;
    necro.necropolisGold = 6;
    placeBoardCreature(G, 'chiron', '1', necro.id);
    zeusTurn(G);
    G.creatures.market = ['empusa', null, null];
    G.players['0'].gold = 5;

    expect(applyBuyCreature(G, '0', 0)).toBe('Некрополь под защитой Хирона');
    expect(G.players['0'].gold).toBe(5); // золото не списано
    expect(necro.necropolisGold).toBe(6);
  });
});

describe('Фурии', () => {
  it('переносят маркер процветания на свой остров', () => {
    const G = setupGame(ctxFor(2));
    G.furiesMove = '0';
    const src = islandOf(G, '1');
    src.prosperity = 1;
    const dest = islandOf(G, '0');

    expect(applyFuriesTake(G, '0', src.id, dest.id)).toBeNull();
    expect(src.prosperity).toBe(0);
    expect(dest.prosperity).toBe(1);
    expect(G.furiesMove).toBeNull();
  });

  it('Хирон защищает остров-источник от Фурий', () => {
    const G = setupGame(ctxFor(2));
    G.furiesMove = '0';
    const src = islandOf(G, '1');
    src.prosperity = 1;
    placeBoardCreature(G, 'chiron', '1', src.id);
    expect(applyFuriesTake(G, '0', src.id, islandOf(G, '0').id)).toBe('остров под защитой Хирона');
    expect(src.prosperity).toBe(1);
  });

  it('endFuries отменяет эффект', () => {
    const G = setupGame(ctxFor(2));
    G.furiesMove = '0';
    expect(endFuries(G, '0')).toBeNull();
    expect(G.furiesMove).toBeNull();
  });
});
