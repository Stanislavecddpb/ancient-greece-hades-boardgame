import { describe, it, expect } from 'vitest';
import type { Ctx } from 'boardgame.io';
import { setupGame } from './setup';
import {
  HEROES,
  isHero,
  payHeroUpkeep,
  applyDismissHero,
  applySacrificeHero,
  applyPerseusMove,
  removeHeroesOnCapture,
} from './heroes';
import { applyBuyCreature, applyCycleCreatures } from './creatures';
import { metropolisCount } from './helpers';
import { isIsland } from './board';
import type { CycladesState, Island } from './types';

function ctxFor(n: number): Ctx {
  return {
    numPlayers: n, playOrder: Array.from({ length: n }, (_, i) => String(i)),
    playOrderPos: 0, currentPlayer: '0', turn: 1, phase: 'actions', numMoves: 0,
  } as unknown as Ctx;
}

function islandsOwned(G: CycladesState, pid: string): Island[] {
  return Object.values(G.territories).filter((t): t is Island => isIsland(t) && t.ownerId === pid);
}

function withTurn(G: CycladesState): void {
  G.actions = { queue: [{ god: 'zeus', playerId: '0' }], index: 0, recruited: 0, built: false };
}

describe('наём Героя', () => {
  it('Герой ставится на свой остров за цену слота без скидки храмов; не уходит в сброс', () => {
    const G = setupGame(ctxFor(2));
    withTurn(G);
    const isl = islandsOwned(G, '0')[0];
    isl.buildings.push({ type: 'temple', ownerId: '0' }); // храм НЕ снижает цену Героя
    G.creatures.market = ['achilles', null, null];
    G.players['0'].gold = 10;

    expect(applyBuyCreature(G, '0', 0, isl.id)).toBeNull();
    expect(G.players['0'].gold).toBe(10 - 4); // цена слота 0 = 4, без скидки
    expect(G.players['0'].heroes).toHaveLength(1);
    expect(G.players['0'].heroes[0]).toMatchObject({ id: 'achilles', islandId: isl.id });
    expect(G.creatures.market[0]).toBeNull();
    expect(G.creatures.discard).not.toContain('achilles');
  });

  it('Героя нельзя нанять не на свой остров', () => {
    const G = setupGame(ctxFor(2));
    withTurn(G);
    const enemy = islandsOwned(G, '1')[0];
    G.creatures.market = ['midas', null, null];
    G.players['0'].gold = 10;
    expect(applyBuyCreature(G, '0', 0, enemy.id)).toBe('нужен свой остров для Героя');
  });

  it('Зевсом нельзя сбросить Героя (нижний слот рынка)', () => {
    const G = setupGame(ctxFor(2));
    withTurn(G);
    G.creatures.market = ['minotaur', null, 'hector'];
    expect(applyCycleCreatures(G, '0')).toBe('Зевсом нельзя сбросить Героя');
  });
});

describe('апкип и роспуск Героев', () => {
  it('платит 2🪙 за Героя; при нехватке золота Герой исчезает', () => {
    const G = setupGame(ctxFor(2));
    const isl = islandsOwned(G, '0')[0];
    G.players['0'].heroes = [{ id: 'achilles', islandId: isl.id, recruitedCycle: 0 }];

    G.players['0'].gold = 5;
    payHeroUpkeep(G);
    expect(G.players['0'].gold).toBe(3);
    expect(G.players['0'].heroes).toHaveLength(1);

    G.players['0'].gold = 1;
    payHeroUpkeep(G);
    expect(G.players['0'].heroes).toHaveLength(0); // нечем платить — исчез
  });

  it('добровольный роспуск убирает Героя', () => {
    const G = setupGame(ctxFor(2));
    G.players['0'].heroes = [{ id: 'midas', islandId: islandsOwned(G, '0')[0].id, recruitedCycle: 0 }];
    expect(applyDismissHero(G, '0', 'midas')).toBeNull();
    expect(G.players['0'].heroes).toHaveLength(0);
  });
});

