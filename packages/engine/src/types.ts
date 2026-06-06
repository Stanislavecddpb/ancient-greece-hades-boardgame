// Доменная модель Cyclades для boardgame.io.
//
// Ход, фаза и текущий игрок живут в `ctx` фреймворка, случайность — в `random`.
// Здесь — только предметные данные игры (объект G) и константы правил.

/** Идентификатор игрока в boardgame.io: '0', '1', ... */
export type PlayerID = string;
export type TerritoryId = string;

/** Боги, за которых идёт аукцион каждый цикл. */
export type GodName = 'ares' | 'poseidon' | 'zeus' | 'athena' | 'apollo';

/** Четыре конкурентных бога (без Аполлона) — в порядке исполнения действий. */
export const COMPETITIVE_GODS: GodName[] = ['ares', 'poseidon', 'zeus', 'athena'];

/** Типы зданий. Все четыре на островах игрока дают Метрополию. */
export type BuildingType = 'port' | 'fortress' | 'temple' | 'university';

export const ALL_BUILDINGS: BuildingType[] = ['port', 'fortress', 'temple', 'university'];

/** Какое здание строит каждый бог. */
export const GOD_BUILDING: Partial<Record<GodName, BuildingType>> = {
  poseidon: 'port',
  ares: 'fortress',
  zeus: 'temple',
  athena: 'university',
};

export interface Building {
  type: BuildingType;
  ownerId: PlayerID;
}

/** Координаты для отрисовки на SVG-доске. */
export interface Point {
  x: number;
  y: number;
}

/** Координата клетки: номер строки сверху (1..) и номер в строке (1..). */
export interface GridCoord {
  row: number;
  col: number;
}

/** Клетка суши острова с готовой пиксельной позицией для отрисовки. */
export interface LandCell {
  row: number;
  col: number;
  pos: Point;
}

/** Где на острове нарисовать рог(а) изобилия. */
export interface CornucopiaSpot {
  pos: Point;
  count: number;
}

/** Остров: держит войска, здания и, возможно, Метрополию. Даёт доход. */
export interface Island {
  id: TerritoryId;
  kind: 'island';
  name: string;
  /** Центр острова для подписей. */
  pos: Point;
  /** Клетки суши, которые занимает остров (для отрисовки массива суши). */
  cells: LandCell[];
  /** Сколько объектов (здания + метрополия) помещается на острове. */
  buildSlots: number;
  /** Суммарно рогов изобилия на суше острова — доход владельцу. */
  cornucopia: number;
  /** Точки отрисовки рогов на суше. */
  cornucopiaSpots: CornucopiaSpot[];
  adjacentSeas: TerritoryId[];
  // --- динамика ---
  /** Кто контролирует остров (его здания и доход). null — ничей. */
  ownerId: PlayerID | null;
  /** Войска владельца, стоящие на острове. */
  troops: number;
  buildings: Building[];
  hasMetropolis: boolean;
}

/** Морская клетка (один кружок сетки): держит флот. */
export interface Sea {
  id: TerritoryId;
  kind: 'sea';
  name: string;
  pos: Point;
  row: number;
  col: number;
  /** Рог изобилия: золото в фазе дохода тому, чей флот стоит на клетке. */
  cornucopia: number;
  adjacentSeas: TerritoryId[];
  adjacentIslands: TerritoryId[];
  // --- динамика ---
  ownerId: PlayerID | null;
  fleets: number;
}

export type Territory = Island | Sea;

export interface PlayerData {
  id: PlayerID;
  name: string;
  color: string;
  gold: number;
  /** Жрецы: каждый снижает оплату ставки на 1 GP (постоянная скидка). */
  priests: number;
  /** Философы: 4 штуки превращаются в Метрополию. */
  philosophers: number;
  /** Остаток фигурок войск в запасе (можно разместить на доске). */
  troopsSupply: number;
  /** Остаток фигурок флота в запасе. */
  fleetsSupply: number;
  isEliminated: boolean;
}

/** Один лот аукциона: бог и текущая ставка на нём. */
export interface GodSlot {
  god: GodName;
  /** Кто сейчас стоит на этом боге (последняя ставка). null — свободен. */
  occupantId: PlayerID | null;
  /** Текущая ставка золотом (для Аполлона всегда 0). */
  bid: number;
}

/** Состояние фазы аукциона. */
export interface AuctionState {
  /** Конкурентные боги (по одному занявшему на каждого). */
  slots: GodSlot[];
  /** Игроки, выбравшие Аполлона (без ограничения числа). */
  apollo: PlayerID[];
  /** Чей сейчас ход делать ставку. */
  toAct: PlayerID;
}

/** Один пункт очереди исполнения действий: бог и его владелец. */
export interface ActionTurn {
  god: GodName;
  playerId: PlayerID;
}

/** Состояние фазы действий. */
export interface ActionsState {
  /** Очередь «бог → игрок» в порядке исполнения. */
  queue: ActionTurn[];
  /** Индекс текущего пункта очереди. */
  index: number;
  /** Сколько юнитов нанято в текущей активации бога (лимит за раз). */
  recruited: number;
  /** Уже построено здание в текущей активации? */
  built: boolean;
}

export interface LogEntry {
  cycle: number;
  text: string;
}

/** Полное состояние игры (объект G в boardgame.io). */
export interface CycladesState {
  players: Record<PlayerID, PlayerData>;
  territories: Record<TerritoryId, Territory>;
  cycle: number;
  /** Индекс стартового игрока цикла в ctx.playOrder. Ротация каждый цикл. */
  startIndex: number;
  /** Активно во время фазы аукциона. */
  auction: AuctionState | null;
  /** Активно во время фазы действий. */
  actions: ActionsState | null;
  log: LogEntry[];
}

// --- Константы правил ---

/** Грань боевой кости Cyclades: значения 0,0,1,1,2,3. */
export const COMBAT_DIE: number[] = [0, 0, 1, 1, 2, 3];

/** Лимит фигурок одного типа у игрока (войска / флот). */
export const UNIT_SUPPLY = 8;

/** Сколько единиц можно нанять за одну активацию бога. */
export const MAX_RECRUIT_PER_TURN = 3;

/** Стоимость постройки здания. */
export const BUILDING_COST = 2;

/** Метрополий для победы. */
export const METROPOLIS_TO_WIN = 2;

/** Философов для получения Метрополии. */
export const PHILOSOPHERS_FOR_METROPOLIS = 4;

/** Стартовое золото игрока. */
export const STARTING_GOLD = 5;

/** Цвета игроков по индексу посадки. */
export const PLAYER_COLORS = ['#d64545', '#3b7dd8', '#3fa34d', '#d9a441'];
