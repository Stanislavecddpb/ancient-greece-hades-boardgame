import {
  type CycladesState,
  type PlayerID,
  type CreatureMarket,
  UNIT_SUPPLY,
  ALL_BUILDINGS,
} from './types';
import { isIsland, isSea } from './board';
import { islandsOf, log } from './helpers';
import { incomeFor } from './income';
import { canPlaceFleet } from './actions';
import { checkMetropolis } from './metropolis';

/** Куда нужно нацелить существо при покупке (или none — без цели). */
export type CreatureTarget = 'none' | 'own-island' | 'own-sea' | 'enemy-island' | 'enemy-sea';

export interface CreatureDef {
  id: string;
  name: string;
  emblem: string;
  /** Базовая цена; храмы снижают (минимум 1). */
  cost: number;
  target: CreatureTarget;
  /** Короткое описание эффекта для интерфейса. */
  desc: string;
  /** Применяет эффект (цель уже проверена снаружи). Возвращает текст ошибки или null. */
  apply: (G: CycladesState, pid: PlayerID, targetId?: string) => string | null;
}

/** Богатейший соперник игрока pid (живой, с золотом > 0) или null. */
function richestOpponent(G: CycladesState, pid: PlayerID): PlayerID | null {
  let best: PlayerID | null = null;
  for (const [id, p] of Object.entries(G.players)) {
    if (id === pid || p.isEliminated || p.gold <= 0) continue;
    if (best === null || p.gold > G.players[best].gold) best = id;
  }
  return best;
}

/** Соперник с наибольшим значением поля (priests/philosophers), > 0, или null. */
function opponentWithMost(G: CycladesState, pid: PlayerID, field: 'priests' | 'philosophers'): PlayerID | null {
  let best: PlayerID | null = null;
  for (const [id, p] of Object.entries(G.players)) {
    if (id === pid || p.isEliminated || p[field] <= 0) continue;
    if (best === null || p[field] > G.players[best][field]) best = id;
  }
  return best;
}

/**
 * Каталог мифических существ (имена — как в правилах). Эффекты немедленные.
 * Часть существ в оригинале «ставится фигурой на остров» и действует до
 * следующего хода; здесь они реализованы ближайшим немедленным эффектом.
 */
