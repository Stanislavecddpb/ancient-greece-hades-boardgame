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
  /** Суммарно рогов изобилия на суше острова (печатные, неподвижные) — доход владельцу. */
  cornucopia: number;
  /** Маркеры процветания на острове (подвижные: Аполлон/Гермес; крадутся Фуриями). */
  prosperity: number;
  /** Точки отрисовки рогов на суше. */
  cornucopiaSpots: CornucopiaSpot[];
  adjacentSeas: TerritoryId[];
  // --- динамика ---
  /** Кто контролирует остров (его здания и доход). null — ничей. */
  ownerId: PlayerID | null;
  /** Войска владельца, стоящие на острове. */
  troops: number;
  /** Войска Нежити (Аид) на острове. Не дают золота Некрополю при гибели. */
  undeadTroops: number;
  buildings: Building[];
  hasMetropolis: boolean;
  /** На этом острове построен Некрополь (Модуль 2). */
  necropolis: boolean;
  /** Золото, накопленное на Некрополе этого острова (забирается в фазе дохода). */
  necropolisGold: number;
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
  /** Маркеры процветания в зоне (подвижные: Гермес) — доход держащему флот. */
  prosperity: number;
  adjacentSeas: TerritoryId[];
  adjacentIslands: TerritoryId[];
  // --- динамика ---
  ownerId: PlayerID | null;
  fleets: number;
  /** Флотилии Нежити (Аид) в зоне. */
  undeadFleets: number;
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
  /** Остаток фигурок Войск Нежити в запасе (Аид; сбрасывается каждый цикл). */
  undeadTroopsSupply: number;
  /** Остаток фигурок Флотилий Нежити в запасе (Аид; сбрасывается каждый цикл). */
  undeadFleetsSupply: number;
  isEliminated: boolean;
}

/** Один лот аукциона: бог и текущая ставка на нём. */
export interface GodSlot {
  god: GodName;
  /** Кто сейчас стоит на этом боге (последняя ставка). null — свободен. */
  occupantId: PlayerID | null;
  /** Текущая ставка золотом (для Аполлона всегда 0). */
  bid: number;
  /** Тайл этого бога накрыт Аидом: победитель получает действия Аида (Модуль 2). */
  isHades?: boolean;
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
  /** Этот пункт очереди — активация Аида (вместо обычного бога). */
  isHades?: boolean;
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
  /** Куплено ли существо в текущей активации (одно за ход). */
  creatureBought?: boolean;
  /** Прокручена ли колода существ Зевсом в текущей активации. */
  creatureCycled?: boolean;
}

/** Идёт интерактивный бой: каждый раунд атакующий решает бить дальше или отступить. */
export interface CombatState {
  kind: 'land' | 'naval';
  /** Оспариваемая клетка (остров для суши, море для флота). */
  location: TerritoryId;
  /** Откуда пришёл атакующий — куда вернутся выжившие при отступлении. */
  fromId: TerritoryId;
  attackerId: PlayerID;
  defenderId: PlayerID;
  attackerUnits: number;
  defenderUnits: number;
  /** Сколько из attackerUnits — Нежить (Аид). Остальные — обычные юниты. */
  attackerUndead?: number;
  /** Сколько из defenderUnits — Нежить (Аид). */
  defenderUndead?: number;
  /**
   * Порядок потерь атакующего, действующего Аидом: true — сначала гибнет Нежить
   * (по умолчанию), false — сначала обычные юниты. Защитник всегда теряет обычных
   * первыми. На Некрополь идёт золото только за обычные (не Нежить) потери.
   */
  loseUndeadFirst?: boolean;
  /** Бонус защитника (крепость/порт). */
  defenderBonus: number;
  round: number;
  /** Результат последнего раунда для интерфейса (aDie/dDie — выпавшие грани кости). */
  lastRoll: { attacker: number; defender: number; aDie: number; dDie: number; aLost: boolean; dLost: boolean } | null;
}

/**
 * Активный «приказ флоту» (Посейдон): за 1 монету ведём группу кораблей с одной
 * клетки на расстояние до 3, по пути можно высаживать корабли.
 */
export interface FleetMoveState {
  playerId: PlayerID;
  /** Где сейчас ведущая группа. */
  at: TerritoryId;
  /** Сколько кораблей в ведущей группе. */
  carrying: number;
  /** Сколько ещё переходов осталось (старт — дальность хода). */
  stepsLeft: number;
  /** Откуда начался приказ. */
  origin: TerritoryId;
  /** Списана ли монета (на первом переходе). */
  paid: boolean;
}

/**
 * Фигура существа, стоящая на доске (Минотавр/Хирон/Медуза/Полифем — на острове,
 * Кракен — на морской зоне). Действует до начала следующего хода владельца.
 */
export interface BoardCreature {
  /** id существа из каталога. */
  kind: string;
  ownerId: PlayerID;
  /** Клетка (остров или море), где стоит фигура. */
  location: TerritoryId;
  /** Цикл установки — для снятия в начале следующего хода владельца. */
  placedCycle: number;
}

