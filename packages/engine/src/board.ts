import type { Island, Sea, Territory, TerritoryId, Axial, Point } from './types';

// Доска Cyclades: круглое поле, заполненное гекс-сеткой морских клеток-кружков
// (радиус GRID_RADIUS от центра). Острова — наборы клеток поверх сетки; занятые
// островами клетки сушей, остальные — морские клетки. Флот ходит по морским
// клеткам (соседство = 6 направлений), остров соседствует с морскими клетками,
// которые его касаются.

export const GRID_RADIUS = 3; // 37 клеток (7 в поперечнике), как на оригинале
export const HEX_SIZE = 60; // радиус-описанная гекса (расстояние центр→угол)
export const BOARD_CENTER: Point = { x: 450, y: 450 };
export const BOARD_VIEWBOX = 900;

const SQRT3 = Math.sqrt(3);

/** Осевые координаты → пиксели (pointy-top). */
export function axialToPixel(a: Axial): Point {
  return {
    x: BOARD_CENTER.x + HEX_SIZE * SQRT3 * (a.q + a.r / 2),
    y: BOARD_CENTER.y + HEX_SIZE * 1.5 * a.r,
  };
}

const DIRS: Axial[] = [
  { q: 1, r: 0 }, { q: 1, r: -1 }, { q: 0, r: -1 },
  { q: -1, r: 0 }, { q: -1, r: 1 }, { q: 0, r: 1 },
];

export function hexDistance(a: Axial, b: Axial): number {
  return (Math.abs(a.q - b.q) + Math.abs(a.r - b.r) + Math.abs(a.q + a.r - b.q - b.r)) / 2;
}

const key = (a: Axial) => `${a.q}_${a.r}`;
const seaId = (a: Axial) => `s_${a.q}_${a.r}`;

interface IslandDef {
  id: TerritoryId;
  name: string;
  cells: [number, number][];
  buildSlots: number;
  prosperity: number;
}

// Раскладка на 4 игроков: 4 «домашних» острова по сторонам, Делос в центре,
// несколько нейтральных. Координаты подобраны на гекс-сетке радиусом 3.
const ISLAND_DEFS: IslandDef[] = [
  { id: 'delos', name: 'Делос', cells: [[0, 0]], buildSlots: 4, prosperity: 3 },

  { id: 'home_n', name: 'Афины', cells: [[0, -3], [1, -3]], buildSlots: 4, prosperity: 2 },
  { id: 'home_e', name: 'Спарта', cells: [[3, -1], [3, -2]], buildSlots: 4, prosperity: 2 },
  { id: 'home_s', name: 'Коринф', cells: [[0, 3], [-1, 3]], buildSlots: 4, prosperity: 2 },
  { id: 'home_w', name: 'Фивы', cells: [[-3, 1], [-3, 2]], buildSlots: 4, prosperity: 2 },

  { id: 'naxos', name: 'Наксос', cells: [[-1, -1]], buildSlots: 3, prosperity: 2 },
  { id: 'paros', name: 'Парос', cells: [[2, 0]], buildSlots: 3, prosperity: 2 },
  { id: 'milos', name: 'Милос', cells: [[-2, 2]], buildSlots: 3, prosperity: 2 },
  { id: 'thira', name: 'Тира', cells: [[1, 1]], buildSlots: 3, prosperity: 1 },
  { id: 'serifos', name: 'Серифос', cells: [[2, -2]], buildSlots: 2, prosperity: 1 },
];

/** Домашние острова по количеству игроков. */
const HOME_ISLANDS: Record<number, TerritoryId[]> = {
  2: ['home_n', 'home_s'],
  3: ['home_n', 'home_e', 'home_w'],
  4: ['home_n', 'home_e', 'home_s', 'home_w'],
};

export function homeIslandsFor(numPlayers: number): TerritoryId[] {
  const list = HOME_ISLANDS[numPlayers];
  if (!list) throw new Error(`Неподдерживаемое число игроков: ${numPlayers} (нужно 2–4)`);
  return list;
}

function centroid(cells: Axial[]): Point {
  const pts = cells.map(axialToPixel);
  return {
    x: pts.reduce((s, p) => s + p.x, 0) / pts.length,
    y: pts.reduce((s, p) => s + p.y, 0) / pts.length,
  };
}

/** Создаёт свежую доску: морские клетки + острова, со всей смежностью. */
export function createBoard(): Record<TerritoryId, Territory> {
  // 1. Все клетки сетки в круге радиусом GRID_RADIUS.
  const allCells: Axial[] = [];
  for (let q = -GRID_RADIUS; q <= GRID_RADIUS; q++) {
    for (let r = -GRID_RADIUS; r <= GRID_RADIUS; r++) {
      if (hexDistance({ q, r }, { q: 0, r: 0 }) <= GRID_RADIUS) allCells.push({ q, r });
    }
  }

  // 2. Привязка клетка → острову.
  const cellToIsland = new Map<string, TerritoryId>();
  for (const def of ISLAND_DEFS) {
    for (const [q, r] of def.cells) cellToIsland.set(key({ q, r }), def.id);
  }

  const territories: Record<TerritoryId, Territory> = {};

  // 3. Острова.
  for (const def of ISLAND_DEFS) {
    const cells = def.cells.map(([q, r]) => ({ q, r }));
    const island: Island = {
      id: def.id,
      kind: 'island',
      name: def.name,
      pos: centroid(cells),
      cells,
      buildSlots: def.buildSlots,
      prosperity: def.prosperity,
      adjacentSeas: [],
      ownerId: null,
      troops: 0,
      buildings: [],
      hasMetropolis: false,
    };
    territories[def.id] = island;
  }

  // 4. Морские клетки (всё, что не суша).
  for (const cell of allCells) {
    if (cellToIsland.has(key(cell))) continue;
    const sea: Sea = {
      id: seaId(cell),
      kind: 'sea',
      name: `Море ${cell.q},${cell.r}`,
      pos: axialToPixel(cell),
      axial: cell,
      adjacentSeas: [],
      adjacentIslands: [],
      ownerId: null,
      fleets: 0,
    };
    territories[sea.id] = sea;
  }

  // 5. Смежность: для каждой морской клетки смотрим 6 соседей.
  for (const cell of allCells) {
    if (cellToIsland.has(key(cell))) continue;
    const sea = territories[seaId(cell)] as Sea;
    for (const d of DIRS) {
      const n = { q: cell.q + d.q, r: cell.r + d.r };
      const nKey = key(n);
      const islandId = cellToIsland.get(nKey);
      if (islandId) {
        if (!sea.adjacentIslands.includes(islandId)) sea.adjacentIslands.push(islandId);
        const isl = territories[islandId] as Island;
        if (!isl.adjacentSeas.includes(sea.id)) isl.adjacentSeas.push(sea.id);
      } else if (territories[seaId(n)]) {
        sea.adjacentSeas.push(seaId(n));
      }
    }
  }

  return territories;
}

export function isIsland(t: Territory): t is Island {
  return t.kind === 'island';
}
export function isSea(t: Territory): t is Sea {
  return t.kind === 'sea';
}