export const CREATURES: Record<string, CreatureDef> = {
  chimera: {
    id: 'chimera', name: 'Химера', emblem: '🦁', cost: 4, target: 'none',
    desc: 'Перетасуйте сброс обратно в колоду',
    apply: (G) => {
      G.creatures.deck.push(...G.creatures.discard);
      G.creatures.discard = [];
      return null;
    },
  },
  cyclops: {
    id: 'cyclops', name: 'Циклоп', emblem: '🛠️', cost: 2, target: 'own-island',
    desc: 'Замените здание на острове на другой тип',
    apply: (G, pid, tid) => {
      const isl = G.territories[tid!];
      if (!isIsland(isl) || isl.buildings.length === 0) return 'нужно своё здание';
      const missing = ALL_BUILDINGS.find((t) => !isl.buildings.some((b) => b.type === t));
      if (!missing) return 'все типы зданий уже есть';
      isl.buildings[0] = { type: missing, ownerId: pid };
      checkMetropolis(G, pid);
      return null;
    },
  },
  dryad: {
    id: 'dryad', name: 'Дриада', emblem: '🌳', cost: 2, target: 'none',
    desc: 'Украдите жреца у соперника',
    apply: (G, pid) => {
      const v = opponentWithMost(G, pid, 'priests');
      if (!v) return 'не у кого красть жреца';
      G.players[v].priests -= 1;
      G.players[pid].priests += 1;
      return null;
    },
  },
  fates: {
    id: 'fates', name: 'Мойры', emblem: '🧵', cost: 3, target: 'none',
    desc: 'Получите доход ещё раз',
    apply: (G, pid) => { G.players[pid].gold += incomeFor(G, pid); return null; },
  },
  giant: {
    id: 'giant', name: 'Гигант', emblem: '🗿', cost: 3, target: 'enemy-island',
    desc: 'Разрушьте здание на вражеском острове (не Метрополию)',
    apply: (G, _pid, tid) => {
      const isl = G.territories[tid!];
      if (!isIsland(isl) || isl.buildings.length === 0) return 'нет здания для сноса';
      isl.buildings.pop();
      return null;
    },
  },
  griffon: {
    id: 'griffon', name: 'Грифон', emblem: '🦅', cost: 3, target: 'none',
    desc: 'Украдите половину золота богатейшего соперника',
    apply: (G, pid) => {
      const v = richestOpponent(G, pid);
      if (!v) return null;
      const stolen = Math.floor(G.players[v].gold / 2);
      G.players[v].gold -= stolen;
      G.players[pid].gold += stolen;
      return null;
    },
  },
  harpy: {
    id: 'harpy', name: 'Гарпия', emblem: '🪶', cost: 2, target: 'enemy-island',
    desc: 'Уберите вражеского воина (вернётся в запас владельцу)',
    apply: (G, _pid, tid) => {
      const isl = G.territories[tid!];
      if (!isIsland(isl) || isl.troops <= 0 || !isl.ownerId) return 'нет вражеского войска';
      isl.troops -= 1;
      G.players[isl.ownerId].troopsSupply = Math.min(UNIT_SUPPLY, G.players[isl.ownerId].troopsSupply + 1);
      return null;
    },
  },
  pegasus: {
    id: 'pegasus', name: 'Пегас', emblem: '🐎', cost: 3, target: 'own-island',
    desc: 'Призовите до 2 воинов на свой остров',
    apply: (G, pid, tid) => {
      const p = G.players[pid];
      if (p.troopsSupply <= 0) return 'нет фигурок войск в запасе';
      const isl = G.territories[tid!];
      if (!isIsland(isl)) return 'нужен остров';
      const add = Math.min(2, p.troopsSupply);
      isl.troops += add;
      p.troopsSupply -= add;
      return null;
    },
  },
  satyr: {
    id: 'satyr', name: 'Сатир', emblem: '🍇', cost: 2, target: 'none',
    desc: 'Украдите философа у соперника',
    apply: (G, pid) => {
      const v = opponentWithMost(G, pid, 'philosophers');
      if (!v) return 'не у кого красть философа';
      G.players[v].philosophers -= 1;
      G.players[pid].philosophers += 1;
      checkMetropolis(G, pid);
      return null;
    },
  },
  siren: {
    id: 'siren', name: 'Сирена', emblem: '🎶', cost: 3, target: 'enemy-sea',
    desc: 'Уберите вражеский корабль; если зона опустела — займите её своим',
    apply: (G, pid, tid) => {
      const sea = G.territories[tid!];
      if (!isSea(sea) || sea.fleets <= 0 || !sea.ownerId) return 'нет вражеского флота';
      const owner = sea.ownerId;
      sea.fleets -= 1;
      G.players[owner].fleetsSupply = Math.min(UNIT_SUPPLY, G.players[owner].fleetsSupply + 1);
      if (sea.fleets === 0) {
        if (G.players[pid].fleetsSupply > 0) {
          sea.fleets = 1;
          sea.ownerId = pid;
          G.players[pid].fleetsSupply -= 1;
        } else {
          sea.ownerId = null;
        }
      }
      return null;
    },
  },
  sphinx: {
    id: 'sphinx', name: 'Сфинкс', emblem: '🦁', cost: 2, target: 'none',
    desc: 'Продайте все свои войска/флот/жрецов/философов по 2 золота',
    apply: (G, pid) => {
      const p = G.players[pid];
      let n = 0;
      for (const t of Object.values(G.territories)) {
        if (isSea(t) && t.ownerId === pid && t.fleets > 0) {
          n += t.fleets; p.fleetsSupply = Math.min(UNIT_SUPPLY, p.fleetsSupply + t.fleets);
          t.fleets = 0; t.ownerId = null;
        }
        if (isIsland(t) && t.ownerId === pid && t.troops > 0) {
          n += t.troops; p.troopsSupply = Math.min(UNIT_SUPPLY, p.troopsSupply + t.troops);
          t.troops = 0; // остров остаётся под контролем (жетон)
        }
      }
      n += p.priests + p.philosophers;
      p.priests = 0; p.philosophers = 0;
      p.gold += n * 2;
      return null;
    },
  },
  sylph: {
    id: 'sylph', name: 'Сильфида', emblem: '🌬️', cost: 2, target: 'own-sea',
    desc: 'Поставьте корабль в свою морскую зону',
    apply: (G, pid, tid) => {
      const p = G.players[pid];
      if (p.fleetsSupply <= 0) return 'нет фигурок флота в запасе';
      const sea = G.territories[tid!];
      if (!isSea(sea)) return 'нужна морская зона';
      sea.fleets += 1; sea.ownerId = pid; p.fleetsSupply -= 1;
      return null;
    },
  },
  chiron: {
    id: 'chiron', name: 'Хирон', emblem: '🏹', cost: 2, target: 'own-island',
    desc: 'Поставьте воина-защитника на свой остров',
    apply: (G, pid, tid) => {
      const p = G.players[pid];
      if (p.troopsSupply <= 0) return 'нет фигурок войск в запасе';
      const isl = G.territories[tid!];
      if (!isIsland(isl)) return 'нужен остров';
      isl.troops += 1; p.troopsSupply -= 1;
      return null;
    },
  },
  medusa: {
    id: 'medusa', name: 'Медуза', emblem: '🐍', cost: 2, target: 'enemy-island',
    desc: 'Обратите в камень вражеского воина (−1)',
    apply: (G, _pid, tid) => {
      const isl = G.territories[tid!];
      if (!isIsland(isl) || isl.troops <= 0 || !isl.ownerId) return 'нет вражеского войска';
      isl.troops -= 1;
      G.players[isl.ownerId].troopsSupply = Math.min(UNIT_SUPPLY, G.players[isl.ownerId].troopsSupply + 1);
      return null;
    },
  },
  minotaur: {
    id: 'minotaur', name: 'Минотавр', emblem: '🐂', cost: 3, target: 'own-island',
    desc: 'Призовите 2 воина (защитников) на свой остров',
    apply: (G, pid, tid) => {
      const p = G.players[pid];
      if (p.troopsSupply <= 0) return 'нет фигурок войск в запасе';
      const isl = G.territories[tid!];
      if (!isIsland(isl)) return 'нужен остров';
      const add = Math.min(2, p.troopsSupply);
      isl.troops += add; p.troopsSupply -= add;
      return null;
    },
  },
  polyphemus: {
    id: 'polyphemus', name: 'Полифем', emblem: '👁️', cost: 3, target: 'own-sea',
    desc: 'Поставьте 2 корабля в свою морскую зону',
    apply: (G, pid, tid) => {
      const p = G.players[pid];
      if (p.fleetsSupply <= 0) return 'нет фигурок флота в запасе';
      const sea = G.territories[tid!];
      if (!isSea(sea)) return 'нужна морская зона';
      const add = Math.min(2, p.fleetsSupply);
      sea.fleets += add; sea.ownerId = pid; p.fleetsSupply -= add;
      return null;
    },
  },
  kraken: {
    id: 'kraken', name: 'Кракен', emblem: '🦑', cost: 4, target: 'enemy-sea',
    desc: 'Уничтожьте весь вражеский флот в морской зоне',
    apply: (G, _pid, tid) => {
      const sea = G.territories[tid!];
      if (!isSea(sea) || sea.fleets <= 0 || !sea.ownerId) return 'нет вражеского флота';
      const owner = sea.ownerId;
      G.players[owner].fleetsSupply = Math.min(UNIT_SUPPLY, G.players[owner].fleetsSupply + sea.fleets);
      sea.fleets = 0; sea.ownerId = null;
      return null;
    },
  },
};