describe('самопожертвование Героев', () => {
  it('нельзя жертвовать Героем в ход найма', () => {
    const G = setupGame(ctxFor(2));
    G.players['0'].heroes = [{ id: 'penthesilea', islandId: islandsOwned(G, '0')[0].id, recruitedCycle: G.cycle }];
    expect(applySacrificeHero(G, '0', 'penthesilea')).toBe('нельзя жертвовать Героем в ход найма');
  });

  it('Пентесилея даёт неуязвимую Метрополию (считается в победу)', () => {
    const G = setupGame(ctxFor(2));
    const before = metropolisCount(G, '0');
    G.players['0'].heroes = [{ id: 'penthesilea', islandId: islandsOwned(G, '0')[0].id, recruitedCycle: 0 }];
    expect(applySacrificeHero(G, '0', 'penthesilea')).toBeNull();
    expect(G.players['0'].secretMetropolis).toBe(true);
    expect(metropolisCount(G, '0')).toBe(before + 1);
    expect(G.players['0'].heroes).toHaveLength(0);
  });

  it('Ахиллес при 4 островах открывает установку Метрополии', () => {
    const G = setupGame(ctxFor(2));
    const islands = Object.values(G.territories).filter(isIsland);
    for (let i = 0; i < 4; i++) islands[i].ownerId = '0';
    G.players['0'].heroes = [{ id: 'achilles', islandId: islandsOwned(G, '0')[0].id, recruitedCycle: 0 }];
    expect(applySacrificeHero(G, '0', 'achilles')).toBeNull();
    expect(G.metropolisPlace).toMatchObject({ playerId: '0', source: 'hero' });
  });

  it('Улисс тратит Порт+Храм+Университет на Метрополию', () => {
    const G = setupGame(ctxFor(2));
    const isl = islandsOwned(G, '0')[0];
    isl.buildSlots = 6;
    isl.buildings = [
      { type: 'port', ownerId: '0' }, { type: 'temple', ownerId: '0' }, { type: 'university', ownerId: '0' },
    ];
    G.players['0'].heroes = [{ id: 'ulysses', islandId: isl.id, recruitedCycle: 0 }];
    expect(applySacrificeHero(G, '0', 'ulysses')).toBeNull();
    expect(isl.buildings).toHaveLength(0);
    expect(G.metropolisPlace).toMatchObject({ source: 'hero' });
  });

  it('Гектор меняет Жрецов на Философов', () => {
    const G = setupGame(ctxFor(2));
    G.players['0'].priests = 5;
    G.players['0'].heroes = [{ id: 'hector', islandId: islandsOwned(G, '0')[0].id, recruitedCycle: 0 }];
    expect(applySacrificeHero(G, '0', 'hector', '5to2')).toBeNull();
    expect(G.players['0'].priests).toBe(0);
    expect(G.players['0'].philosophers).toBe(2);
  });

  it('Мидас за 15🪙 открывает Метрополию', () => {
    const G = setupGame(ctxFor(2));
    G.players['0'].gold = 20;
    G.players['0'].heroes = [{ id: 'midas', islandId: islandsOwned(G, '0')[0].id, recruitedCycle: 0 }];
    expect(applySacrificeHero(G, '0', 'midas')).toBeNull();
    expect(G.players['0'].gold).toBe(5);
    expect(G.metropolisPlace).toMatchObject({ source: 'hero' });
  });

  it('Персей уводит войска на свой/пустой остров без Героя', () => {
    const G = setupGame(ctxFor(2));
    const own = islandsOwned(G, '0');
    const from = own[0]; from.troops = 3;
    const to = Object.values(G.territories).find((t): t is Island => isIsland(t) && t.ownerId == null)!;
    G.players['0'].heroes = [{ id: 'perseus', islandId: from.id, recruitedCycle: 0 }];

    expect(applySacrificeHero(G, '0', 'perseus')).toBeNull();
    expect(G.perseusMove).toMatchObject({ playerId: '0', fromIsland: from.id });
    expect(applyPerseusMove(G, '0', to.id, 2)).toBeNull();
    expect(from.troops).toBe(1);
    expect(to.troops).toBe(2);
    expect(to.ownerId).toBe('0');
    expect(G.perseusMove).toBeNull();
  });
});

describe('Герои и захват', () => {
  it('Герой проигравшего гибнет при захвате острова', () => {
    const G = setupGame(ctxFor(2));
    const isl = islandsOwned(G, '1')[0];
    G.players['1'].heroes = [{ id: 'hector', islandId: isl.id, recruitedCycle: 0 }];
    removeHeroesOnCapture(G, isl.id, '0');
    expect(G.players['1'].heroes).toHaveLength(0);
  });

  it('isHero различает Героев и существ', () => {
    expect(isHero('achilles')).toBe(true);
    expect(isHero('minotaur')).toBe(false);
    expect(Object.keys(HEROES)).toHaveLength(6);
  });
});
