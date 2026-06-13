// Модуль 2 дополнения «Аид»: трек Угрозы, появление Аида, наём Нежити,
// постройка Некрополя и сброс в конце цикла, где Аид был активен.

import {
  type CycladesState,
  type PlayerID,
  type TerritoryId,
  HADES_THRESHOLD,
  UNDEAD_SUPPLY,
  UNDEAD_RECRUIT_COSTS,
  MAX_UNDEAD_PER_TURN,
} from './types';
import { isIsland, isSea } from './board';
import { log } from './helpers';
import { necropolisIsland } from './income';

/**
 * Двигает колонну Аида на сумму двух кубиков в начале цикла. Если колонна
 * достигает деления «9» или проходит через него — Аид входит в игру (active=true);
 * пометку слота над Аполлоном ставит фаза аукциона (markHadesSlot). Возвращает
 * true, если Аид появился в этом цикле.
 */
export function advanceHadesTrack(G: CycladesState, d1: number, d2: number): boolean {
  if (!G.modules.hades) return false;
  if (G.hades.active) return true; // уже активен (на всякий случай)
  const sum = d1 + d2;
  const target = G.hades.column + sum;
  if (target >= HADES_THRESHOLD) {
    G.hades.column = HADES_THRESHOLD;
    G.hades.active = true;
    log(G, `Колонна Аида проходит «9» (${d1}+${d2}): Аид входит в игру!`);
    return true;
  }
  G.hades.column = target;
  log(G, `Колонна Аида движется на ${sum} (${d1}+${d2}) → деление ${target}.`);
  return false;
}

/**
 * В фазе аукциона: если Аид активен, его тайл накрывает бога «сразу над
 * Аполлоном» — последний слот на Дорожке Богов. Победитель этого слота в фазе
 * действий получает действия Аида.
 */
export function markHadesSlot(G: CycladesState): void {
  if (!G.hades.active) return;
  const a = G.auction;
  if (!a || a.slots.length === 0) return;
  const slot = a.slots[a.slots.length - 1];
  slot.isHades = true;
  log(G, `Тайл Аида накрывает ${slot.god} (бог над Аполлоном).`);
}

/** Стоимость следующей Нежити при уже нанятых `recruited` за активацию. */
export function undeadCost(recruited: number): number {
  return UNDEAD_RECRUIT_COSTS[Math.min(recruited, UNDEAD_RECRUIT_COSTS.length - 1)];
}

/** Можно ли поставить Флотилию Нежити в эту морскую зону (рядом со своим островом, не у врага). */
function canPlaceUndeadFleet(G: CycladesState, pid: PlayerID, seaId: TerritoryId): boolean {
  const sea = G.territories[seaId];
  if (!sea || !isSea(sea)) return false;
  // Зона занята врагом (его обычный или мёртвый флот) — нельзя.
  if ((sea.fleets > 0 || sea.undeadFleets > 0) && sea.ownerId !== pid) return false;
  const touchesOwnIsland = sea.adjacentIslands.some((iid) => {
    const isl = G.territories[iid];
    return isl && isIsland(isl) && isl.ownerId === pid;
  });
  return touchesOwnIsland || sea.ownerId === pid;
}

/**
 * Наём одной Нежити (Войско или Флотилия) за активацию Аида. Первая бесплатно,
 * далее 1/2/3/4🪙; всего до 5 за активацию. Возвращает текст ошибки или null.
 */
export function applyRecruitUndead(
  G: CycladesState, pid: PlayerID, kind: 'troop' | 'fleet', targetId?: TerritoryId,
): string | null {
  const s = G.actions;
  if (!s) return 'нет фазы действий';
  if (s.recruited >= MAX_UNDEAD_PER_TURN) return 'лимит найма Нежити за ход';
  const cost = undeadCost(s.recruited);
  const player = G.players[pid];
  if (player.gold < cost) return 'не хватает золота';

  if (kind === 'troop') {
    if (player.undeadTroopsSupply <= 0) return 'нет фигурок Войск Нежити';
    const isl = targetId ? G.territories[targetId] : undefined;
    if (!isl || !isIsland(isl) || isl.ownerId !== pid) return 'нужен свой остров';
    isl.undeadTroops += 1;
    player.undeadTroopsSupply -= 1;
  } else {
    if (player.undeadFleetsSupply <= 0) return 'нет фигурок Флотилий Нежити';
    if (!targetId || !canPlaceUndeadFleet(G, pid, targetId)) return 'нельзя разместить Нежить здесь';
    const sea = G.territories[targetId];
    if (!isSea(sea)) return 'нужна морская зона';
    sea.undeadFleets += 1;
    sea.ownerId = pid;
    player.undeadFleetsSupply -= 1;
  }

  player.gold -= cost;
  s.recruited += 1;
  log(G, `${player.name}: Аид призывает Нежить (${kind === 'troop' ? 'Войско' : 'Флотилия'}) за ${cost}🪙.`);
  return null;
}

/**
 * Постройка Некрополя на своём острове (Аид). Некрополь занимает место Метрополии:
 * сносит все постройки и Метрополию на острове. На поле может быть только один
 * Некрополь — при наличии другого он переносится (ЗМ остаются на старом острове).
 * Возвращает текст ошибки или null.
 */
export function applyBuildNecropolis(G: CycladesState, pid: PlayerID, islandId: TerritoryId): string | null {
  const s = G.actions;
  if (!s) return 'нет фазы действий';
  if (s.built) return 'постройка уже сделана в этот ход';
  const isl = G.territories[islandId];
  if (!isl || !isIsland(isl) || isl.ownerId !== pid) return 'нужен свой остров';
  if (isl.necropolis) return 'на этом острове уже есть Некрополь';

  // Переносим существующий Некрополь (его накопленное золото остаётся на старом острове).
  const existing = necropolisIsland(G);
  if (existing) {
    existing.necropolis = false;
    log(G, `Некрополь переносится с ${existing.name} (ЗМ остаются там).`);
  }

  // Некрополь занимает место Метрополии: сносим всё на острове.
  if (isl.buildings.length > 0 || isl.hasMetropolis) {
    isl.buildings = [];
    isl.hasMetropolis = false;
    log(G, `Постройки на ${isl.name} снесены под Некрополь.`);
  }
  isl.necropolis = true;
  s.built = true;
  log(G, `${G.players[pid].name} строит Некрополь на ${isl.name}.`);
  return null;
}

/**
 * Конец цикла, в котором Аид был активен: вся Нежить уходит с поля и
 * возвращается в запас, тайл Угрозы переворачивается, колонна на «0».
 * Безопасно вызывать всегда — срабатывает только при active.
 */
export function endHadesCycle(G: CycladesState): void {
  if (!G.modules.hades || !G.hades.active) return;
  for (const t of Object.values(G.territories)) {
    if (isIsland(t)) t.undeadTroops = 0;
    if (isSea(t)) {
      t.undeadFleets = 0;
      if (t.fleets === 0) t.ownerId = null; // зона держалась только Нежитью
    }
  }
  for (const p of Object.values(G.players)) {
    p.undeadTroopsSupply = UNDEAD_SUPPLY;
    p.undeadFleetsSupply = UNDEAD_SUPPLY;
  }
  G.hades = { column: 0, active: false };
  log(G, 'Аид и его Нежить возвращаются в страну мёртвых. Трек Угрозы сброшен.');
}