/** Колода: каждое существо по одному экземпляру. */
export function makeCreatureDeck(): string[] {
  return Object.keys(CREATURES);
}

/** Создаёт стартовый рынок: колода (опц. перемешана) и 3 открытых существа. */
export function createCreatureMarket(shuffle?: <T>(a: T[]) => T[]): CreatureMarket {
  const full = makeCreatureDeck();
  const deck = shuffle ? shuffle(full) : full;
  const market = deck.splice(0, 3);
  return { deck, market, discard: [] };
}

/** Сколько храмов у игрока (каждый снижает цену существа на 1). */
export function templeCount(G: CycladesState, pid: PlayerID): number {
  let n = 0;
  for (const isl of islandsOf(G, pid)) for (const b of isl.buildings) if (b.type === 'temple') n += 1;
  return n;
}

/** Итоговая цена существа с учётом храмов (минимум 1). */
export function creatureCost(G: CycladesState, pid: PlayerID, def: CreatureDef): number {
  return Math.max(1, def.cost - templeCount(G, pid));
}

/** Добирает рынок до 3 открытых существ (перекидывая сброс в колоду при нужде). */
function refillMarket(c: CreatureMarket): void {
  while (c.market.length < 3) {
    if (c.deck.length === 0) {
      if (c.discard.length === 0) break;
      c.deck = c.discard;
      c.discard = [];
    }
    c.market.push(c.deck.shift()!);
  }
}

