import {
  type CycladesState,
  type Island,
  type PlayerID,
  type BuildingType,
  ALL_BUILDINGS,
} from './types';
import { isIsland } from './board';

/** Все острова под контролем игрока. */
export function islandsOf(G: CycladesState, pid: PlayerID): Island[] {
  return Object.values(G.territories).filter(
    (t): t is Island => isIsland(t) && t.ownerId === pid,
  );
}

/** Сколько Метрополий у игрока. */
export function metropolisCount(G: CycladesState, pid: PlayerID): number {
  return islandsOf(G, pid).filter((i) => i.hasMetropolis).length;
}

/** Типы зданий, которые есть у игрока (по всем его островам). */
export function buildingTypesOwned(G: CycladesState, pid: PlayerID): Set<BuildingType> {
  const types = new Set<BuildingType>();
  for (const island of islandsOf(G, pid)) {
    for (const b of island.buildings) types.add(b.type);
  }
  return types;
}

/** Есть ли у игрока все четыре типа зданий (для постройки Метрополии). */
export function hasAllBuildingTypes(G: CycladesState, pid: PlayerID): boolean {
  const owned = buildingTypesOwned(G, pid);
  return ALL_BUILDINGS.every((t) => owned.has(t));
}

/**
 * Сколько слотов занимает Метрополия на острове: на островах ≥2 клеток — 2,
 * на острове из 1 клетки — 1 (весь остров).
 */
export function metropolisSlotCost(island: Island): number {
  return Math.min(2, island.buildSlots);
}

/** Свободные слоты на острове (с учётом зданий и метрополии). */
export function freeSlots(island: Island): number {
  return island.buildSlots - island.buildings.length - (island.hasMetropolis ? metropolisSlotCost(island) : 0);
}

/** Добавляет запись в журнал событий. */
export function log(G: CycladesState, text: string): void {
  G.log.push({ cycle: G.cycle, text });
  // Храним последние 200 записей, чтобы состояние не разрасталось.
  if (G.log.length > 200) G.log.splice(0, G.log.length - 200);
}
