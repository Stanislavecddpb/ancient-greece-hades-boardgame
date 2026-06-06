import { type CycladesState, type PlayerID, ALL_BUILDINGS, PHILOSOPHERS_FOR_METROPOLIS } from './types';
import { islandsOf, hasAllBuildingTypes, freeSlots, log } from './helpers';

/** Находит остров игрока со свободным слотом без Метрополии. */
function islandWithFreeSlot(G: CycladesState, pid: PlayerID) {
  return islandsOf(G, pid).find((i) => !i.hasMetropolis && freeSlots(i) > 0);
}

/** Снимает по одному зданию каждого из 4 типов (с любых островов игрока). */
function consumeOneOfEachBuilding(G: CycladesState, pid: PlayerID): void {
  const islands = islandsOf(G, pid);
  for (const type of ALL_BUILDINGS) {
    for (const island of islands) {
      const idx = island.buildings.findIndex((b) => b.type === type);
      if (idx >= 0) {
        island.buildings.splice(idx, 1);
        break;
      }
    }
  }
}

function placeMetropolis(G: CycladesState, pid: PlayerID, reason: string): boolean {
  const island = islandWithFreeSlot(G, pid);
  if (!island) return false;
  island.hasMetropolis = true;
  log(G, `${G.players[pid].name} строит Метрополию на острове ${island.name} (${reason}).`);
  return true;
}

/**
 * Проверяет и применяет образование Метрополий для игрока:
 * либо все 4 типа зданий, либо 4 философа. Вызывать после каждого действия,
 * которое строит здание или нанимает философа.
 */
export function checkMetropolis(G: CycladesState, pid: PlayerID): void {
  // Путь зданий: пока есть все 4 типа и куда поставить.
  while (hasAllBuildingTypes(G, pid)) {
    // Сначала освобождаем слот, снимая здания, затем ставим Метрополию.
    consumeOneOfEachBuilding(G, pid);
    if (!placeMetropolis(G, pid, '4 здания')) break;
  }

  // Путь философов.
  while (G.players[pid].philosophers >= PHILOSOPHERS_FOR_METROPOLIS) {
    G.players[pid].philosophers -= PHILOSOPHERS_FOR_METROPOLIS;
    if (!placeMetropolis(G, pid, '4 философа')) {
      // Некуда ставить — возвращаем философов и выходим.
      G.players[pid].philosophers += PHILOSOPHERS_FOR_METROPOLIS;
      break;
    }
  }
}
