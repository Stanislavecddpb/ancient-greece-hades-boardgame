import type { Ctx } from 'boardgame.io';
import {
  type CycladesState,
  type PlayerData,
  type PlayerID,
  PLAYER_COLORS,
  STARTING_GOLD,
  UNIT_SUPPLY,
} from './types';
import { createBoard, islandAtCell, seaAtCell } from './board';
import { createCreatureMarket } from './creatures';

/** Доступ к перемешиванию из плагина random boardgame.io (опционально). */
interface RandomAPI { Shuffle?: <T>(a: T[]) => T[] }

// Стартовое размещение по цветам (индекс места): красный, чёрный, синий, жёлтый.
// soldiers — клетки суши (по 1 войску), ships — морские клетки (по 1 флоту).
interface Placement {
  soldiers: [number, number][];
  ships: [number, number][];
}
const PLACEMENTS: Placement[] = [
  { soldiers: [[2, 1], [7, 6]], ships: [[2, 3], [6, 7]] }, // красный
  { soldiers: [[3, 5], [7, 1]], ships: [[6, 1], [4, 6]] }, // чёрный
  { soldiers: [[5, 2], [9, 6]], ships: [[6, 3], [9, 5]] }, // синий
  { soldiers: [[5, 5], [10, 2]], ships: [[6, 5], [11, 1]] }, // жёлтый
];

/** Строит начальное состояние партии под число игроков из ctx. */
export function setupGame(ctx: Ctx, random?: RandomAPI): CycladesState {
  const territories = createBoard();
  const players: Record<PlayerID, PlayerData> = {};

  ctx.playOrder.forEach((pid, i) => {
    const place = PLACEMENTS[i];
    let troopsPlaced = 0;
    let fleetsPlaced = 0;

    for (const [r, c] of place.soldiers) {
      const isl = islandAtCell(territories, r, c);
      if (isl) {
        isl.ownerId = pid;
        isl.troops += 1;
        troopsPlaced += 1;
      }
    }
    for (const [r, c] of place.ships) {
      const sea = seaAtCell(territories, r, c);
      if (sea) {
        sea.ownerId = pid;
        sea.fleets += 1;
        fleetsPlaced += 1;
      }
    }

    players[pid] = {
      id: pid,
      name: `Игрок ${Number(pid) + 1}`,
      color: PLAYER_COLORS[i % PLAYER_COLORS.length],
      gold: STARTING_GOLD,
      priests: 0,
      philosophers: 0,
      troopsSupply: UNIT_SUPPLY - troopsPlaced,
      fleetsSupply: UNIT_SUPPLY - fleetsPlaced,
      isEliminated: false,
    };
  });

  return {
    players,
    territories,
    cycle: 1,
    startIndex: 0,
    started: false,
    auction: null,
    actions: null,
    creatures: createCreatureMarket(random?.Shuffle),
    boardCreatures: [],
    pendingCornucopia: null,
    combat: null,
    fleetMove: null,
    sphinxResell: null,
    sylphMove: null,
    polyphemusPush: null,
    pegasusMove: null,
    chimeraPick: null,
    satyrSteal: null,
    cyclopsSwap: null,
    log: [{ cycle: 1, text: 'Партия началась. Боги ждут подношений.' }],
  };
}
