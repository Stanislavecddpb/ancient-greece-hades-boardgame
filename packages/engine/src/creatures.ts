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
import { checkMetropolis } from './metropolis';

/** Куда нужно нацелить существо при покупке (или none — без цели). */
export type CreatureTarget =
  | 'none' | 'own-island' | 'own-sea' | 'enemy-island' | 'enemy-sea'
  | 'any-island' | 'any-sea';

export interface CreatureDef {
  id: string;
  name: string;
  emblem: string;
  /** Базовая цена; храмы снижают (минимум 1). */
  cost: number;
  target: CreatureTarget;
  /** Короткое описание эффекта для интерфейса. */
  desc: string;
  /** true — существо ставится фигурой на доску (эффект через присутствие), а не мгновенно. */
  placed?: boolean;
  /** Применяет мгновенный эффект (для не-«фигурных»). Возвращает текст ошибки или null. */
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
    desc: 'Разыграйте существо из сброса, затем сброс уходит в колоду',
    apply: (G, pid) => { G.chimeraPick = pid; return null; },
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
    id: 'pegasus', name: 'Пегас', emblem: '🐎', cost: 3, target: 'none',
    desc: 'Перебросьте войска с одного своего острова на другой без моста из флотов',
    apply: (G, pid) => { G.pegasusMove = pid; return null; },
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
    desc: 'Замените вражеский корабль своим (из запаса, иначе — с другой своей зоны)',
    apply: (G, pid, tid) => {
      const sea = G.territories[tid!];
      if (!isSea(sea) || sea.fleets <= 0 || !sea.ownerId) return 'нет вражеского флота';
      const owner = sea.ownerId;
      // Убираем один вражеский корабль (возвращается владельцу в запас).
      sea.fleets -= 1;
      G.players[owner].fleetsSupply = Math.min(UNIT_SUPPLY, G.players[owner].fleetsSupply + 1);
      if (sea.fleets > 0) return null; // в зоне ещё есть чужие корабли — свой не поставить

      // Зона освободилась — ставим свой корабль: из запаса, иначе с другой своей зоны.
      if (G.players[pid].fleetsSupply > 0) {
        G.players[pid].fleetsSupply -= 1;
        sea.fleets = 1;
        sea.ownerId = pid;
      } else {
        const donor = Object.values(G.territories).find(
          (t) => isSea(t) && t.id !== sea.id && t.ownerId === pid && t.fleets > 0,
        );
        if (donor && isSea(donor)) {
          donor.fleets -= 1;
          if (donor.fleets === 0) donor.ownerId = null;
          sea.fleets = 1;
          sea.ownerId = pid;
        } else {
          sea.ownerId = null; // нет кораблей нигде — зона просто пустеет
        }
      }
      return null;
    },
  },
  sphinx: {
    id: 'sphinx', name: 'Сфинкс', emblem: '🦁', cost: 2, target: 'none',
    desc: 'Распродать своих юнитов по 2 золота — выбрать что и сколько',
    apply: (G, pid) => { G.sphinxResell = pid; return null; },
  },
  sylph: {
    id: 'sylph', name: 'Сильфида', emblem: '🌬️', cost: 2, target: 'none',
    desc: 'Двигать свой флот суммарно на 10 клеток (по 1 кораблю за шаг)',
    apply: (G, pid) => { G.sylphMove = { playerId: pid, stepsLeft: 10 }; return null; },
  },
  // === Фигурные существа: ставятся на доску, эффект через присутствие ===
  chiron: {
    id: 'chiron', name: 'Хирон', emblem: '🏹', cost: 2, target: 'any-island', placed: true,
    desc: 'Фигура на остров: защищает от Пегаса, Гиганта и Гарпии (до след. хода)',
    apply: () => null,
  },
  medusa: {
    id: 'medusa', name: 'Медуза', emblem: '🐍', cost: 2, target: 'any-island', placed: true,
    desc: 'Фигура на остров: войска с него нельзя уводить (до след. хода)',
    apply: () => null,
  },
  minotaur: {
    id: 'minotaur', name: 'Минотавр', emblem: '🐂', cost: 3, target: 'any-island', placed: true,
    desc: 'Фигура на остров: +2 к защите, не отступает (до след. хода)',
    apply: () => null,
  },
  polyphemus: {
    id: 'polyphemus', name: 'Полифем', emblem: '👁️', cost: 3, target: 'any-island', placed: true,
    desc: 'Фигура на остров: флот не может встать в соседних зонах (до след. хода)',
    apply: () => null,
  },
  kraken: {
    id: 'kraken', name: 'Кракен', emblem: '🦑', cost: 4, target: 'any-sea', placed: true,
    desc: 'Фигура на море: топит флот в зоне; зона закрыта для флота, пока он там',
    apply: () => null,
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

/** Цена зависит от позиции в рынке: верхнее — 4, среднее — 3, нижнее — 2. */
export const CREATURE_SLOT_PRICES = [4, 3, 2];

/** Сколько храмов у игрока (каждый снижает цену существа на 1). */
export function templeCount(G: CycladesState, pid: PlayerID): number {
  let n = 0;
  for (const isl of islandsOf(G, pid)) for (const b of isl.buildings) if (b.type === 'temple') n += 1;
  return n;
}

/** Цена существа в слоте index (по позиции) с учётом храмов (минимум 1). */
export function creaturePriceAt(G: CycladesState, pid: PlayerID, index: number): number {
  const base = CREATURE_SLOT_PRICES[index] ?? CREATURE_SLOT_PRICES[CREATURE_SLOT_PRICES.length - 1];
  return Math.max(1, base - templeCount(G, pid));
}

/** Берёт верхнюю карту колоды (перекидывая сброс в колоду при пустой). */
function drawCard(c: CreatureMarket): string | undefined {
  if (c.deck.length === 0) {
    if (c.discard.length === 0) return undefined;
    c.deck = c.discard;
    c.discard = [];
  }
  return c.deck.shift();
}

/**
 * Сдвиг рынка на одну позицию: нижнее (за 2) уходит в сброс, остальные
 * «дешевеют» на шаг, сверху (за 4) открывается новое. Конец раунда и Зевс.
 */
export function advanceCreatureMarket(c: CreatureMarket): void {
  if (c.market.length >= 3) {
    const bottom = c.market.pop();
    if (bottom) c.discard.push(bottom); // пустой (null) слот просто исчезает снизу
  }
  // Сверху открывается новое существо (или рубашка, если колода и сброс пусты).
  c.market.unshift(drawCard(c) ?? null);
}

/** Добирает рынок до 3 открытых существ (на старте партии). */
function refillMarket(c: CreatureMarket): void {
  while (c.market.length < 3) {
    const next = drawCard(c);
    if (!next) break;
    c.market.push(next);
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
    case 'own-sea': {
      if (!t || !isSea(t)) return 'нужна своя морская зона';
      if (t.fleets > 0 && t.ownerId !== pid) return 'нужна своя морская зона';
      const own = t.ownerId === pid || t.adjacentIslands.some((iid) => {
        const isl = G.territories[iid];
        return isl && isIsland(isl) && isl.ownerId === pid;
      });
      return own ? null : 'нужна своя морская зона';
    }
    case 'enemy-island':
      return t && isIsland(t) && t.ownerId && t.ownerId !== pid && t.troops > 0 ? null : 'нужен вражеский остров с войсками';
    case 'enemy-sea':
      return t && isSea(t) && t.ownerId && t.ownerId !== pid && t.fleets > 0 ? null : 'нужна вражеская зона с флотом';
    case 'any-island':
      return t && isIsland(t) ? null : 'нужно выбрать остров';
    case 'any-sea':
      return t && isSea(t) ? null : 'нужно выбрать морскую зону';
  }
}

/**
 * Ставит фигуру существа на клетку. Если там уже есть фигура — обе уничтожаются
 * (новая не ставится). Возвращает локацию (или null, если взаимное уничтожение).
 */
export function placeBoardCreature(G: CycladesState, kind: string, ownerId: PlayerID, location: string): void {
  const loc = G.territories[location];
  const existing = G.boardCreatures.findIndex((c) => c.location === location);
  if (existing >= 0) {
    G.boardCreatures.splice(existing, 1);
    log(G, `Фигуры существ на ${loc?.name ?? '?'} уничтожают друг друга.`);
    return;
  }
  G.boardCreatures.push({ kind, ownerId, location, placedCycle: G.cycle });
  log(G, `${G.players[ownerId].name} ставит фигуру (${CREATURES[kind]?.name ?? kind}) на ${loc?.name ?? '?'}.`);
}

/** Снимает фигуры игрока, поставленные в прошлый цикл (в начале его нового хода). */
export function expireBoardCreatures(G: CycladesState, pid: PlayerID): void {
  G.boardCreatures = G.boardCreatures.filter((c) => !(c.ownerId === pid && c.placedCycle < G.cycle));
}

/** Подстраховка на стыке циклов: убрать фигуры старше текущего цикла. */
export function cleanupBoardCreatures(G: CycladesState): void {
  G.boardCreatures = G.boardCreatures.filter((c) => c.placedCycle >= G.cycle);
}

/** Фигура существа данного вида на клетке (или null). */
export function boardCreatureAt(G: CycladesState, location: string): { kind: string; ownerId: PlayerID } | null {
  return G.boardCreatures.find((c) => c.location === location) ?? null;
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

  const cost = creaturePriceAt(G, pid, slotIndex); // цена по позиции слота
  if (G.players[pid].gold < cost) return 'не хватает золота';
  const targetErr = validateTarget(G, pid, def, targetId);
  if (targetErr) return targetErr;

  // Хирон защищает остров от Пегаса, Гиганта и Гарпии.
  if (targetId && (def.id === 'giant' || def.id === 'harpy' || def.id === 'pegasus')) {
    const fig = G.boardCreatures.find((c) => c.location === targetId);
    if (fig && fig.kind === 'chiron') return 'остров под защитой Хирона';
  }

  // «Фигурные» существа ставятся на доску; обычные — мгновенный эффект.
  if (!def.placed) {
    const applyErr = def.apply(G, pid, targetId);
    if (applyErr) return applyErr;
  }

  G.players[pid].gold -= cost;
  s.creatureBought = true;
  if (def.placed) {
    placeBoardCreature(G, def.id, pid, targetId!);
    // Полифем: даём поставившему отодвинуть соседний флот (если он есть).
    if (def.id === 'polyphemus' && boardCreatureAt(G, targetId!)?.kind === 'polyphemus') {
      const isl = G.territories[targetId!];
      const hasAdjFleets = isIsland(isl) && isl.adjacentSeas.some((sid) => {
        const s = G.territories[sid];
        return isSea(s) && s.fleets > 0;
      });
      if (hasAdjFleets) G.polyphemusPush = { playerId: pid, island: targetId! };
    }
    // Кракен при установке топит весь флот в своей зоне (если фигура встала).
    if (def.id === 'kraken' && boardCreatureAt(G, targetId!)?.kind === 'kraken') {
      const sea = G.territories[targetId!];
      if (isSea(sea) && sea.fleets > 0 && sea.ownerId) {
        G.players[sea.ownerId].fleetsSupply = Math.min(UNIT_SUPPLY, G.players[sea.ownerId].fleetsSupply + sea.fleets);
        sea.fleets = 0;
        sea.ownerId = null;
        log(G, `Кракен топит флот в ${sea.name}.`);
      }
    }
  }
  // Купленное уходит в сброс, слот остаётся пустым (рубашкой вверх) и НЕ
  // сдвигается. Существо в этот слот придёт при следующей прокрутке (конец
  // хода или Зевс) — туда сдвинется верхнее существо.
  G.creatures.discard.push(id);
  G.creatures.market[slotIndex] = null;
  log(G, `${G.players[pid].name} призывает: ${def.name} (−${cost}🪙). ${def.desc}.`);
  return null;
}

/** Сфинкс: распродажа выбранного числа юнитов по 2 золота. Закрывает режим. */
export function applySellUnits(
  G: CycladesState, pid: PlayerID, fleets: number, troops: number, priests: number, philosophers: number,
): string | null {
  if (G.sphinxResell !== pid) return 'сейчас не ваша распродажа';
  const p = G.players[pid];
  const clamp = (n: number, max: number) => Math.max(0, Math.min(Math.floor(n || 0), max));

  let availFleets = 0, availTroops = 0;
  for (const t of Object.values(G.territories)) {
    if (isSea(t) && t.ownerId === pid) availFleets += t.fleets;
    if (isIsland(t) && t.ownerId === pid) availTroops += t.troops;
  }
  fleets = clamp(fleets, availFleets);
  troops = clamp(troops, availTroops);
  priests = clamp(priests, p.priests);
  philosophers = clamp(philosophers, p.philosophers);

  let f = fleets;
  for (const t of Object.values(G.territories)) {
    if (f <= 0) break;
    if (isSea(t) && t.ownerId === pid && t.fleets > 0) {
      const take = Math.min(f, t.fleets); t.fleets -= take; f -= take;
      p.fleetsSupply = Math.min(UNIT_SUPPLY, p.fleetsSupply + take);
      if (t.fleets === 0) t.ownerId = null;
    }
  }
  let tr = troops;
  for (const t of Object.values(G.territories)) {
    if (tr <= 0) break;
    if (isIsland(t) && t.ownerId === pid && t.troops > 0) {
      const take = Math.min(tr, t.troops); t.troops -= take; tr -= take;
      p.troopsSupply = Math.min(UNIT_SUPPLY, p.troopsSupply + take);
    }
  }
  p.priests -= priests;
  p.philosophers -= philosophers;
  const total = fleets + troops + priests + philosophers;
  p.gold += total * 2;
  G.sphinxResell = null;
  if (total > 0) log(G, `${p.name} распродаёт юнитов: ${total} (+${total * 2}🪙).`);
  return null;
}

/** Перетасовать сброс существ обратно в колоду (хвост Химеры). */
function reshuffleDiscardIntoDeck(G: CycladesState): void {
  G.creatures.deck.push(...G.creatures.discard);
  G.creatures.discard = [];
}

/** Существа, которые Химера может разыграть из сброса (немгновенные/фигурные — нельзя). */
export function chimeraPlayable(creatureId: string): boolean {
  const def = CREATURES[creatureId];
  return !!def && !def.placed && def.id !== 'chimera';
}

/**
 * Химера: разыграть выбранное существо из сброса, затем перетасовать сброс в колоду.
 * Возвращает текст ошибки или null.
 */
export function applyChimeraReplay(
  G: CycladesState, pid: PlayerID, creatureId: string, targetId?: string,
): string | null {
  if (G.chimeraPick !== pid) return 'сейчас не ваш выбор Химеры';
  if (!G.creatures.discard.includes(creatureId)) return 'этого существа нет в сбросе';
  const def = CREATURES[creatureId];
  if (!def) return 'неизвестное существо';
  if (!chimeraPlayable(creatureId)) return 'Химерой нельзя разыграть это существо';

  const targetErr = validateTarget(G, pid, def, targetId);
  if (targetErr) return targetErr;
  // Хирон защищает остров от Пегаса, Гиганта и Гарпии (как при обычной покупке).
  if (targetId && (def.id === 'giant' || def.id === 'harpy' || def.id === 'pegasus')) {
    const fig = G.boardCreatures.find((c) => c.location === targetId);
    if (fig && fig.kind === 'chiron') return 'остров под защитой Хирона';
  }
  const applyErr = def.apply(G, pid, targetId);
  if (applyErr) return applyErr;

  log(G, `${G.players[pid].name}: Химера разыгрывает ${def.name}. ${def.desc}.`);
  reshuffleDiscardIntoDeck(G);
  G.chimeraPick = null;
  return null;
}

/** Химера: отказаться от разыгрывания — просто перетасовать сброс в колоду. */
export function endChimera(G: CycladesState, pid: PlayerID): string | null {
  if (G.chimeraPick !== pid) return 'сейчас не ваш выбор Химеры';
  reshuffleDiscardIntoDeck(G);
  G.chimeraPick = null;
  return null;
}

/** Зевс: бесплатно сдвинуть рынок на одну позицию (один раз за ход). */
export function applyCycleCreatures(G: CycladesState, pid: PlayerID): string | null {
  const s = G.actions;
  if (!s) return 'нет фазы действий';
  if (s.creatureCycled) return 'колода уже прокручена в этот ход';

  s.creatureCycled = true;
  advanceCreatureMarket(G.creatures);
  log(G, `${G.players[pid].name} прокручивает колоду существ.`);
  return null;
}