/** Проверяет цель существа. Возвращает текст ошибки или null. */
function validateTarget(G: CycladesState, pid: PlayerID, def: CreatureDef, tid?: string): string | null {
  const t = tid ? G.territories[tid] : undefined;
  switch (def.target) {
    case 'none':
      return null;
    case 'own-island':
      return t && isIsland(t) && t.ownerId === pid ? null : 'нужен свой остров';
    case 'own-sea':
      return t && isSea(t) && canPlaceFleet(G, pid, t.id) ? null : 'нужна своя морская зона';
    case 'enemy-island':
      return t && isIsland(t) && t.ownerId && t.ownerId !== pid && t.troops > 0 ? null : 'нужен вражеский остров с войсками';
    case 'enemy-sea':
      return t && isSea(t) && t.ownerId && t.ownerId !== pid && t.fleets > 0 ? null : 'нужна вражеская зона с флотом';
  }
}

/**
 * Покупка существа из рынка (slotIndex 0..2) с немедленным эффектом.
 * Возвращает текст ошибки или null при успехе.
 */
export function applyBuyCreature(
  G: CycladesState, pid: PlayerID, slotIndex: number, targetId?: string,
): string | null {
  const s = G.actions;
  if (!s) return 'нет фазы действий';
  if (s.creatureBought) return 'существо уже куплено в этот ход';
  const id = G.creatures.market[slotIndex];
  if (!id) return 'нет существа в этом слоте';
  const def = CREATURES[id];
  if (!def) return 'неизвестное существо';

  const cost = creatureCost(G, pid, def);
  if (G.players[pid].gold < cost) return 'не хватает золота';
  const targetErr = validateTarget(G, pid, def, targetId);
  if (targetErr) return targetErr;

  const applyErr = def.apply(G, pid, targetId);
  if (applyErr) return applyErr;

  G.players[pid].gold -= cost;
  s.creatureBought = true;
  G.creatures.market.splice(slotIndex, 1);
  G.creatures.discard.push(id);
  refillMarket(G.creatures);
  log(G, `${G.players[pid].name} призывает: ${def.name} (−${cost}🪙). ${def.desc}.`);
  return null;
}

/** Зевс: бесплатно сбросить весь открытый рынок и открыть новый (один раз за ход). */
export function applyCycleCreatures(G: CycladesState, pid: PlayerID): string | null {
  const s = G.actions;
  if (!s) return 'нет фазы действий';
  if (s.creatureCycled) return 'колода уже прокручена в этот ход';

  s.creatureCycled = true;
  while (G.creatures.market.length) G.creatures.discard.push(G.creatures.market.pop()!);
  refillMarket(G.creatures);
  log(G, `${G.players[pid].name} прокручивает колоду существ.`);
  return null;
}
