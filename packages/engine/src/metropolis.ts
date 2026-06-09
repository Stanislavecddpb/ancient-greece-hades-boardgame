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

/**
 * Проверяет триггеры Метрополии и при срабатывании немедленно списывает ресурс
 * (4 философа ИЛИ по одному зданию каждого типа) и переводит игрока в режим
 * выбора острова для установки Метрополии (G.metropolisPlace).
 *
 * Правила: набрав 4 философов или владея всеми 4 типами зданий, игрок ОБЯЗАН
 * немедленно сбросить их и поставить Метрополию на свободное место одного из
 * своих островов; при нехватке места — снести свои здания. Если свободных
 * островов нет (все с Метрополией или островов нет) — ресурс просто сбрасывается
 * («новая Метрополия заменяет старую»).
 */
export function checkMetropolis(G: CycladesState, pid: PlayerID): void {
  if (G.metropolisPlace) return; // уже идёт установка — добьём после неё
  const p = G.players[pid];

  let source: 'philosophers' | 'buildings' | null = null;
  if (p.philosophers >= PHILOSOPHERS_FOR_METROPOLIS) source = 'philosophers';
  else if (hasAllBuildingTypes(G, pid)) source = 'buildings';
  if (!source) return;

  // Ресурс списывается немедленно (требование «сбросить их»).
  if (source === 'philosophers') p.philosophers -= PHILOSOPHERS_FOR_METROPOLIS;
  else consumeOneOfEachBuilding(G, pid);

  const what = source === 'philosophers' ? '4 философа' : '4 здания';
  const candidates = islandsOf(G, pid).filter((i) => !i.hasMetropolis);
  if (candidates.length === 0) {
    // Ставить некуда (нет островов без Метрополии) — ресурс сброшен, замена.
    log(G, `${p.name}: Метрополия уже есть — ${what} сброшены (замена).`);
    return;
  }
  G.metropolisPlace = { playerId: pid, source };
  log(G, `${p.name} получает Метрополию (${what}) — выберите остров для установки.`);
}

/**
 * Установка Метрополии на выбранный свой остров (после срабатывания триггера).
 * Если на острове не хватает места — сносим свои здания на нём, пока не хватит.
 * Возвращает текст ошибки или null при успехе.
 */
export function applyPlaceMetropolis(G: CycladesState, pid: PlayerID, islandId: TerritoryId): string | null {
  const mp = G.metropolisPlace;
  if (!mp || mp.playerId !== pid) return 'сейчас не ваша установка Метрополии';
  const isl = G.territories[islandId];
  if (!isl || !isIsland(isl) || isl.ownerId !== pid) return 'нужен свой остров';
  if (isl.hasMetropolis) return 'на этом острове уже есть Метрополия';

  const need = metropolisSlotCost(isl);
  // Освобождаем место под Метрополию, снося собственные здания при нехватке.
  while (freeSlots(isl) < need && isl.buildings.length > 0) {
    const removed = isl.buildings.pop()!;
    log(G, `${G.players[pid].name}: снос здания (${removed.type}) под Метрополию на ${isl.name}.`);
  }
  if (freeSlots(isl) < need) return 'на острове не хватает места под Метрополию';

  isl.hasMetropolis = true;
  G.metropolisPlace = null;
  log(G, `${G.players[pid].name} возводит Метрополию на ${isl.name}.`);
  // Возможен второй триггер (например, были и 4 философа, и все 4 здания).
  checkMetropolis(G, pid);
  return null;
}
