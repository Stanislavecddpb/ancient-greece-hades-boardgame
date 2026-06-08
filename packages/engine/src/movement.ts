import type { CycladesState, PlayerID, TerritoryId, Island } from './types';
import { isSea, isIsland } from './board';
import { oneRound, type DieRoll } from './combat';
import { log } from './helpers';
import { checkMetropolis } from './metropolis';
import { boardCreatureAt } from './creatures';

export const FLEET_RANGE = 3;

// --- Флот ---

/**
 * Морские клетки, куда может пойти флот из fromId (до 3 шагов). Проходить можно
 * через свои/пустые клетки; во вражескую можно войти как в конечную (бой), но не
 * сквозь неё.
 */
export function fleetReachable(G: CycladesState, fromId: TerritoryId, pid: PlayerID): Set<TerritoryId> {
  const origin = G.territories[fromId];
  const result = new Set<TerritoryId>();
  if (!origin || !isSea(origin) || origin.ownerId !== pid || origin.fleets <= 0) return result;

  const visited = new Set<TerritoryId>([fromId]);
  let frontier: Array<{ id: TerritoryId; d: number }> = [{ id: fromId, d: 0 }];
  while (frontier.length) {
    const next: typeof frontier = [];
    for (const { id, d } of frontier) {
      const sea = G.territories[id];
      if (!sea || !isSea(sea) || d >= FLEET_RANGE) continue;
      for (const nb of sea.adjacentSeas) {
        const t = G.territories[nb];
        if (!t || !isSea(t)) continue;
        const enemy = t.fleets > 0 && t.ownerId !== pid;
        if (enemy) {
          result.add(nb); // конечная клетка для атаки, дальше не идём
          continue;
        }
        if (!visited.has(nb)) {
          visited.add(nb);
          result.add(nb);
          next.push({ id: nb, d: d + 1 });
        }
      }
    }
    frontier = next;
  }
  result.delete(fromId);
  return result;
}

/** Бонус защиты в море: порты защитника на островах рядом с клеткой. */
function navalDefenseBonus(G: CycladesState, seaId: TerritoryId, defenderId: PlayerID): number {
  const sea = G.territories[seaId];
  if (!sea || !isSea(sea)) return 0;
  let bonus = 0;
  for (const iid of sea.adjacentIslands) {
    const isl = G.territories[iid];
    if (isl && isIsland(isl) && isl.ownerId === defenderId) {
      bonus += isl.buildings.filter((b) => b.type === 'port').length;
    }
  }
  return bonus;
}

/**
 * Начинает «приказ флоту»: ведущая группа = все корабли на клетке. Монета спишется
 * на первом переходе. Возвращает текст ошибки или null.
 */
export function startFleetMove(G: CycladesState, pid: PlayerID, seaId: TerritoryId): string | null {
  if (G.combat) return 'идёт бой';
  if (G.fleetMove) return 'уже идёт перемещение';
  const sea = G.territories[seaId];
  if (!sea || !isSea(sea) || sea.ownerId !== pid || sea.fleets <= 0) return 'нет своего флота';
  if (G.players[pid].gold < 1) return 'нужна 1 монета';
  G.fleetMove = { playerId: pid, at: seaId, carrying: sea.fleets, stepsLeft: FLEET_RANGE, origin: seaId, paid: false };
  return null;
}

/** Закрыта ли морская зона для флота: Кракен в ней или Полифем на соседнем острове. */
function seaBlockedForFleet(G: CycladesState, seaId: TerritoryId): boolean {
  if (G.boardCreatures.some((c) => c.kind === 'kraken' && c.location === seaId)) return true;
  const sea = G.territories[seaId];
  if (sea && isSea(sea)) {
    for (const iid of sea.adjacentIslands) {
      if (G.boardCreatures.some((c) => c.kind === 'polyphemus' && c.location === iid)) return true;
    }
  }
  return false;
}

/** Медуза на острове запрещает уводить с него войска. */
function medusaLocks(G: CycladesState, islandId: TerritoryId): boolean {
  return G.boardCreatures.some((c) => c.kind === 'medusa' && c.location === islandId);
}

/**
 * Один переход приказа: ведёт `take` кораблей из текущей клетки в соседнюю.
 * Оставшиеся (carrying − take) высаживаются и остаются на месте. Вход во вражескую
 * клетку начинает морской бой и завершает приказ.
 */
