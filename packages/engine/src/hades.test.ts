import { describe, it, expect } from 'vitest';
import type { Ctx } from 'boardgame.io';
import { setupGame } from './setup';
import {
  advanceHadesTrack,
  markHadesSlot,
  applyRecruitUndead,
  applyBuildNecropolis,
  endHadesCycle,
  undeadCost,
} from './hades';
import { addNecropolisGold, collectNecropolisGold, necropolisIsland } from './income';
import { applyCombatRound } from './movement';
import { isIsland, isSea } from './board';
import type { CycladesState, Island, Sea } from './types';

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

/** Состояние с активной фазой действий, где ход — активация Аида игроком '0'. */
function hadesTurn(): CycladesState {
  const G = setupGame(ctxFor(2));
  G.actions = { queue: [{ god: 'athena', playerId: '0', isHades: true }], index: 0, recruited: 0, built: false };
  return G;
}

/** Первый остров под контролем игрока pid. */
function ownIsland(G: CycladesState, pid: string): Island {
  return Object.values(G.territories).find((t): t is Island => isIsland(t) && t.ownerId === pid)!;
}

describe('трек угрозы Аида', () => {
  it('накапливает колонну и не активирует Аида до деления 9', () => {
    const G = setupGame(ctxFor(2));
    expect(advanceHadesTrack(G, 3, 4)).toBe(false);
    expect(G.hades.column).toBe(7);
    expect(G.hades.active).toBe(false);
  });

  it('активирует Аида при достижении/прохождении 9', () => {
    const G = setupGame(ctxFor(2));
    advanceHadesTrack(G, 3, 4); // 7
    expect(advanceHadesTrack(G, 1, 1)).toBe(true); // 9
    expect(G.hades.column).toBe(9);
    expect(G.hades.active).toBe(true);
  });

  it('ничего не делает при выключенном модуле', () => {
    const G = setupGame(ctxFor(2));
    G.modules.hades = false;
    expect(advanceHadesTrack(G, 6, 6)).toBe(false);
    expect(G.hades.column).toBe(0);
  });
});

describe('пометка слота Аида', () => {
  it('накрывает последний слот (бога над Аполлоном), только когда Аид активен', () => {
    const G = setupGame(ctxFor(2));
    G.auction = {
      slots: [
        { god: 'ares', occupantId: null, bid: 0 },
        { god: 'athena', occupantId: null, bid: 0 },
      ],
      apollo: [],
      toAct: '0',
    };
    markHadesSlot(G); // Аид не активен
    expect(G.auction.slots.some((s) => s.isHades)).toBe(false);

    G.hades.active = true;
    markHadesSlot(G);
    expect(G.auction.slots[0].isHades).toBeFalsy();
    expect(G.auction.slots[1].isHades).toBe(true);
  });
});

describe('наём Нежити', () => {
  it('первая Нежить бесплатна, далее 1/2/3/4🪙', () => {
    expect(undeadCost(0)).toBe(0);
    expect(undeadCost(1)).toBe(1);
    expect(undeadCost(2)).toBe(2);
    expect(undeadCost(3)).toBe(3);
    expect(undeadCost(4)).toBe(4);
  });

  it('ставит Войско Нежити на свой остров, списывает золото по прогрессии', () => {
    const G = hadesTurn();
    const isl = ownIsland(G, '0');
    G.players['0'].gold = 10;

    expect(applyRecruitUndead(G, '0', 'troop', isl.id)).toBeNull(); // бесплатно
    expect(isl.undeadTroops).toBe(1);
    expect(G.players['0'].gold).toBe(10);

    expect(applyRecruitUndead(G, '0', 'troop', isl.id)).toBeNull(); // -1
    expect(applyRecruitUndead(G, '0', 'troop', isl.id)).toBeNull(); // -2
    expect(G.players['0'].gold).toBe(10 - 1 - 2);
    expect(isl.undeadTroops).toBe(3);
  });

  it('не больше 5 Нежити за активацию', () => {
    const G = hadesTurn();
    const isl = ownIsland(G, '0');
    G.players['0'].gold = 100;
    for (let i = 0; i < 5; i++) expect(applyRecruitUndead(G, '0', 'troop', isl.id)).toBeNull();
    expect(applyRecruitUndead(G, '0', 'troop', isl.id)).toBe('лимит найма Нежити за ход');
  });

  it('нельзя ставить Войско Нежити на чужой/ничей остров', () => {
    const G = hadesTurn();
    const enemy = Object.values(G.territories).find((t): t is Island => isIsland(t) && t.ownerId === '1')!;
    expect(applyRecruitUndead(G, '0', 'troop', enemy.id)).toBe('нужен свой остров');
  });

  it('ставит Флотилию Нежити в зону рядом со своим островом', () => {
    const G = hadesTurn();
    const isl = ownIsland(G, '0');
    const seaId = isl.adjacentSeas[0];
    G.players['0'].gold = 10;
    expect(applyRecruitUndead(G, '0', 'fleet', seaId)).toBeNull();
    const sea = G.territories[seaId] as Sea;
    expect(sea.undeadFleets).toBe(1);
    expect(sea.ownerId).toBe('0');
  });
});

