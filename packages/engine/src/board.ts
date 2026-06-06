import type { Island, Sea, Territory, TerritoryId, Point, LandCell, CornucopiaSpot } from './types';

// Доска на 4 игроков по точной спецификации: круглое поле из строк клеток-кружков
// сверху вниз 4,5,6,7,8,9,8,7,6,5,4. Координата клетки — (строка, номер в строке),
// нумерация с 1. Связные клетки суши образуют острова; остальное — море.

export const ROW_COUNTS = [4, 5, 6, 7, 8, 9, 8, 7, 6, 5, 4];
export const CELL_D = 82; // расстояние между центрами соседних кружков
const ROW_H = CELL_D * 0.866; // вертикальный шаг строк (плотная упаковка)
export const BOARD_VIEWBOX = 900;
export const BOARD_CENTER: Point = { x: 450, y: 450 };
export const BOARD_RADIUS = 400;
const MID_ROW = 6;

/** Пиксельная позиция центра клетки (row, col), нумерация с 1. */
export function cellToPixel(row: number, col: number): Point {
  const count = ROW_COUNTS[row - 1];
  return {
    x: BOARD_CENTER.x + (col - (count + 1) / 2) * CELL_D,
    y: BOARD_CENTER.y + (row - MID_ROW) * ROW_H,
  };
}

const ckey = (row: number, col: number) => `${row}_${col}`;
const seaId = (row: number, col: number) => `s_${row}_${col}`;

interface IslandDef {
  id: TerritoryId;
  name: string;
  cells: [number, number][];
  buildSlots: number;
}

// Острова — связные группы клеток суши из спецификации.
const ISLAND_DEFS: IslandDef[] = [
  { id: 'home_n', name: 'Афины', cells: [[2, 1], [2, 2], [3, 1], [3, 2]], buildSlots: 4 },
  { id: 'home_e', name: 'Спарта', cells: [[3, 5], [3, 6]], buildSlots: 3 },
  { id: 'home_w', name: 'Коринф', cells: [[7, 1], [8, 1], [8, 2]], buildSlots: 4 },
  { id: 'home_s', name: 'Фивы', cells: [[8, 7], [9, 6], [10, 5]], buildSlots: 4 },

  { id: 'delos', name: 'Делос', cells: [[4, 4], [5, 5]], buildSlots: 3 },
  { id: 'naxos', name: 'Наксос', cells: [[6, 4], [7, 4]], buildSlots: 3 },
  { id: 'milos', name: 'Милос', cells: [[5, 2]], buildSlots: 2 },
  { id: 'paros', name: 'Парос', cells: [[5, 7]], buildSlots: 2 },
  { id: 'serifos', name: 'Серифос', cells: [[7, 6]], buildSlots: 2 },
  { id: 'thira', name: 'Тира', cells: [[9, 3], [10, 2], [10, 3]], buildSlots: 3 },
];

// Рога изобилия: число рогов на клетке (строка, номер). 6 на воде по краям + на суше.
const CORNUCOPIAS: Array<[number, number, number]> = [
  [1, 1, 1], [1, 4, 1], [6, 1, 1], [6, 9, 1], [11, 1, 1], [11, 4, 1], // вода (6 по краям)
  [3, 5, 1], [5, 2, 2], [5, 5, 1], [5, 7, 2], [6, 4, 1], [7, 6, 2], // суша
];

const HOME_ISLANDS: Record<number, TerritoryId[]> = {
  2: ['home_n', 'home_s'],
  3: ['home_n', 'home_e', 'home_w'],
  4: ['home_n', 'home_e', 'home_w', 'home_s'],
};

export function homeIslandsFor(numPlayers: number): TerritoryId[] {
  const list = HOME_ISLANDS[numPlayers];
  if (!list) throw new Error(`Неподдерживаемое число игроков: ${numPlayers} (нужно 2–4)`);
  return list;
}

function centroid(pts: Point[]): Point {
  return {
    x: pts.reduce((s, p) => s + p.x, 0) / pts.length,
    y: pts.reduce((s, p) => s + p.y, 0) / pts.length,
  };
}

/** Создаёт свежую доску: море + острова со всей смежностью. */
export function createBoard(): Record<TerritoryId, Territory> {
  // 1. Все клетки сетки с позициями.
  const cells: { row: number; col: number; pos: Point }[] = [];
  ROW_COUNTS.forEach((count, ri) => {
    const row = ri + 1;
    for (let col = 1; col <= count; col++) cells.push({ row, col, pos: cellToPixel(row, col) });
  });

  const cellToIsland = new Map<string, TerritoryId>();
  for (const def of ISLAND_DEFS) for (const [r, c] of def.cells) cellToIsland.set(ckey(r, c), def.id);

  const cornById = new Map<string, number>();
  for (const [r, c, n] of CORNUCOPIAS) cornById.set(ckey(r, c), (cornById.get(ckey(r, c)) ?? 0) + n);

  const territories: Record<TerritoryId, Territory> = {};

  // 2. Острова.
  for (const def of ISLAND_DEFS) {
    const landCells: LandCell[] = def.cells.map(([row, col]) => ({ row, col, pos: cellToPixel(row, col) }));
    const spots: CornucopiaSpot[] = [];
    let cornTotal = 0;
    for (const lc of landCells) {
      const n = cornById.get(ckey(lc.row, lc.col)) ?? 0;
      if (n > 0) {
        cornTotal += n;
        spots.push({ pos: lc.pos, count: n });
      }
    }
    const island: Island = {
      id: def.id,
      kind: 'island',
      name: def.name,
      pos: centroid(landCells.map((c) => c.pos)),
      cells: landCells,
      buildSlots: def.buildSlots,
      cornucopia: cornTotal,
      cornucopiaSpots: spots,
      adjacentSeas: [],
      ownerId: null,
      troops: 0,
      buildings: [],
      hasMetropolis: false,
    };
    territories[def.id] = island;
  }

  // 3. Морские клетки (всё, что не суша).
  for (const cell of cells) {
    if (cellToIsland.has(ckey(cell.row, cell.col))) continue;
    const sea: Sea = {
      id: seaId(cell.row, cell.col),
      kind: 'sea',
      name: `Море ${cell.row}·${cell.col}`,
      pos: cell.pos,
      row: cell.row,
      col: cell.col,
      cornucopia: cornById.get(ckey(cell.row, cell.col)) ?? 0,
      adjacentSeas: [],
      adjacentIslands: [],
      ownerId: null,
      fleets: 0,
    };
    territories[sea.id] = sea;
  }

  // 4. Смежность по близости центров (соседи на расстоянии ~CELL_D).
  const threshold = CELL_D * 1.15;
  for (const cell of cells) {
    const islandId = cellToIsland.get(ckey(cell.row, cell.col));
    if (islandId) continue; // обрабатываем смежность от лица морских клеток
    const sea = territories[seaId(cell.row, cell.col)] as Sea;
    for (const other of cells) {
      if (other === cell) continue;
      const dist = Math.hypot(other.pos.x - cell.pos.x, other.pos.y - cell.pos.y);
      if (dist > threshold) continue;
      const otherIsland = cellToIsland.get(ckey(other.row, other.col));
      if (otherIsland) {
        if (!sea.adjacentIslands.includes(otherIsland)) sea.adjacentIslands.push(otherIsland);
        const isl = territories[otherIsland] as Island;
        if (!isl.adjacentSeas.includes(sea.id)) isl.adjacentSeas.push(sea.id);
      } else {
        sea.adjacentSeas.push(seaId(other.row, other.col));
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