export function hopFleet(G: CycladesState, pid: PlayerID, toId: TerritoryId, take: number): string | null {
  const m = G.fleetMove;
  if (!m || m.playerId !== pid) return 'нет перемещения';
  if (m.stepsLeft <= 0) return 'ходы закончились';
  const at = G.territories[m.at];
  const to = G.territories[toId];
  if (!at || !isSea(at) || !to || !isSea(to)) return 'не море';
  if (!at.adjacentSeas.includes(toId)) return 'не соседняя клетка';
  if (!Number.isInteger(take) || take < 1 || take > m.carrying) return 'неверное число кораблей';
  if (seaBlockedForFleet(G, toId)) return 'зона закрыта (Кракен/Полифем)';

  // Оплата приказа — на первом переходе.
  if (!m.paid) {
    if (G.players[pid].gold < 1) return 'нужна 1 монета';
    G.players[pid].gold -= 1;
    m.paid = true;
    log(G, `${G.players[pid].name}: приказ флоту (−1🪙).`);
  }

  // Снимаем ведомые корабли с текущей клетки.
  at.fleets -= take;
  if (at.fleets === 0) at.ownerId = null;

  const enemy = to.fleets > 0 && to.ownerId !== pid;
  if (enemy) {
    const defenderId = to.ownerId!;
    G.combat = {
      kind: 'naval', location: toId, fromId: m.at,
      attackerId: pid, defenderId,
      attackerUnits: take, defenderUnits: to.fleets,
      defenderBonus: navalDefenseBonus(G, toId, defenderId),
      round: 0, lastRoll: null,
    };
    log(G, `${G.players[pid].name} атакует флот у ${to.name} (${take} против ${to.fleets}).`);
    G.fleetMove = null; // приказ завершён — идёт бой
    return null;
  }

  to.fleets += take;
  to.ownerId = pid;
  log(G, `${G.players[pid].name}: флот ${take} → ${to.name}.`);
  m.at = toId;
  m.carrying = take;
  m.stepsLeft -= 1;
  if (m.stepsLeft <= 0) G.fleetMove = null; // дальше нельзя
  return null;
}

/** Завершает приказ флоту досрочно (оставшиеся корабли стоят на текущей клетке). */
export function endFleetMove(G: CycladesState, pid: PlayerID): string | null {
  const m = G.fleetMove;
  if (!m || m.playerId !== pid) return 'нет перемещения';
  G.fleetMove = null;
  return null;
}

/** Сильфида: один шаг — двигает 1 корабль в соседнюю свою/пустую клетку, тратит 1 из бюджета. */
export function applySylphStep(G: CycladesState, pid: PlayerID, fromSeaId: TerritoryId, toSeaId: TerritoryId): string | null {
  const m = G.sylphMove;
  if (!m || m.playerId !== pid) return 'нет движения Сильфиды';
  if (m.stepsLeft <= 0) return 'клетки закончились';
  const from = G.territories[fromSeaId];
  const to = G.territories[toSeaId];
  if (!from || !isSea(from) || from.ownerId !== pid || from.fleets <= 0) return 'нет своего флота';
  if (!to || !isSea(to)) return 'цель — не море';
  if (!from.adjacentSeas.includes(toSeaId)) return 'не соседняя клетка';
  if (to.fleets > 0 && to.ownerId !== pid) return 'через Сильфиду нельзя входить во вражескую зону';
  if (seaBlockedForFleet(G, toSeaId)) return 'зона закрыта (Кракен/Полифем)';
  from.fleets -= 1;
  if (from.fleets === 0) from.ownerId = null;
  to.fleets += 1;
  to.ownerId = pid;
  m.stepsLeft -= 1;
  log(G, `${G.players[pid].name}: Сильфида двигает корабль → ${to.name} (осталось ${m.stepsLeft}).`);
  if (m.stepsLeft <= 0) G.sylphMove = null;
  return null;
}

/** Завершить движение Сильфиды досрочно. */
export function endSylph(G: CycladesState, pid: PlayerID): string | null {
  if (!G.sylphMove || G.sylphMove.playerId !== pid) return 'нет движения Сильфиды';
  G.sylphMove = null;
  return null;
}

/**
 * Полифем: поставивший игрок отодвигает соседний с островом флот (даже чужой)
 * на одну клетку дальше от острова. Двигается весь стек; цвета не смешиваются.
 */
export function applyPushFleet(G: CycladesState, pid: PlayerID, fromSeaId: TerritoryId, toSeaId: TerritoryId): string | null {
  const pp = G.polyphemusPush;
  if (!pp || pp.playerId !== pid) return 'нет отталкивания';
  const island = G.territories[pp.island];
  if (!island || !isIsland(island)) return 'нет острова Полифема';
  const from = G.territories[fromSeaId];
  const to = G.territories[toSeaId];
  if (!from || !isSea(from) || from.fleets <= 0) return 'нет флота для отталкивания';
  if (!island.adjacentSeas.includes(fromSeaId)) return 'эта зона не рядом с Полифемом';
  if (!to || !isSea(to)) return 'цель — не море';
  if (!from.adjacentSeas.includes(toSeaId)) return 'не соседняя клетка';
  if (island.adjacentSeas.includes(toSeaId)) return 'нужно отодвинуть дальше от острова';
  if (seaBlockedForFleet(G, toSeaId)) return 'зона закрыта (Кракен/Полифем)';
  if (to.fleets > 0 && to.ownerId !== from.ownerId) return 'там флот другого цвета';

  to.fleets += from.fleets;
  to.ownerId = from.ownerId;
  from.fleets = 0;
  from.ownerId = null;
  log(G, `Полифем отталкивает флот → ${to.name}.`);

  // Если рядом с островом больше нет флота — отталкивание завершено.
  const more = island.adjacentSeas.some((sid) => {
    const s = G.territories[sid];
    return isSea(s) && s.fleets > 0;
  });
  if (!more) G.polyphemusPush = null;
  return null;
}