/** Сильфида: бесплатное движение флота суммарно на N клеток (по 1 кораблю за шаг). */
export interface SylphMoveState {
  playerId: PlayerID;
  /** Сколько клеток-перемещений ещё осталось. */
  stepsLeft: number;
}

/** Полифем: отталкивание соседних флотов (управляет поставивший фигуру). */
export interface PolyphemusPushState {
  playerId: PlayerID;
  /** Остров с Полифемом — от него отталкиваем. */
  island: TerritoryId;
}

/** Циклоп: выбран свой остров, идёт замена одного из его зданий на другой тип. */
export interface CyclopsSwapState {
  playerId: PlayerID;
  islandId: TerritoryId;
}

/** Игрок обязан немедленно разместить Метрополию (набрал 4 философа или 4 разных здания). */
export interface MetropolisPlaceState {
  playerId: PlayerID;
  /** Откуда: 4 философа или 4 разных здания (ресурс уже списан). */
  source: 'philosophers' | 'buildings';
}

/** Рынок мифических существ: колода, открытые карты, сброс. */
export interface CreatureMarket {
  /** Колода рубашкой вверх (берём с начала). */
  deck: string[];
  /** Открытые слоты (3): id существа или null (купленный слот — рубашкой вверх). */
  market: (string | null)[];
  /** Сброшенные/использованные существа. */
  discard: string[];
}

export interface LogEntry {
  cycle: number;
  text: string;
}

/** Какие модули дополнения «Аид» включены в этой партии. */
export interface ModuleFlags {
  /** Модуль 2: Аид и его Нежить (трек угрозы, Нежить, Некрополь). */
  hades: boolean;
}

/** Трек угрозы Аида (Модуль 2): колонна 0..9, при достижении 9 Аид входит в игру. */
export interface HadesTrack {
  /** Позиция колонны на тайле Угрозы (0..9). */
  column: number;
  /** Аид активен в текущем цикле (накрыл бога над Аполлоном). */
  active: boolean;
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
  /** Игра началась (хост нажал «Начать»), очерёдность определена. */
  started: boolean;
  /** Активно во время фазы действий. */
  actions: ActionsState | null;
  /** Рынок мифических существ (общий, открытый). */
  creatures: CreatureMarket;
  /** Фигуры существ, стоящие на доске (постоянные эффекты до след. хода). */
  boardCreatures: BoardCreature[];
  /** Игрок, который должен поставить рог изобилия (первый выбравший Аполлона). */
  pendingCornucopia: PlayerID | null;
  /** Текущий бой (пошаговый с возможностью отступления) или null. */
  combat: CombatState | null;
  /** Активный приказ флоту (Посейдон) или null. */
  fleetMove: FleetMoveState | null;
  /** Игрок, распродающий юнитов Сфинксом (выбирает что и сколько), или null. */
  sphinxResell: PlayerID | null;
  /** Активное движение Сильфиды (флот на N клеток) или null. */
  sylphMove: SylphMoveState | null;
  /** Активное отталкивание флота Полифемом или null. */
  polyphemusPush: PolyphemusPushState | null;
  /** Игрок, перемещающий войска Пегасом (остров→остров без моста), или null. */
  pegasusMove: PlayerID | null;
  /** Игрок, выбирающий существо из сброса (Химера), или null. */
  chimeraPick: PlayerID | null;
  /** Игрок, выбирающий у кого украсть философа (Сатир), или null. */
  satyrSteal: PlayerID | null;
  /** Игрок, перемещающий маркер процветания (Фурии): выбирает источник и свой остров. */
  furiesMove: PlayerID | null;
  /** Замена здания Циклопом (выбран остров, идёт выбор типа) или null. */
  cyclopsSwap: CyclopsSwapState | null;
  /** Игрок обязан разместить Метрополию (сработал триггер 4 философа / 4 здания) или null. */
  metropolisPlace: MetropolisPlaceState | null;
  /** Включённые модули дополнения «Аид». */
  modules: ModuleFlags;
  /** Трек угрозы Аида (Модуль 2). */
  hades: HadesTrack;
  log: LogEntry[];
}

// --- Константы правил ---

/** Грани боевой кости Cyclades: 1, 1, 2, 2, 0, 3. */
export const COMBAT_DIE: number[] = [1, 1, 2, 2, 0, 3];

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

/** Цвета игроков по индексу посадки: красный, чёрный, синий, жёлтый. */
export const PLAYER_COLORS = ['#d64545', '#3b414b', '#3b7dd8', '#e0b341'];

// --- Константы Модуля 2 (Аид) ---

/** Деление трека Угрозы, при достижении/прохождении которого Аид входит в игру. */
export const HADES_THRESHOLD = 9;

/** Запас фигурок Нежити каждого типа (войска / флот) — сбрасывается каждый цикл. */
export const UNDEAD_SUPPLY = 5;

/**
 * Стоимость n-й Нежити за активацию Аида (0-индекс): 1-я бесплатно, далее 1/2/3/4🪙.
 * Всего за активацию можно нанять до 5 Нежити (1 бесплатная + 4 покупных).
 */
export const UNDEAD_RECRUIT_COSTS = [0, 1, 2, 3, 4];

/** Максимум Нежити за одну активацию Аида. */
export const MAX_UNDEAD_PER_TURN = 5;
