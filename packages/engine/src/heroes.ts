// Модуль 3 дополнения «Аид»: Герои. Нанимаются из общей колоды (как существа,
// но без скидки храмов), живут пока оплачивается апкип (2🪙/цикл), и могут
// пожертвовать собой в фазе действий ради сильного эффекта.

import {
  type CycladesState,
  type PlayerID,
  type TerritoryId,
  type BuildingType,
} from './types';
import { isIsland } from './board';
import { islandsOf, log } from './helpers';
import { checkMetropolis } from './metropolis';

export interface HeroDef {
  id: string;
  name: string;
  emblem: string;
  /** Боевая мощь (пассив в бою) — текст для интерфейса (реализация боя — позже). */
  warPower: string;
  /** Эффект самопожертвования (в фазе действий) — текст для интерфейса. */
  sacrifice: string;
}

/** Реестр Героев дополнения (6 шт.). */
export const HEROES: Record<string, HeroDef> = {
  achilles: { id: 'achilles', name: 'Ахиллес', emblem: '🛡️',
    warPower: 'В бою считается за 2 Войска',
    sacrifice: 'При 4 островах — постройте Метрополию' },
  ulysses: { id: 'ulysses', name: 'Улисс', emblem: '🧭',
    warPower: 'Атакуя, защитник без бонуса Крепости/Метрополии',
    sacrifice: 'Метрополия за Порт + Храм + Университет' },
  hector: { id: 'hector', name: 'Гектор', emblem: '🗡️',
    warPower: 'При атаке на него атакующий теряет 1 Войско до боя',
    sacrifice: '2 Жреца → 1 Философ, или 5 Жрецов → 2 Философа' },
  perseus: { id: 'perseus', name: 'Персей', emblem: '⚔️',
    warPower: 'Проигрывая раунд, 1 Войско отступает вместо гибели',
    sacrifice: 'Увести Войска с его острова на остров без Героя' },
  midas: { id: 'midas', name: 'Мидас', emblem: '👑',
    warPower: 'За 1🪙 — переброс костей в бою (сколько угодно)',
    sacrifice: 'За 15🪙 — постройте Метрополию' },
  penthesilea: { id: 'penthesilea', name: 'Пентесилея', emblem: '🏹',
    warPower: 'Побеждаете при ничьей (не теряете Войск)',
    sacrifice: 'Метрополия на секретном острове Амазонок (неуязвима)' },
};

export function isHero(id: string): boolean {
  return id in HEROES;
}

/** Пул Героев для замешивания в общую колоду существ. */
export function makeHeroPool(): string[] {
  return Object.keys(HEROES);
}

/** Ставит фигуру нанятого Героя на остров игрока (вызывается при покупке из рынка). */
export function placeHero(G: CycladesState, pid: PlayerID, heroId: string, islandId: TerritoryId): void {
  G.players[pid].heroes.push({ id: heroId, islandId, recruitedCycle: G.cycle });
  log(G, `${G.players[pid].name} нанимает Героя: ${HEROES[heroId]?.name ?? heroId}.`);
}

/** Любой Герой (любого игрока) стоит на этом острове? (для Персея и защиты Хирона). */
export function heroOnIsland(G: CycladesState, islandId: TerritoryId): boolean {
  return Object.values(G.players).some((p) => p.heroes.some((h) => h.islandId === islandId));
}

/** Убирает Героев проигравшего владельца с захваченного острова (Герои гибнут). */
export function removeHeroesOnCapture(G: CycladesState, islandId: TerritoryId, newOwner: PlayerID): void {
  for (const p of Object.values(G.players)) {
    if (p.id === newOwner) continue;
    const before = p.heroes.length;
    p.heroes = p.heroes.filter((h) => h.islandId !== islandId);
    if (p.heroes.length < before) log(G, `${p.name}: Герой гибнет при захвате острова.`);
  }
}

/**
 * Апкип Героев в начале цикла (после дохода): по 2🪙 за каждого Героя. Если у
 * игрока не хватает золота, Герой распускается (карта уходит из игры).
 */
export function payHeroUpkeep(G: CycladesState): void {
  for (const p of Object.values(G.players)) {
    if (p.isEliminated || p.heroes.length === 0) continue;
    const kept = [];
    for (const h of p.heroes) {
      if (p.gold >= 2) {
        p.gold -= 2;
        kept.push(h);
      } else {
        log(G, `${p.name}: Герой ${HEROES[h.id]?.name ?? h.id} исчезает (нечем платить апкип).`);
      }
    }
    p.heroes = kept;
    if (kept.length > 0) log(G, `${p.name} платит апкип Героев (${kept.length}×2🪙).`);
  }
}

/** Добровольно распустить Героя (чтобы не платить апкип в следующем цикле). */
export function applyDismissHero(G: CycladesState, pid: PlayerID, heroId: string): string | null {
  const p = G.players[pid];
  const idx = p.heroes.findIndex((h) => h.id === heroId);
  if (idx < 0) return 'нет такого Героя';
  p.heroes.splice(idx, 1);
  log(G, `${p.name} распускает Героя ${HEROES[heroId]?.name ?? heroId}.`);
  return null;
}

