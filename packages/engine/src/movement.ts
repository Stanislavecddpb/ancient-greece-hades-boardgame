import type { CycladesState, PlayerID, TerritoryId, Island } from './types';
import { isSea, isIsland } from './board';
import { resolveCombat, type DieRoll } from './combat';
import { log } from './helpers';
import { checkMetropolis } from './metropolis';

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

/** Двигает весь флот из fromId в toId; при встрече врага — морской бой. */
export function applyFleetMove(
  G: CycladesState,
  pid: PlayerID,
  fromId: TerritoryId,
  toId: TerritoryId,
  roll: DieRoll,
): string | null {
  const from = G.territories[fromId];
  const to = G.territories[toId];
  if (!from || !isSea(from) || from.ownerId !== pid || from.fleets <= 0) return 'нет своего флота';
  if (!to || !isSea(to)) return 'цель — не море';
  if (!fleetReachable(G, fromId, pid).has(toId)) return 'недостижимо';

  const moving = from.fleets;
  const enemy = to.fleets > 0 && to.ownerId !== pid;

  if (!enemy) {
    to.fleets += moving;
    to.ownerId = pid;
    from.fleets = 0;
    from.ownerId = null;
    log(G, `${G.players[pid].name}: флот идёт ${moving} → ${to.name}.`);
    return null;
  }

  // Морской бой.
  const defenderId = to.ownerId!;
  const bonus = navalDefenseBonus(G, toId, defenderId);
  const res = resolveCombat(moving, to.fleets, bonus, roll);
  from.fleets = 0;
  from.ownerId = null;
  if (res.attackerLeft > 0) {
    to.fleets = res.attackerLeft;
    to.ownerId = pid;
    log(G, `${G.players[pid].name} побеждает в море у ${to.name} (осталось ${res.attackerLeft} флота).`);
  } else {
    to.fleets = res.defenderLeft;
    log(G, `${G.players[pid].name} разбит в море у ${to.name}; у ${G.players[defenderId].name} осталось ${res.defenderLeft}.`);
  }
  return null;
}

// --- Войска ---

/** Острова, достижимые для войск с fromIsland по «мосту» из своих флотов. */
export function troopReachable(G: CycladesState, fromIslandId: TerritoryId, pid: PlayerID): Set<TerritoryId> {
  const from = G.territories[fromIslandId];
  const result = new Set<TerritoryId>();
  if (!from || !isIsland(from) || from.ownerId !== pid || from.troops <= 0) return result;

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

/** Двигает count войск с fromIsland на toIsland; при встрече врага — сухопутный бой. */
export function applyTroopMove(
  G: CycladesState,
  pid: PlayerID,
  fromIslandId: TerritoryId,
  toIslandId: TerritoryId,
  count: number,
  roll: DieRoll,
): string | null {
  const from = G.territories[fromIslandId];
  const to = G.territories[toIslandId];
  if (!from || !isIsland(from) || from.ownerId !== pid) return 'нет своего острова';
  if (!to || !isIsland(to)) return 'цель — не остров';
  if (!Number.isInteger(count) || count < 1 || count > from.troops) return 'неверное число войск';
  if (!troopReachable(G, fromIslandId, pid).has(toIslandId)) return 'недостижимо';

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

  // Сухопутный бой.
  const defenderId = to.ownerId!;
  const bonus = to.buildings.filter((b) => b.type === 'fortress').length;
  const res = resolveCombat(count, to.troops, bonus, roll);
  if (res.attackerLeft > 0) {
    captureIsland(G, to, pid, res.attackerLeft);
    log(G, `${G.players[pid].name} берёт остров ${to.name} (осталось ${res.attackerLeft} войск).`);
    checkMetropolis(G, pid);
  } else {
    to.troops = res.defenderLeft;
    log(G, `Атака на ${to.name} отбита; у ${G.players[defenderId].name} осталось ${res.defenderLeft}.`);
  }
  return null;
}

/** Передаёт остров новому владельцу со зданиями и метрополией. */
function captureIsland(G: CycladesState, island: Island, pid: PlayerID, troops: number): void {
  island.ownerId = pid;
  island.troops = troops;
  for (const b of island.buildings) b.ownerId = pid;
}