describe('Некрополь', () => {
  it('строится на своём острове, снося постройки и Метрополию', () => {
    const G = hadesTurn();
    const isl = ownIsland(G, '0');
    isl.buildings = [{ type: 'port', ownerId: '0' }];
    isl.hasMetropolis = true;

    expect(applyBuildNecropolis(G, '0', isl.id)).toBeNull();
    expect(isl.necropolis).toBe(true);
    expect(isl.buildings).toHaveLength(0);
    expect(isl.hasMetropolis).toBe(false);
    expect(G.actions!.built).toBe(true);
  });

  it('на поле только один Некрополь — повторная постройка переносит тайл', () => {
    const G = hadesTurn();
    const islands = Object.values(G.territories).filter((t): t is Island => isIsland(t) && t.ownerId === '0');
    expect(islands.length).toBeGreaterThanOrEqual(2);
    const [a, b] = islands;

    expect(applyBuildNecropolis(G, '0', a.id)).toBeNull();
    a.necropolisGold = 5; // на старом Некрополе осталось золото
    G.actions!.built = false; // имитируем новую активацию

    expect(applyBuildNecropolis(G, '0', b.id)).toBeNull();
    expect(a.necropolis).toBe(false);
    expect(a.necropolisGold).toBe(5); // золото осталось на старом острове
    expect(b.necropolis).toBe(true);
    expect(necropolisIsland(G)!.id).toBe(b.id);
  });
});

describe('золото Некрополя', () => {
  it('копится при гибели обычных юнитов и забирается владельцем в доход', () => {
    const G = setupGame(ctxFor(2));
    const isl = ownIsland(G, '0');
    isl.necropolis = true;

    addNecropolisGold(G, 3);
    expect(isl.necropolisGold).toBe(3);

    const before = G.players['0'].gold;
    collectNecropolisGold(G);
    expect(G.players['0'].gold).toBe(before + 3);
    expect(isl.necropolisGold).toBe(0);
  });

  it('бой: каждая гибель обычного юнита кладёт 1🪙 на Некрополь', () => {
    const G = setupGame(ctxFor(2));
    const necro = ownIsland(G, '0');
    necro.necropolis = true;

    const loc = Object.values(G.territories).find((t): t is Island => isIsland(t) && t.id !== necro.id)!;
    loc.troops = 1;
    loc.ownerId = '1';
    G.combat = {
      kind: 'land', location: loc.id, fromId: necro.id,
      attackerId: '0', defenderId: '1',
      attackerUnits: 3, defenderUnits: 1, defenderBonus: 0,
      round: 0, lastRoll: null,
    };
    // Бросок: атакующий 3, защитник 0 → защитник теряет юнит, бой кончается.
    const rolls = [3, 0];
    let i = 0;
    applyCombatRound(G, '0', () => rolls[i++]);
    expect(necro.necropolisGold).toBe(1);
  });
});

describe('конец цикла с Аидом', () => {
  it('убирает всю Нежить, возвращает запас и сбрасывает трек', () => {
    const G = setupGame(ctxFor(2));
    G.hades = { column: 9, active: true };
    const isl = ownIsland(G, '0');
    isl.undeadTroops = 2;
    G.players['0'].undeadTroopsSupply = 3;
    const sea = Object.values(G.territories).find((t): t is Sea => isSea(t))!;
    sea.undeadFleets = 1;
    sea.ownerId = '0';
    sea.fleets = 0;

    endHadesCycle(G);
    expect(isl.undeadTroops).toBe(0);
    expect(sea.undeadFleets).toBe(0);
    expect(sea.ownerId).toBeNull();
    expect(G.players['0'].undeadTroopsSupply).toBe(5);
    expect(G.hades).toEqual({ column: 0, active: false });
  });
});