/** Снимает одно здание данного типа с островов игрока. true — снято. */
function removeOneBuilding(G: CycladesState, pid: PlayerID, type: BuildingType): boolean {
  for (const isl of islandsOf(G, pid)) {
    const i = isl.buildings.findIndex((b) => b.type === type);
    if (i >= 0) { isl.buildings.splice(i, 1); return true; }
  }
  return false;
}

/**
 * Самопожертвование Героя в фазе действий. `option` нужен Гектору ('2to1'|'5to2').
 * Нельзя жертвовать Героем в ход найма. Возвращает текст ошибки или null.
 */
export function applySacrificeHero(
  G: CycladesState, pid: PlayerID, heroId: string, option?: string,
): string | null {
  const p = G.players[pid];
  const hero = p.heroes.find((h) => h.id === heroId);
  if (!hero) return 'нет такого Героя';
  if (hero.recruitedCycle === G.cycle) return 'нельзя жертвовать Героем в ход найма';

  const setsMetropolis = heroId === 'achilles' || heroId === 'ulysses' || heroId === 'midas';
  if (setsMetropolis && G.metropolisPlace) return 'идёт установка Метрополии';
  if (heroId === 'perseus' && G.perseusMove) return 'уже идёт увод войск Персея';

  switch (heroId) {
    case 'achilles': {
      if (islandsOf(G, pid).length < 4) return 'нужно 4 острова';
      G.metropolisPlace = { playerId: pid, source: 'hero' };
      break;
    }
    case 'ulysses': {
      const isl = islandsOf(G, pid);
      const has = (t: BuildingType) => isl.some((i) => i.buildings.some((b) => b.type === t));
      if (!(has('port') && has('temple') && has('university'))) return 'нужны Порт, Храм и Университет';
      removeOneBuilding(G, pid, 'port');
      removeOneBuilding(G, pid, 'temple');
      removeOneBuilding(G, pid, 'university');
      G.metropolisPlace = { playerId: pid, source: 'hero' };
      break;
    }
    case 'hector': {
      if (option === '5to2') {
        if (p.priests < 5) return 'нужно 5 Жрецов';
        p.priests -= 5; p.philosophers += 2;
      } else {
        if (p.priests < 2) return 'нужно 2 Жреца';
        p.priests -= 2; p.philosophers += 1;
      }
      checkMetropolis(G, pid);
      break;
    }
    case 'perseus': {
      G.perseusMove = { playerId: pid, fromIsland: hero.islandId };
      break;
    }
    case 'midas': {
      if (p.gold < 15) return 'нужно 15🪙';
      p.gold -= 15;
      G.metropolisPlace = { playerId: pid, source: 'hero' };
      break;
    }
    case 'penthesilea': {
      p.secretMetropolis = true;
      log(G, `${p.name}: Пентесилея возводит Метрополию на секретном острове Амазонок.`);
      break;
    }
    default:
      return 'неизвестный Герой';
  }

  // Герой жертвует собой — карта уходит из игры (в сброс не кладётся).
  p.heroes = p.heroes.filter((h) => h !== hero);
  log(G, `${p.name}: Герой ${HEROES[heroId].name} жертвует собой. ${HEROES[heroId].sacrifice}.`);
  return null;
}

/**
 * Самопожертвование Персея: увести `count` войск с его острова на свой/пустой
 * остров без Героя. Возвращает текст ошибки или null.
 */
export function applyPerseusMove(
  G: CycladesState, pid: PlayerID, toIslandId: TerritoryId, count: number,
): string | null {
  const pm = G.perseusMove;
  if (!pm || pm.playerId !== pid) return 'сейчас не ваш Персей';
  const from = G.territories[pm.fromIsland];
  const to = G.territories[toIslandId];
  if (!from || !isIsland(from)) return 'нет острова Персея';
  if (!to || !isIsland(to)) return 'цель — не остров';
  if (toIslandId === pm.fromIsland) return 'нужен другой остров';
  if (heroOnIsland(G, toIslandId)) return 'остров защищён Героем';
  if (to.ownerId != null && to.ownerId !== pid && to.troops > 0) return 'через Персея — только на свой/пустой остров';
  count = Math.max(1, Math.min(Math.floor(count || 0), from.troops));
  if (from.troops <= 0) { G.perseusMove = null; return null; }

  from.troops -= count;
  if (to.ownerId == null || to.ownerId === pid) {
    to.troops += count;
    to.ownerId = pid;
  } else {
    to.ownerId = pid; // вражеский без войск — занимаем
    to.troops = count;
    for (const b of to.buildings) b.ownerId = pid;
  }
  G.perseusMove = null;
  log(G, `${G.players[pid].name}: Персей уводит ${count} войск → ${to.name}.`);
  return null;
}

/** Отменить увод войск Персея. */
export function endPerseus(G: CycladesState, pid: PlayerID): string | null {
  if (!G.perseusMove || G.perseusMove.playerId !== pid) return 'сейчас не ваш Персей';
  G.perseusMove = null;
  return null;
}