/** Завершить отталкивание Полифемом досрочно. */
export function endPolyphemus(G: CycladesState, pid: PlayerID): string | null {
  if (!G.polyphemusPush || G.polyphemusPush.playerId !== pid) return 'нет отталкивания';
  G.polyphemusPush = null;
  return null;
}

/**
 * Пегас: переброска войск с одного своего острова на другой без «моста» из флотов
 * (и без боя — только между своими островами). Один перенос, затем режим закрывается.
 */
export function applyPegasusMove(
  G: CycladesState, pid: PlayerID, fromIslandId: TerritoryId, toIslandId: TerritoryId, count: number,
): string | null {
  if (G.pegasusMove !== pid) return 'нет переброски Пегаса';
  const from = G.territories[fromIslandId];
  const to = G.territories[toIslandId];
  if (!from || !isIsland(from) || from.ownerId !== pid || from.troops <= 0) return 'нет своего острова с войсками';
  if (!to || !isIsland(to) || to.ownerId !== pid) return 'цель — не ваш остров';
  if (fromIslandId === toIslandId) return 'нужен другой остров';
  if (!Number.isInteger(count) || count < 1 || count > from.troops) return 'неверное число войск';
  from.troops -= count;
  to.troops += count;
  log(G, `${G.players[pid].name}: Пегас переносит ${count} войск → ${to.name}.`);
  G.pegasusMove = null;
  return null;
}

/** Отменить переброску Пегасом (ничего не двигая). */
export function endPegasus(G: CycladesState, pid: PlayerID): string | null {
  if (G.pegasusMove !== pid) return 'нет переброски Пегаса';
  G.pegasusMove = null;
  return null;
}

// --- Войска ---

/** Острова, достижимые для войск с fromIsland по «мосту» из своих флотов. */
export function troopReachable(G: CycladesState, fromIslandId: TerritoryId, pid: PlayerID): Set<TerritoryId> {
  const from = G.territories[fromIslandId];
  const result = new Set<TerritoryId>();
  if (!from || !isIsland(from) || from.ownerId !== pid || from.troops <= 0) return result;
  if (medusaLocks(G, fromIslandId)) return result; // Медуза: войска нельзя уводить

  // BFS по морским клеткам с нашим флотом, стартуя от морей рядом с островом.
  const bridgeVisited = new Set<TerritoryId>();
  const queue: TerritoryId[] = [];
  for (const sid of from.adjacentSeas) {
    const s = G.territories[sid];
    if (s && isSea(s) && s.ownerId === pid && s.fleets > 0) { queue.push(sid); bridgeVisited.add(sid); }
  }
  while (queue.length) {
    const sid = queue.shift()!;
    const sea = G.territories[sid];
    if (!sea || !isSea(sea)) continue;
    // острова рядом с этой клеткой моста — достижимы
    for (const iid of sea.adjacentIslands) {
      if (iid !== fromIslandId) result.add(iid);
    }
    for (const nb of sea.adjacentSeas) {
      const s = G.territories[nb];
      if (s && isSea(s) && s.ownerId === pid && s.fleets > 0 && !bridgeVisited.has(nb)) {
        bridgeVisited.add(nb);
        queue.push(nb);
      }
    }
  }
  return result;
}

