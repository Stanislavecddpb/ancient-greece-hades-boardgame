import type { Island, Sea, Territory, TerritoryId, Point } from './types';

// Карта MVP: 9 островов (4 «домашних» по углам, центральный Делос и 4 нейтральных)
// и 4 морские зоны кольцом вокруг Делоса. Координаты — на холсте ~1000x720.

interface IslandDef {
  id: TerritoryId;
  name: string;
  pos: Point;
  buildSlots: number;
  prosperity: number;
  adjacentSeas: TerritoryId[];
}

interface SeaDef {
  id: TerritoryId;
  name: string;
  pos: Point;
  adjacentSeas: TerritoryId[];
  adjacentIslands: TerritoryId[];
}

const ISLAND_DEFS: IslandDef[] = [
  { id: 'home_0', name: 'Афины', pos: { x: 150, y: 130 }, buildSlots: 4, prosperity: 2, adjacentSeas: ['sea_n', 'sea_w'] },
  { id: 'home_1', name: 'Спарта', pos: { x: 850, y: 130 }, buildSlots: 4, prosperity: 2, adjacentSeas: ['sea_n', 'sea_e'] },
  { id: 'home_2', name: 'Коринф', pos: { x: 150, y: 590 }, buildSlots: 4, prosperity: 2, adjacentSeas: ['sea_w', 'sea_s'] },
  { id: 'home_3', name: 'Фивы', pos: { x: 850, y: 590 }, buildSlots: 4, prosperity: 2, adjacentSeas: ['sea_e', 'sea_s'] },
  { id: 'delos', name: 'Делос', pos: { x: 500, y: 360 }, buildSlots: 4, prosperity: 3, adjacentSeas: ['sea_n', 'sea_w', 'sea_e', 'sea_s'] },
  { id: 'naxos', name: 'Наксос', pos: { x: 500, y: 110 }, buildSlots: 3, prosperity: 2, adjacentSeas: ['sea_n'] },
  { id: 'milos', name: 'Милос', pos: { x: 130, y: 360 }, buildSlots: 3, prosperity: 2, adjacentSeas: ['sea_w'] },
  { id: 'paros', name: 'Парос', pos: { x: 870, y: 360 }, buildSlots: 3, prosperity: 2, adjacentSeas: ['sea_e'] },
  { id: 'thira', name: 'Тира', pos: { x: 500, y: 610 }, buildSlots: 3, prosperity: 2, adjacentSeas: ['sea_s'] },
];

const SEA_DEFS: SeaDef[] = [
  { id: 'sea_n', name: 'Северное море', pos: { x: 500, y: 225 }, adjacentSeas: ['sea_w', 'sea_e'], adjacentIslands: ['home_0', 'home_1', 'naxos', 'delos'] },
  { id: 'sea_w', name: 'Западное море', pos: { x: 280, y: 360 }, adjacentSeas: ['sea_n', 'sea_s'], adjacentIslands: ['home_0', 'home_2', 'milos', 'delos'] },
  { id: 'sea_e', name: 'Восточное море', pos: { x: 720, y: 360 }, adjacentSeas: ['sea_n', 'sea_s'], adjacentIslands: ['home_1', 'home_3', 'paros', 'delos'] },
  { id: 'sea_s', name: 'Южное море', pos: { x: 500, y: 495 }, adjacentSeas: ['sea_w', 'sea_e'], adjacentIslands: ['home_2', 'home_3', 'thira', 'delos'] },
];

/** Домашние острова по количеству игроков (индекс = место за столом). */
const HOME_ISLANDS: Record<number, TerritoryId[]> = {
  2: ['home_0', 'home_3'],
  3: ['home_0', 'home_1', 'home_2'],
  4: ['home_0', 'home_1', 'home_2', 'home_3'],
};

export function homeIslandsFor(numPlayers: number): TerritoryId[] {
  const list = HOME_ISLANDS[numPlayers];
  if (!list) throw new Error(`Неподдерживаемое число игроков: ${numPlayers} (нужно 2–4)`);
  return list;
}

/** Создаёт свежую карту с обнулённой динамикой. */
export function createBoard(): Record<TerritoryId, Territory> {
  const territories: Record<TerritoryId, Territory> = {};

  for (const def of ISLAND_DEFS) {
    const island: Island = {
      id: def.id,
      kind: 'island',
      name: def.name,
      pos: def.pos,
      buildSlots: def.buildSlots,
      prosperity: def.prosperity,
      adjacentSeas: [...def.adjacentSeas],
      ownerId: null,
      troops: 0,
      buildings: [],
      hasMetropolis: false,
    };
    territories[def.id] = island;
  }

  for (const def of SEA_DEFS) {
    const sea: Sea = {
      id: def.id,
      kind: 'sea',
      name: def.name,
      pos: def.pos,
      adjacentSeas: [...def.adjacentSeas],
      adjacentIslands: [...def.adjacentIslands],
      ownerId: null,
      fleets: 0,
    };
    territories[def.id] = sea;
  }

  return territories;
}

/** Удобный type-guard. */
export function isIsland(t: Territory): t is Island {
  return t.kind === 'island';
}
export function isSea(t: Territory): t is Sea {
  return t.kind === 'sea';
}
