import { type CycladesState, type PlayerID, type TerritoryId, ALL_BUILDINGS, PHILOSOPHERS_FOR_METROPOLIS } from './types';
import { islandsOf, hasAllBuildingTypes, freeSlots, metropolisSlotCost, log } from './helpers';
import { isIsland } from './board';

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

/** Может ли игрок сейчас построить Метрополию: 4 разных здания или 4 философа. */
export function canBuildMetropolis(G: CycladesState, pid: PlayerID): boolean {
  return hasAllBuildingTypes(G, pid) || G.players[pid].philosophers >= PHILOSOPHERS_FOR_METROPOLIS;
}

/**
 * Ручная постройка Метрополии на выбранном своём острове, где есть место.
 * Тратит ресурс: либо по одному зданию каждого типа, либо 4 философов.
 * Возвращает текст ошибки или null при успехе.
 */
export function applyBuildMetropolis(G: CycladesState, pid: PlayerID, islandId: TerritoryId): string | null {
  const isl = G.territories[islandId];
  if (!isl || !isIsland(isl) || isl.ownerId !== pid) return 'нужен свой остров';
  if (isl.hasMetropolis) return 'на острове уже есть Метрополия';
  if (freeSlots(isl) < metropolisSlotCost(isl)) return 'на острове нет места под Метрополию';

  const byBuildings = hasAllBuildingTypes(G, pid);
  const byPhilosophers = G.players[pid].philosophers >= PHILOSOPHERS_FOR_METROPOLIS;
  if (!byBuildings && !byPhilosophers) return 'нужны 4 разных здания или 4 философа';

  if (byBuildings) consumeOneOfEachBuilding(G, pid);
  else G.players[pid].philosophers -= PHILOSOPHERS_FOR_METROPOLIS;

  isl.hasMetropolis = true;
  log(G, `${G.players[pid].name} строит Метрополию на острове ${isl.name}.`);
  return null;
}

/** Совместимость: Метрополия больше не образуется автоматически (строится вручную). */
export function checkMetropolis(_G: CycladesState, _pid: PlayerID): void {
  /* no-op */
}