/** Двигает count войск с fromIsland на toIsland; при встрече врага — начинает сухопутный бой. */
export function applyTroopMove(
  G: CycladesState,
  pid: PlayerID,
  fromIslandId: TerritoryId,
  toIslandId: TerritoryId,
  count: number,
): string | null {
  if (G.combat) return 'идёт бой';
  const from = G.territories[fromIslandId];
  const to = G.territories[toIslandId];
  if (!from || !isIsland(from) || from.ownerId !== pid) return 'нет своего острова';
  if (medusaLocks(G, fromIslandId)) return 'остров под Медузой: войска нельзя уводить';
  if (!to || !isIsland(to)) return 'цель — не остров';
  if (!Number.isInteger(count) || count < 1) return 'неверное число войск';
  if (count > 3) return 'не больше 3 войск за перемещение';
  if (count > from.troops) return 'столько войск нет на острове';
  if (!troopReachable(G, fromIslandId, pid).has(toIslandId)) return 'недостижимо';
  if (G.players[pid].gold < 1) return 'нужна 1 монета';

  // Перемещение войск по «мосту» из кораблей стоит 1 монету.
  G.players[pid].gold -= 1;
  const enemy = to.ownerId != null && to.ownerId !== pid && to.troops > 0;
  from.troops -= count;

  if (!enemy) {
    // Свой / нейтральный / пустой остров — занимаем.
    if (to.ownerId == null || to.ownerId === pid) {
      to.troops += count;
      to.ownerId = pid;
    } else {
      // вражеский, но без войск — захват
      captureIsland(G, to, pid, count);
    }
    log(G, `${G.players[pid].name}: ${count} войск → ${to.name}.`);
    return null;
  }

  // Начинаем сухопутный бой: войска «в пути», управляются через G.combat.
  const defenderId = to.ownerId!;
  // Минотавр на острове добавляет +2 к защите (считается за 2 войска).
  const minotaurBonus = boardCreatureAt(G, toIslandId)?.kind === 'minotaur' ? 2 : 0;
  G.combat = {
    kind: 'land', location: toIslandId, fromId: fromIslandId,
    attackerId: pid, defenderId,
    attackerUnits: count, defenderUnits: to.troops,
    defenderBonus: to.buildings.filter((b) => b.type === 'fortress').length + minotaurBonus,
    round: 0, lastRoll: null,
  };
  log(G, `${G.players[pid].name} штурмует ${to.name} (${count} против ${to.troops}).`);
  return null;
}

/** Завершает бой: применяет исход к клетке (победа/поражение/отступление). */
function finishCombat(G: CycladesState, result: 'attacker' | 'defender' | 'retreat'): void {
  const c = G.combat;
  if (!c) return;
  const loc = G.territories[c.location];

  if (c.kind === 'naval' && isSea(loc)) {
    if (result === 'attacker') {
      loc.fleets = c.attackerUnits;
      loc.ownerId = c.attackerId;
    } else {
      loc.fleets = c.defenderUnits;
      loc.ownerId = loc.fleets > 0 ? c.defenderId : null;
      if (result === 'retreat') {
        const src = G.territories[c.fromId];
        if (src && isSea(src)) { src.fleets += c.attackerUnits; src.ownerId = c.attackerId; }
      }
    }
  } else if (c.kind === 'land' && isIsland(loc)) {
    if (result === 'attacker') {
      captureIsland(G, loc, c.attackerId, c.attackerUnits);
      checkMetropolis(G, c.attackerId);
    } else {
      loc.troops = c.defenderUnits; // защитник удерживает остров (контроль остаётся за ним)
      if (result === 'retreat') {
        const src = G.territories[c.fromId];
        if (src && isIsland(src)) src.troops += c.attackerUnits;
      }
    }
  }
  G.combat = null;
}

/** Один раунд текущего боя; при гибели стороны бой завершается. */
export function applyCombatRound(G: CycladesState, pid: PlayerID, roll: DieRoll): string | null {
  const c = G.combat;
  if (!c) return 'нет боя';
  if (c.attackerId !== pid) return 'не ваш бой';
  oneRound(c, roll);
  // Синхронизируем видимые юниты защитника на клетке.
  const loc = G.territories[c.location];
  if (c.kind === 'naval' && isSea(loc)) loc.fleets = c.defenderUnits;
  if (c.kind === 'land' && isIsland(loc)) loc.troops = c.defenderUnits;

  const locName = loc?.name ?? '?';
  if (c.defenderUnits <= 0 && c.attackerUnits > 0) {
    log(G, `${G.players[c.attackerId].name} захватывает ${locName} (осталось ${c.attackerUnits}).`);
    finishCombat(G, 'attacker');
  } else if (c.attackerUnits <= 0) {
    log(G, `Атака на ${locName} отбита; у ${G.players[c.defenderId].name} осталось ${c.defenderUnits}.`);
    finishCombat(G, 'defender');
  }
  return null;
}

/** Отступление атакующего: выжившие возвращаются на исходную клетку. */
export function applyCombatRetreat(G: CycladesState, pid: PlayerID): string | null {
  const c = G.combat;
  if (!c) return 'нет боя';
  if (c.attackerId !== pid) return 'не ваш бой';
  const loc = G.territories[c.location];
  log(G, `${G.players[c.attackerId].name} отступает от ${loc?.name ?? '?'} (${c.attackerUnits}).`);
  finishCombat(G, 'retreat');
  return null;
}

/** Передаёт остров новому владельцу со зданиями и метрополией. */
function captureIsland(G: CycladesState, island: Island, pid: PlayerID, troops: number): void {
  island.ownerId = pid;
  island.troops = troops;
  for (const b of island.buildings) b.ownerId = pid;
}
