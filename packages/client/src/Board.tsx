import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import type { BoardProps } from 'boardgame.io/react';
import {
  type CycladesState,
  type GodName,
  type TerritoryId,
  GOD_BUILDING,
  ALL_BUILDINGS,
  CREATURES,
  chimeraPlayable,
  creaturePriceAt,
  CREATURE_SLOT_PRICES,
  metropolisCount,
  currentTurn,
  activePlayerId,
  godLabel,
  recruitCost,
  freeSlots,
  metropolisSlotCost,
  canPlaceFleet,
  troopReachable,
  isIsland,
  isSea,
  undeadCost,
  MAX_UNDEAD_PER_TURN,
  hadesTroopReachable,
  hadesFleetReachable,
  HEROES,
  isHero,
} from '@cyclades/engine';
import type { CreatureDef, Territory } from '@cyclades/engine';
import { BoardMap } from './BoardMap';
import type { MovementCtx } from './BoardMap';
import { GodBoard } from './GodBoard';

const GOD_EMOJI: Record<GodName, string> = {
  ares: '🗡️', poseidon: '🌊', zeus: '⚡', athena: '🦉', apollo: '☀️',
};

/** Подходит ли выбранная клетка как цель существа (зеркалит проверку движка). */
function creatureTargetOk(def: CreatureDef, sel: Territory | null, pid: string): boolean {
  switch (def.target) {
    case 'none': return true;
    case 'own-island': return !!sel && isIsland(sel) && sel.ownerId === pid;
    case 'own-sea': return !!sel && isSea(sel);
    case 'enemy-island': return !!sel && isIsland(sel) && !!sel.ownerId && sel.ownerId !== pid && sel.troops > 0;
    case 'enemy-sea': return !!sel && isSea(sel) && !!sel.ownerId && sel.ownerId !== pid && sel.fleets > 0;
    case 'any-island': return !!sel && isIsland(sel);
    case 'any-sea': return !!sel && isSea(sel);
  }
}

/** Сетевой режим: «я» — закреплённый за клиентом игрок. */
export function NetBoard(p: BoardProps<CycladesState>) {
  return <GameView G={p.G} ctx={p.ctx} moves={p.moves} me={p.playerID}
    matchData={p.matchData} matchID={p.matchID} />;
}

/** Хотсит: «я» — текущий активный игрок (ходим за всех по очереди). */
export function HotseatBoard(p: BoardProps<CycladesState>) {
  return <GameView G={p.G} ctx={p.ctx} moves={p.moves} me={p.ctx.currentPlayer} matchID={p.matchID} />;
}

interface MatchPlayer { id: number; name?: string; isConnected?: boolean }

function GameView({ G, ctx, moves, me, matchData, matchID }: {
  G: CycladesState; ctx: any; moves: any; me: string | null;
  matchData?: MatchPlayer[]; matchID?: string;
}) {
  const [selected, setSelected] = useState<TerritoryId | null>(null);
  const [troopCount, setTroopCount] = useState(1);
  const [fleetTake, setFleetTake] = useState(99);
  const [hadesUndead, setHadesUndead] = useState(1);
  const [hadesLiving, setHadesLiving] = useState(0);
  const [intro, setIntro] = useState(false);

  // Имя игрока: введённое при входе (matchData) → иначе из состояния.
  const nameOf = (pid: string | null): string => {
    if (pid == null) return '';
    const m = matchData?.find((x) => String(x.id) === pid);
    return m?.name || G.players[pid]?.name || `Игрок ${Number(pid) + 1}`;
  };

  // Заставка (занавес + очерёдность) — один раз на старте партии.
  useEffect(() => {
    if (!G.started || ctx.phase !== 'auction' || G.cycle !== 1) return;
    const key = `cyclades:intro:${matchID ?? 'local'}`;
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, '1');
    setIntro(true);
  }, [G.started, ctx.phase, G.cycle, matchID]);

  if (ctx.gameover) {
    const w = G.players[ctx.gameover.winner];
    return <div className="gameover"><h1>🏆 Победа: {nameOf(ctx.gameover.winner) || w?.name}!</h1></div>;
  }

  // Лобби: ждём игроков и старт хоста.
  if (ctx.phase === 'lobby') {
    return <Lobby G={G} ctx={ctx} me={me} moves={moves} matchData={matchData} nameOf={nameOf} />;
  }

  const order: string[] = Array.from({ length: ctx.numPlayers }, (_, i) =>
    ctx.playOrder[(G.startIndex + i) % ctx.playOrder.length]);

  const activeId = G.pendingCornucopia ?? (G.auction ? G.auction.toAct : activePlayerId(G));

  // Контекст перемещения для стрелок на карте.
  const turn = currentTurn(G);
  const sel = selected ? G.territories[selected] : null;
  const canAct = ctx.phase === 'actions' && !G.pendingCornucopia && !!turn && activePlayerId(G) === me;
  let movement: MovementCtx | null = null;
  if (canAct && me && G.polyphemusPush && G.polyphemusPush.playerId === me && sel && isSea(sel) && sel.fleets > 0) {
    // Полифем: выбран соседний с островом флот — стрелки «от острова».
    const island = G.territories[G.polyphemusPush.island];
    const adj = isIsland(island) ? island.adjacentSeas : [];
    if (adj.includes(sel.id)) {
      const targets = sel.adjacentSeas.filter((id) => {
        const t = G.territories[id];
        return isSea(t) && !adj.includes(id) && !(t.fleets > 0 && t.ownerId !== (sel as any).ownerId);
      });
      if (targets.length) movement = { from: sel.id, targets, onMove: (to) => { moves.pushFleet(sel.id, to); setSelected(null); } };
    }
  } else if (canAct && me && G.sylphMove && G.sylphMove.playerId === me && sel && isSea(sel) && sel.ownerId === me && sel.fleets > 0) {
    // Сильфида: выбран свой флот — стрелки в соседние свои/пустые клетки, по 1 кораблю.
    const targets = sel.adjacentSeas.filter((id) => {
      const t = G.territories[id];
      return isSea(t) && !(t.fleets > 0 && t.ownerId !== me);
    });
    if (targets.length) movement = { from: sel.id, targets, onMove: (to) => { moves.sylphStep(sel.id, to); setSelected(to); } };
  } else if (canAct && me && G.pegasusMove === me && sel && isIsland(sel) && sel.ownerId === me && sel.troops > 0
    && !G.boardCreatures.some((c) => c.kind === 'medusa' && c.location === sel.id)) {
    // Пегас: выбран свой остров-источник (не под Медузой) — стрелки на ЛЮБОЙ другой
    // остров (без моста); если на цели войска врага — начнётся бой.
    const n = Math.min(Math.max(1, troopCount), sel.troops);
    const targets = Object.values(G.territories)
      .filter((t): t is Territory => isIsland(t) && t.id !== sel.id)
      .map((t) => t.id);
    if (targets.length) movement = { from: sel.id, targets, onMove: (to) => { moves.pegasusMove(sel.id, to, n); setSelected(null); } };
  } else if (canAct && me && G.perseusMove && G.perseusMove.playerId === me) {
    // Персей (самопожертвование): увод войск с его острова на остров без Героя.
    const fromId = G.perseusMove.fromIsland;
    const fromIsl = G.territories[fromId];
    const n = isIsland(fromIsl) ? Math.min(Math.max(1, troopCount), fromIsl.troops) : 1;
    const heroIslands = new Set(Object.values(G.players).flatMap((p) => p.heroes.map((h) => h.islandId)));
    const targets = Object.values(G.territories)
      .filter((t): t is Territory => isIsland(t) && t.id !== fromId && !heroIslands.has(t.id)
        && !(t.ownerId != null && t.ownerId !== me && t.troops > 0))
      .map((t) => t.id);
    if (targets.length) movement = { from: fromId, targets, onMove: (to) => { moves.perseusMove(to, n); setSelected(null); } };
  } else if (canAct && me && G.fleetMove && G.fleetMove.playerId === me) {
    // Идёт приказ флоту: стрелки в соседние клетки от текущей позиции группы.
    const at = G.territories[G.fleetMove.at];
    const carrying = G.fleetMove.carrying;
    const take = Math.min(Math.max(1, fleetTake), carrying);
    const targets = isSea(at) ? at.adjacentSeas.filter((id) => isSea(G.territories[id])) : [];
    movement = { from: G.fleetMove.at, targets, onMove: (to) => moves.hopFleet(to, take) };
  } else if (canAct && me && turn!.isHades && sel && isIsland(sel) && sel.ownerId === me && sel.undeadTroops > 0) {
    // Аид: перемещение отряда (Нежить + опц. живые) остров→остров по мосту флотов.
    const undead = Math.min(Math.max(1, hadesUndead), sel.undeadTroops);
    const living = Math.min(Math.max(0, hadesLiving), sel.troops, Math.max(0, 3 - undead));
    const targets = [...hadesTroopReachable(G, sel.id, me)];
    if (targets.length) movement = { from: sel.id, targets, onMove: (to) => { moves.moveHadesTroops(sel.id, to, living, undead); setSelected(null); } };
  } else if (canAct && me && turn!.isHades && sel && isSea(sel) && sel.ownerId === me && sel.undeadFleets > 0) {
    // Аид: перемещение флота (Нежить + опц. живые) до 3 клеток.
    const undead = Math.min(Math.max(1, hadesUndead), sel.undeadFleets);
    const living = Math.min(Math.max(0, hadesLiving), sel.fleets);
    const targets = [...hadesFleetReachable(G, sel.id, me)];
    if (targets.length) movement = { from: sel.id, targets, onMove: (to) => { moves.moveHadesFleets(sel.id, to, living, undead); setSelected(null); } };
  } else if (canAct && me && !turn!.isHades && !G.combat && sel && turn!.god === 'ares' && isIsland(sel) && sel.ownerId === me && sel.troops > 0) {
    const n = Math.min(troopCount, sel.troops, 3); // не больше 3 войск за перемещение
    const targets = [...troopReachable(G, sel.id, me)];
    if (targets.length) movement = { from: sel.id, targets, onMove: (to) => { moves.moveTroops(sel.id, to, n); setSelected(null); } };
  }

  return (
    <div className="game">
      <div className="map-area">
        <div className="board-stage">
          <BoardMap G={G} me={me} selected={selected} onSelect={setSelected} movement={movement} />
          <PlayersCorners G={G} ctx={ctx} activeId={activeId} me={me} nameOf={nameOf} />
        </div>
        <MarketColumn G={G} me={me} />
        <div className="phase-tag">Цикл {G.cycle} · {phaseLabel(ctx.phase)}</div>
        {intro && <GameIntro G={G} order={order} nameOf={nameOf} onDone={() => setIntro(false)} />}
        {G.combat ? (
          <CombatPanel G={G} me={me} moves={moves} />
        ) : G.metropolisPlace && G.metropolisPlace.playerId === me ? (
          <MetropolisPanel G={G} me={me} moves={moves} selected={selected} />
        ) : G.fleetMove && G.fleetMove.playerId === me ? (
          <FleetMovePanel G={G} moves={moves} take={fleetTake} setTake={setFleetTake} />
        ) : G.polyphemusPush && G.polyphemusPush.playerId === me ? (
          <PolyphemusPanel moves={moves} />
        ) : G.sylphMove && G.sylphMove.playerId === me ? (
          <SylphPanel G={G} moves={moves} />
        ) : G.sphinxResell === me ? (
          <SphinxPanel G={G} me={me} moves={moves} />
        ) : G.pegasusMove === me ? (
          <PegasusPanel G={G} me={me} moves={moves} selected={selected}
            troopCount={troopCount} setTroopCount={setTroopCount} />
        ) : G.chimeraPick === me ? (
          <ChimeraPanel G={G} me={me} moves={moves} selected={selected} />
        ) : G.satyrSteal === me ? (
          <SatyrPanel G={G} ctx={ctx} me={me} moves={moves} nameOf={nameOf} />
        ) : G.furiesMove === me ? (
          <FuriesPanel G={G} me={me} moves={moves} selected={selected} />
        ) : G.perseusMove && G.perseusMove.playerId === me ? (
          <PerseusPanel G={G} moves={moves} troopCount={troopCount} setTroopCount={setTroopCount} />
        ) : G.cyclopsSwap && G.cyclopsSwap.playerId === me ? (
          <CyclopsPanel G={G} moves={moves} />
        ) : ctx.phase === 'actions' && G.pendingCornucopia ? (
          G.pendingCornucopia === me ? (
            <ProsperityPrompt G={G} me={me} moves={moves} selected={selected} />
          ) : (
            <div className="action-bar"><div className="ab-title">☀️ {nameOf(G.pendingCornucopia)} кладёт рог изобилия…</div></div>
          )
        ) : ctx.phase === 'actions' ? (
          <ActionBar G={G} me={me} moves={moves} selected={selected}
            troopCount={troopCount} setTroopCount={setTroopCount} hasMove={!!movement}
            hadesLiving={hadesLiving} setHadesLiving={setHadesLiving}
            hadesUndead={hadesUndead} setHadesUndead={setHadesUndead} />
        ) : null}
        <EventLog G={G} />
      </div>
      <GodBoard G={G} ctx={ctx} me={me} moves={moves} nameOf={nameOf} />
    </div>
  );
}

function phaseLabel(phase: string | null): string {
  if (phase === 'auction') return 'аукцион богов';
  if (phase === 'actions') return 'фаза действий';
  return phase ?? '—';
}

const CORNERS = ['tl', 'tr', 'bl', 'br'];

function PlayersCorners({ G, ctx, activeId, me, nameOf }: {
  G: CycladesState; ctx: any; activeId: string | null; me: string | null; nameOf: (pid: string) => string;
}) {
  return (
    <>
      {ctx.playOrder.map((pid: string, i: number) => {
        const p = G.players[pid];
        return (
          <div key={pid} className={`player-corner ${CORNERS[i] ?? 'tl'} ${pid === activeId ? 'active' : ''}`}
            style={{ ['--pc' as any]: p.color }}>
            <div className="pc-name"><span className="pc-dot" style={{ background: p.color }} />{nameOf(pid)}{pid === me ? ' (вы)' : ''}</div>
            <div className="pc-stats">
              {/* Чужие золото/жрецы/философы скрыты. */}
              <span title="золото">🪙{pid === me ? p.gold : '?'}</span>
              <span title="жрецы">⚜️{pid === me ? p.priests : '?'}</span>
              <span title="философы">📜{pid === me ? p.philosophers : '?'}</span>
              {p.heroes.length > 0 && <span title="герои">🦸{p.heroes.length}</span>}
              <span title="метрополии">🏛️{metropolisCount(G, pid)}</span>
            </div>
          </div>
        );
      })}
    </>
  );
}

function ActionBar({ G, me, moves, selected, troopCount, setTroopCount, hasMove,
  hadesLiving, setHadesLiving, hadesUndead, setHadesUndead }: {
  G: CycladesState; me: string | null; moves: any; selected: TerritoryId | null;
  troopCount: number; setTroopCount: (n: number) => void; hasMove: boolean;
  hadesLiving: number; setHadesLiving: (n: number) => void;
  hadesUndead: number; setHadesUndead: (n: number) => void;
}) {
  const turn = currentTurn(G);
  if (!turn) return null;
  const myTurn = activePlayerId(G) === me;
  // Активация Аида: свой набор действий вместо обычного бога (Модуль 2).
  if (turn.isHades) {
    return <HadesActionBar G={G} me={me} moves={moves} selected={selected} myTurn={myTurn}
      hasMove={hasMove} hadesLiving={hadesLiving} setHadesLiving={setHadesLiving}
      hadesUndead={hadesUndead} setHadesUndead={setHadesUndead} />;
  }
  const god = turn.god;
  const pid = turn.playerId;
  const s = G.actions!;
  const sel = selected ? G.territories[selected] : null;
  const buildType = GOD_BUILDING[god];

  const canRecruitTroop = !!sel && isIsland(sel) && sel.ownerId === pid;
  const canRecruitFleet = !!sel && isSea(sel) && canPlaceFleet(G, pid, sel.id);
  const canBuildHere =
    !!sel && isIsland(sel) && sel.ownerId === pid && freeSlots(sel) > 0 && !!buildType;
  // Источник перемещения войск выбран — показываем выбор количества; стрелки рисует карта.
  const troopSource = !!sel && isIsland(sel) && sel.ownerId === pid && sel.troops > 0 && god === 'ares';
  const fleetSource = !!sel && isSea(sel) && sel.ownerId === pid && sel.fleets > 0 && god === 'poseidon';
  const canStartFleet = fleetSource && G.players[pid].gold >= 1;
  const troopMax = troopSource ? Math.min(3, (sel as any).troops) : 3;

  return (
    <div className="action-bar">
      <div className="ab-title">{GOD_EMOJI[god]} {godLabel(god)} — {myTurn ? 'ваш ход' : G.players[pid].name}</div>
      {myTurn && (
        <div className="ab-controls">
          <span className="sel-hint">{sel ? sel.name : 'кликните по карте'}</span>
          {god === 'ares' && (
            <button disabled={!canRecruitTroop} onClick={() => moves.recruit(selected)}>⚔️ войско ({recruitCost(god, s.recruited)}🪙)</button>
          )}
          {god === 'poseidon' && (
            <button disabled={!canRecruitFleet} onClick={() => moves.recruit(selected)}>⛵ флот ({recruitCost(god, s.recruited)}🪙)</button>
          )}
          {god === 'zeus' && <button onClick={() => moves.recruit()}>⚜️ жрец ({recruitCost(god, s.recruited)}🪙)</button>}
          {god === 'athena' && <button onClick={() => moves.recruit()}>📜 философ ({recruitCost(god, s.recruited)}🪙)</button>}
          {buildType && (
            <button disabled={!canBuildHere || s.built} onClick={() => moves.build(selected)}>🏗️ {buildType} (2🪙)</button>
          )}
          {troopSource && (
            <span className="move-box">
              <span>войск (до 3):</span>
              <input type="number" min={1} max={troopMax} value={Math.min(troopCount, troopMax)}
                onChange={(e) => setTroopCount(Math.max(1, Math.min(3, Number(e.target.value))))} style={{ width: 40 }} />
              <span className="sel-hint">{hasMove ? '→ стрелка на карте (1🪙)' : 'нет ходов'}</span>
            </span>
          )}
          {fleetSource && (
            <button disabled={!canStartFleet} onClick={() => moves.startFleetMove(selected)}
              title="за 1 монету двигать корабли до 3 клеток, можно высаживать по пути">
              ⛵ двинуть флот (1🪙)
            </button>
          )}
          <CreatureButtons G={G} pid={pid} moves={moves} sel={sel} selected={selected} god={god} s={s} />
          <HeroControls G={G} pid={pid} moves={moves} />
          <button className="end-turn" onClick={() => moves.endGod()}>Завершить →</button>
        </div>
      )}
    </div>
  );
}

/** Панель действий Аида (Модуль 2): наём Нежити, Некрополь, перемещение, существа. */
function HadesActionBar({ G, me, moves, selected, myTurn, hasMove,
  hadesLiving, setHadesLiving, hadesUndead, setHadesUndead }: {
  G: CycladesState; me: string | null; moves: any; selected: TerritoryId | null; myTurn: boolean;
  hasMove: boolean; hadesLiving: number; setHadesLiving: (n: number) => void;
  hadesUndead: number; setHadesUndead: (n: number) => void;
}) {
  const turn = currentTurn(G)!;
  const pid = turn.playerId;
  const s = G.actions!;
  const sel = selected ? G.territories[selected] : null;
  const cost = undeadCost(s.recruited);
  const limitReached = s.recruited >= MAX_UNDEAD_PER_TURN;
  const canTroop = !!sel && isIsland(sel) && sel.ownerId === pid;
  const canFleet = !!sel && isSea(sel) && canPlaceFleet(G, pid, sel.id);
  const canNecropolis = !!sel && isIsland(sel) && sel.ownerId === pid && !sel.necropolis;
  // Источник перемещения Нежити выбран — показываем выбор состава (стрелки рисует карта).
  const troopSource = !!sel && isIsland(sel) && sel.ownerId === pid && sel.undeadTroops > 0;
  const fleetSource = !!sel && isSea(sel) && sel.ownerId === pid && sel.undeadFleets > 0;
  const moveSource = troopSource || fleetSource;
  const maxUndead = troopSource ? (sel as any).undeadTroops : fleetSource ? (sel as any).undeadFleets : 1;
  const maxLiving = troopSource ? Math.min((sel as any).troops, 2) : fleetSource ? (sel as any).fleets : 0;

  return (
    <div className="action-bar hades">
      <div className="ab-title">💀 Аид — {myTurn ? 'ваш ход' : G.players[pid].name}</div>
      {myTurn && (
        <div className="ab-controls">
          <span className="sel-hint">{sel ? sel.name : 'кликните по карте'}</span>
          <span className="hades-cost">
            Нежить {s.recruited}/{MAX_UNDEAD_PER_TURN} · следующая {cost === 0 ? 'бесплатно' : `${cost}🪙`}
          </span>
          <button disabled={limitReached || !canTroop} onClick={() => moves.recruitUndead('troop', selected)}>
            💀⚔️ Войско Нежити
          </button>
          <button disabled={limitReached || !canFleet} onClick={() => moves.recruitUndead('fleet', selected)}>
            💀⛵ Флотилия Нежити
          </button>
          <button disabled={s.built || !canNecropolis} onClick={() => moves.buildNecropolis(selected)}
            title="на месте Метрополии своего острова (постройки снесутся)">
            ⚰️ Некрополь
          </button>
          {moveSource && (
            <span className="move-box">
              <span>двинуть 💀:</span>
              <input type="number" min={1} max={maxUndead} value={Math.min(hadesUndead, maxUndead)} style={{ width: 38 }}
                onChange={(e) => setHadesUndead(Math.max(1, Math.min(maxUndead, Number(e.target.value))))} />
              <span>+ живых:</span>
              <input type="number" min={0} max={maxLiving} value={Math.min(hadesLiving, maxLiving)} style={{ width: 38 }}
                onChange={(e) => setHadesLiving(Math.max(0, Math.min(maxLiving, Number(e.target.value))))} />
              <span className="sel-hint">{hasMove ? '→ стрелка на карте (1🪙)' : 'нет ходов'}</span>
            </span>
          )}
          <CreatureButtons G={G} pid={pid} moves={moves} sel={sel} selected={selected} god={turn.god} s={s} />
          <HeroControls G={G} pid={pid} moves={moves} />
          <button className="end-turn" onClick={() => moves.endGod()}>Завершить →</button>
        </div>
      )}
    </div>
  );
}

/** Колонка рынка существ справа от поля: открытые карты (портрет) с ценой-монетами. */
function MarketColumn({ G }: { G: CycladesState; me: string | null }) {
  const market = G.creatures.market;
  return (
    <div className="market-column">
      <div className="market-title">Существа</div>
      {market.map((id, i) => (
        <div className="mk-row" key={i}>
          {id ? (isHero(id) ? <HeroCard id={id} /> : <CreatureCard def={CREATURES[id]} />) : <CardbackCard />}
          <div className="mk-coins" title={`${CREATURE_SLOT_PRICES[i]} золота`}>
            {Array.from({ length: CREATURE_SLOT_PRICES[i] ?? 2 }, (_, k) => (
              <span key={k} className="mk-coin" />
            ))}
          </div>
        </div>
      ))}
      {market.length === 0 && <div className="mk-empty">колода пуста</div>}
    </div>
  );
}

function CreatureCard({ def }: { def: CreatureDef }) {
  const [imgOk, setImgOk] = useState(true);
  return (
    <div className="mk-card" title={def.desc}>
      {imgOk ? (
        <img className="mk-img" src={`/creatures/${def.id}.jpg`} alt={def.name} onError={() => setImgOk(false)} />
      ) : (
        <div className="mk-art"><span className="mk-emblem">{def.emblem}</span></div>
      )}
      <div className="mk-name">{def.name}</div>
    </div>
  );
}

/** Карта Героя на рынке (Модуль 3): отдельный арт-путь /heroes/<id>.jpg. */
function HeroCard({ id }: { id: string }) {
  const h = HEROES[id];
  const [imgOk, setImgOk] = useState(true);
  return (
    <div className="mk-card hero" title={`Герой. Бой: ${h.warPower}. Жертва: ${h.sacrifice}`}>
      {imgOk ? (
        <img className="mk-img" src={`/heroes/${id}.jpg`} alt={h.name} onError={() => setImgOk(false)} />
      ) : (
        <div className="mk-art hero"><span className="mk-emblem">{h.emblem}</span></div>
      )}
      <div className="mk-name">{h.name} ⚔</div>
    </div>
  );
}

/** Пустой (купленный) слот — рубашка картой вверх. */
function CardbackCard() {
  const [imgOk, setImgOk] = useState(true);
  return (
    <div className="mk-card mk-back" title="слот пуст — существо придёт при прокрутке">
      {imgOk ? (
        <img className="mk-img" src="/creatures/cardback_vertical.jpg" alt="рубашка" onError={() => setImgOk(false)} />
      ) : (
        <div className="mk-art"><span className="mk-emblem">🂠</span></div>
      )}
    </div>
  );
}

function Lobby({ G, ctx, me, moves, matchData, nameOf }: {
  G: CycladesState; ctx: any; me: string | null; moves: any;
  matchData?: MatchPlayer[]; nameOf: (pid: string) => string;
}) {
  const total = ctx.numPlayers;
  const filled = matchData ? matchData.filter((m) => m.name).length : total;
  const full = filled >= total;
  const isHost = me === '0';
  void nameOf;
  return (
    <div className="lobby">
      <div className="lobby-card">
        <h1>Cyclades</h1>
        <p className="hint">Когда все сядут за стол, хост начинает игру.</p>
        <div className="lobby-seats">
          {Array.from({ length: total }, (_, i) => {
            const pid = String(i);
            // В сети — имя из matchData (или «ожидание»); в хотсите — имя из состояния.
            const nm = matchData ? matchData.find((m) => m.id === i)?.name : G.players[pid].name;
            return (
              <div key={i} className={`lobby-seat ${nm ? 'taken' : ''}`} style={{ ['--pc' as any]: G.players[pid].color }}>
                <span className="ls-num">{i + 1}</span>
                <span className="ls-dot" style={{ background: G.players[pid].color }} />
                {nm ? <b>{nm}</b> : <i>ожидание…</i>}
              </div>
            );
          })}
        </div>
        <div className="lobby-status">{filled}/{total} игроков за столом</div>
        {isHost ? (
          <button className="lobby-start" disabled={!full} onClick={() => moves.startGame()}>
            {full ? '▶ Начать игру' : 'Ждём игроков…'}
          </button>
        ) : (
          <div className="hint">Ждём, пока хост начнёт игру…</div>
        )}
      </div>
    </div>
  );
}

/** Заставка старта: занавес открывается, затем проявляется очерёдность хода. */
function GameIntro({ G, order, nameOf, onDone }: {
  G: CycladesState; order: string[]; nameOf: (pid: string) => string; onDone: () => void;
}) {
  useEffect(() => {
    const t = setTimeout(onDone, (3 + order.length * 0.5 + 7) * 1000);
    return () => clearTimeout(t);
  }, [onDone, order.length]);

  return (
    <div className="intro">
      <motion.div className="curtain left" initial={{ x: 0 }} animate={{ x: '-105%' }}
        transition={{ duration: 1.1, delay: 0.4, ease: 'easeInOut' }} />
      <motion.div className="curtain right" initial={{ x: 0 }} animate={{ x: '105%' }}
        transition={{ duration: 1.1, delay: 0.4, ease: 'easeInOut' }} />
      <motion.div className="intro-content" initial={{ opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 1.3, duration: 0.5 }}>
        <h2>Очерёдность хода</h2>
        <ol className="intro-order">
          {order.map((pid, i) => (
            <motion.li key={pid} initial={{ opacity: 0, x: -30 }} animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 1.6 + i * 0.5, type: 'spring', stiffness: 200, damping: 18 }}
              style={{ ['--pc' as any]: G.players[pid].color }}>
              <span className="io-num">{i + 1}</span>
              <span className="io-dot" style={{ background: G.players[pid].color }} />
              <span className="io-name">{nameOf(pid)}</span>
              {i === 0 && <span className="io-first">ходит первым</span>}
            </motion.li>
          ))}
        </ol>
        <motion.button className="intro-go" initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          transition={{ delay: 1.9 + order.length * 0.5 }} onClick={onDone}>
          В бой! ⚔️
        </motion.button>
      </motion.div>
    </div>
  );
}

function CombatPanel({ G, me, moves }: { G: CycladesState; me: string | null; moves: any }) {
  const c = G.combat!;
  const loc = G.territories[c.location];
  const attacker = G.players[c.attackerId];
  const defender = G.players[c.defenderId];
  const unit = c.kind === 'naval' ? '⛵' : '⚔️';
  const myFight = c.attackerId === me;
  const last = c.lastRoll;
  const aUndead = c.attackerUndead ?? 0;
  const dUndead = c.defenderUndead ?? 0;
  const undeadNote = (n: number) => (n > 0 ? ` (💀${n})` : '');
  return (
    <div className="action-bar combat">
      <div className="ab-title">⚔️ Бой за {loc?.name} · раунд {c.round}</div>
      <div className="ab-controls">
        <span className="combat-side" style={{ color: attacker.color }}>
          {attacker.name}: {unit}×{c.attackerUnits}{undeadNote(aUndead)}
        </span>
        <span className="combat-vs">против</span>
        <span className="combat-side" style={{ color: defender.color }}>
          {defender.name}: {unit}×{c.defenderUnits}{undeadNote(dUndead)}{c.defenderBonus > 0 ? ` (+${c.defenderBonus}🛡)` : ''}
        </span>
        {last && (
          <span className="combat-roll">
            <CombatDie key={`a${c.round}`} value={last.aDie} color={attacker.color} lost={last.aLost} />
            <CombatDie key={`d${c.round}`} value={last.dDie} color={defender.color} lost={last.dLost} bonus={c.defenderBonus} />
            <span className="combat-outcome">
              {last.aLost && last.dLost ? 'обоюдные потери' : last.dLost ? 'защитник теряет юнита' : last.aLost ? 'атакующий теряет юнита' : 'без потерь'}
            </span>
          </span>
        )}
        {myFight && aUndead > 0 && c.attackerUnits > aUndead && (
          <button className="loss-order" title="кого терять первым при поражении в раунде"
            onClick={() => moves.setLossOrder(!(c.loseUndeadFirst ?? true))}>
            теряю первыми: {(c.loseUndeadFirst ?? true) ? '💀 Нежить' : '⚔️ обычных'}
          </button>
        )}
        {myFight ? (
          <>
            <button onClick={() => moves.combatRound()}>🎲 Раунд</button>
            <button className="end-turn" onClick={() => moves.combatRetreat()}>🏳️ Отступить</button>
          </>
        ) : (
          <span className="sel-hint">ход атакующего…</span>
        )}
      </div>
    </div>
  );
}

/** Анимированный кубик боя: «крутится» при появлении и замирает на выпавшей грани. */
function CombatDie({ value, color, lost, bonus }: {
  value: number; color: string; lost: boolean; bonus?: number;
}) {
  return (
    <motion.span
      className={`combat-die ${lost ? 'die-lost' : ''}`}
      style={{ ['--die' as any]: color }}
      initial={{ rotate: -240, scale: 0.3, opacity: 0 }}
      animate={{ rotate: [-240, 30, 0], scale: [0.3, 1.15, 1], opacity: 1 }}
      transition={{ duration: 0.55, ease: 'easeOut', times: [0, 0.7, 1] }}
    >
      <span className="die-face">{value}</span>
      {bonus ? <span className="die-bonus">+{bonus}🛡</span> : null}
    </motion.span>
  );
}

function FleetMovePanel({ G, moves, take, setTake }: {
  G: CycladesState; moves: any; take: number; setTake: (n: number) => void;
}) {
  const m = G.fleetMove!;
  const carrying = m.carrying;
  const eff = Math.min(Math.max(1, take), carrying);
  return (
    <div className="action-bar fleetmove">
      <div className="ab-title">⛵ Приказ флоту · осталось переходов: {m.stepsLeft}</div>
      <div className="ab-controls">
        <span>в группе: <b>{carrying}</b></span>
        <span>вести:</span>
        <input type="number" min={1} max={carrying} value={eff}
          onChange={(e) => setTake(Math.max(1, Math.min(carrying, Number(e.target.value))))} style={{ width: 44 }} />
        <span className="sel-hint">→ кликните стрелку (оставшиеся {carrying - eff} высадятся здесь)</span>
        <button className="end-turn" onClick={() => moves.endFleetMove()}>Завершить движение</button>
      </div>
    </div>
  );
}

/** Сильфида: движение флота на N клеток (по 1 кораблю за шаг). */
function SylphPanel({ G, moves }: { G: CycladesState; moves: any }) {
  return (
    <div className="action-bar fleetmove">
      <div className="ab-title">🌬️ Сильфида: движение флота · осталось клеток: {G.sylphMove!.stepsLeft}</div>
      <div className="ab-controls">
        <span className="sel-hint">выберите свой флот, кликайте стрелку (1 корабль = 1 клетка)</span>
        <button className="end-turn" onClick={() => moves.endSylph()}>Готово</button>
      </div>
    </div>
  );
}

/** Полифем: отталкивание соседнего флота от острова. */
function PolyphemusPanel({ moves }: { moves: any }) {
  return (
    <div className="action-bar fleetmove">
      <div className="ab-title">👁️ Полифем: отодвиньте соседний флот от острова</div>
      <div className="ab-controls">
        <span className="sel-hint">выберите флот у острова и кликните стрелку (от острова)</span>
        <button className="end-turn" onClick={() => moves.endPolyphemus()}>Готово</button>
      </div>
    </div>
  );
}

/** Сфинкс: выбор, сколько каких юнитов продать (по 2🪙). */
function SphinxPanel({ G, me, moves }: { G: CycladesState; me: string | null; moves: any }) {
  const [f, setF] = useState(0);
  const [t, setT] = useState(0);
  const [pr, setPr] = useState(0);
  const [ph, setPh] = useState(0);
  let fleets = 0, troops = 0;
  for (const terr of Object.values(G.territories)) {
    if (isSea(terr) && terr.ownerId === me) fleets += terr.fleets;
    if (isIsland(terr) && terr.ownerId === me) troops += terr.troops;
  }
  const pl = G.players[me!];
  const clamp = (v: number, max: number) => Math.max(0, Math.min(v, max));
  const ef = clamp(f, fleets), et = clamp(t, troops), epr = clamp(pr, pl.priests), eph = clamp(ph, pl.philosophers);
  const total = ef + et + epr + eph;
  const num = (val: number, set: (n: number) => void, max: number, label: string) => (
    <span className="move-box">
      <span>{label} (есть {max}):</span>
      <input type="number" min={0} max={max} value={Math.min(val, max)} style={{ width: 40 }}
        onChange={(e) => set(clamp(Number(e.target.value), max))} />
    </span>
  );
  return (
    <div className="action-bar sphinx">
      <div className="ab-title">🦁 Сфинкс: распродать своих юнитов (по 2🪙)</div>
      <div className="ab-controls">
        {num(f, setF, fleets, '⛵ флот')}
        {num(t, setT, troops, '⚔️ войска')}
        {num(pr, setPr, pl.priests, '⚜️ жрецы')}
        {num(ph, setPh, pl.philosophers, '📜 философы')}
        <span className="sel-hint">итого +{total * 2}🪙</span>
        <button className="end-turn" onClick={() => moves.sellUnits(ef, et, epr, eph)}>Продать / Готово</button>
      </div>
    </div>
  );
}

/** Пегас: переброска войск со своего острова на другой свой остров (без моста). */
function PegasusPanel({ G, me, moves, selected, troopCount, setTroopCount }: {
  G: CycladesState; me: string | null; moves: any; selected: TerritoryId | null;
  troopCount: number; setTroopCount: (n: number) => void;
}) {
  const sel = selected ? G.territories[selected] : null;
  const source = !!sel && isIsland(sel) && sel.ownerId === me && sel.troops > 0;
  const max = source ? (sel as any).troops : 1;
  return (
    <div className="action-bar fleetmove">
      <div className="ab-title">🐎 Пегас: перебросьте войска на другой свой остров</div>
      <div className="ab-controls">
        <span className="sel-hint">{source ? `источник: ${sel!.name}` : 'выберите свой остров-источник'}</span>
        {source && (
          <span className="move-box">
            <span>войск:</span>
            <input type="number" min={1} max={max} value={Math.min(troopCount, max)} style={{ width: 40 }}
              onChange={(e) => setTroopCount(Math.max(1, Math.min(max, Number(e.target.value))))} />
            <span className="sel-hint">→ стрелка на остров назначения (бой, если там враг)</span>
          </span>
        )}
        <button className="end-turn" onClick={() => moves.endPegasus()}>Отмена</button>
      </div>
    </div>
  );
}

/** Химера: разыграть существо из сброса, затем сброс уходит в колоду. */
function ChimeraPanel({ G, me, moves, selected }: {
  G: CycladesState; me: string | null; moves: any; selected: TerritoryId | null;
}) {
  const sel = selected ? G.territories[selected] : null;
  // Уникальные разыгрываемые существа из сброса (фигурные/Химера — нельзя).
  const playable = [...new Set(G.creatures.discard)].filter((id) => chimeraPlayable(id));
  return (
    <div className="action-bar sphinx">
      <div className="ab-title">🦁 Химера: разыграйте существо из сброса (затем сброс уйдёт в колоду)</div>
      <div className="ab-controls">
        {playable.length === 0 && <span className="sel-hint">в сбросе нет подходящих существ</span>}
        <span className="creature-buy">
          {playable.map((id) => {
            const d = CREATURES[id];
            const needsTarget = d.target !== 'none';
            const targetOk = creatureTargetOk(d, sel, me!);
            const disabled = needsTarget && !targetOk;
            const title = needsTarget && !targetOk ? `выберите цель: ${d.target}` : d.desc;
            return (
              <button key={id} className="cr-buy" disabled={disabled} title={title}
                onClick={() => moves.chimeraReplay(id, needsTarget ? selected : undefined)}>
                {d.emblem} {d.name}
              </button>
            );
          })}
        </span>
        <button className="end-turn" onClick={() => moves.endChimera()}>Пропустить</button>
      </div>
    </div>
  );
}

/** Сатир: выбрать соперника, у которого украсть философа. */
function SatyrPanel({ G, ctx, me, moves, nameOf }: {
  G: CycladesState; ctx: any; me: string | null; moves: any; nameOf: (pid: string) => string;
}) {
  const opps: string[] = ctx.playOrder.filter((pid: string) => pid !== me && !G.players[pid].isEliminated);
  return (
    <div className="action-bar sphinx">
      <div className="ab-title">🍇 Сатир: у кого украсть философа?</div>
      <div className="ab-controls">
        <span className="creature-buy">
          {opps.map((pid) => (
            <button key={pid} className="cr-buy" onClick={() => moves.satyrSteal(pid)}>
              {nameOf(pid)}
            </button>
          ))}
        </span>
        <span className="sel-hint">если философа нет — ничего не произойдёт</span>
        <button className="end-turn" onClick={() => moves.endSatyr()}>Отмена</button>
      </div>
    </div>
  );
}

/** Персей (самопожертвование): увод войск с его острова на остров без Героя. */
function PerseusPanel({ G, moves, troopCount, setTroopCount }: {
  G: CycladesState; moves: any; troopCount: number; setTroopCount: (n: number) => void;
}) {
  const from = G.territories[G.perseusMove!.fromIsland];
  const max = isIsland(from) ? from.troops : 1;
  return (
    <div className="action-bar fleetmove">
      <div className="ab-title">⚔️ Персей: уведите войска с {from?.name} на остров без Героя</div>
      <div className="ab-controls">
        <span className="move-box">
          <span>войск:</span>
          <input type="number" min={1} max={max} value={Math.min(troopCount, max)} style={{ width: 40 }}
            onChange={(e) => setTroopCount(Math.max(1, Math.min(max, Number(e.target.value))))} />
          <span className="sel-hint">→ стрелка на остров назначения</span>
        </span>
        <button className="end-turn" onClick={() => moves.endPerseus()}>Отмена</button>
      </div>
    </div>
  );
}

/** Фурии: перенести маркер процветания с любого острова на свой (два клика по карте). */
function FuriesPanel({ G, me, moves, selected }: {
  G: CycladesState; me: string | null; moves: any; selected: TerritoryId | null;
}) {
  const [source, setSource] = useState<TerritoryId | null>(null);
  const sel = selected ? G.territories[selected] : null;
  const canSource = !!sel && isIsland(sel) && sel.prosperity > 0;
  const srcT = source ? G.territories[source] : null;
  const canDest = !!sel && isIsland(sel) && sel.ownerId === me && !!source && selected !== source;
  return (
    <div className="action-bar sphinx">
      <div className="ab-title">👹 Фурии: перенесите маркер процветания на свой остров</div>
      <div className="ab-controls">
        <span className="sel-hint">
          {source ? `источник: ${srcT?.name}` : 'выберите остров-источник (с маркером ✦)'}
        </span>
        {!source ? (
          <button disabled={!canSource} onClick={() => setSource(selected)}>Выбрать источник</button>
        ) : (
          <button disabled={!canDest} onClick={() => { moves.furiesTake(source, selected); setSource(null); }}>
            Перенести на {canDest ? sel!.name : 'свой остров'}
          </button>
        )}
        <button className="end-turn" onClick={() => moves.endFuries()}>Отмена</button>
      </div>
    </div>
  );
}

const BUILD_LABEL: Record<string, string> = {
  port: 'Порт', fortress: 'Крепость', temple: 'Храм', university: 'Университет',
};

/** Циклоп: выбрать своё здание и заменить его на здание любого типа. */
function CyclopsPanel({ G, moves }: { G: CycladesState; moves: any }) {
  const c = G.cyclopsSwap!;
  const isl = G.territories[c.islandId];
  const buildings = isIsland(isl) ? isl.buildings : [];
  const [idx, setIdx] = useState<number | null>(buildings.length === 1 ? 0 : null);
  return (
    <div className="action-bar sphinx">
      <div className="ab-title">🛠️ Циклоп: замена здания на {isIsland(isl) ? isl.name : ''}</div>
      <div className="ab-controls">
        <span className="sel-hint">здание:</span>
        <span className="creature-buy">
          {buildings.map((b, i) => (
            <button key={i} className="cr-buy" disabled={idx === i} onClick={() => setIdx(i)}>
              {BUILD_LABEL[b.type] ?? b.type}{idx === i ? ' ✓' : ''}
            </button>
          ))}
        </span>
        {idx !== null && (
          <>
            <span className="sel-hint">→ заменить на:</span>
            <span className="creature-buy">
              {ALL_BUILDINGS.map((t) => (
                <button key={t} className="cr-buy" onClick={() => moves.cyclopsReplace(idx, t)}>
                  {BUILD_LABEL[t]}
                </button>
              ))}
            </span>
          </>
        )}
        <button className="end-turn" onClick={() => moves.endCyclops()}>Отмена</button>
      </div>
    </div>
  );
}

/** Установка Метрополии: выбрать свой остров (при нехватке места снесутся здания). */
function MetropolisPanel({ G, me, moves, selected }: {
  G: CycladesState; me: string | null; moves: any; selected: TerritoryId | null;
}) {
  const sel = selected ? G.territories[selected] : null;
  const ok = !!sel && isIsland(sel) && sel.ownerId === me && !sel.hasMetropolis;
  const willDestroy = ok && isIsland(sel) && freeSlots(sel) < metropolisSlotCost(sel);
  const src = G.metropolisPlace!.source === 'philosophers' ? '4 философа'
    : G.metropolisPlace!.source === 'buildings' ? '4 разных здания' : 'Герой';
  return (
    <div className="action-bar prosperity">
      <div className="ab-title">🏛️ Метрополия ({src}): выберите свой остров для установки</div>
      <div className="ab-controls">
        <span className="sel-hint">
          {sel ? sel.name : 'кликните свой остров на карте'}
          {willDestroy ? ' — не хватает места, лишние здания будут снесены' : ''}
        </span>
        <button disabled={!ok} onClick={() => moves.placeMetropolis(selected)}>🏛️ Возвести Метрополию</button>
      </div>
    </div>
  );
}

function ProsperityPrompt({ G, me, moves, selected }: {
  G: CycladesState; me: string | null; moves: any; selected: TerritoryId | null;
}) {
  const sel = selected ? G.territories[selected] : null;
  const ok = !!sel && isIsland(sel) && sel.ownerId === me;
  return (
    <div className="action-bar prosperity">
      <div className="ab-title">☀️ Аполлон: положите маркер процветания на свой остров (+1 к доходу)</div>
      <div className="ab-controls">
        <span className="sel-hint">{sel ? sel.name : 'кликните свой остров на карте'}</span>
        <button disabled={!ok} onClick={() => moves.placeCornucopia(selected)}>✦ Положить маркер</button>
      </div>
    </div>
  );
}

function CreatureButtons({ G, pid, moves, sel, selected, god, s }: {
  G: CycladesState; pid: string; moves: any; sel: Territory | null;
  selected: TerritoryId | null; god: GodName; s: { creatureBought?: boolean; creatureCycled?: boolean };
}) {
  const market = G.creatures.market;
  if (market.length === 0 && god !== 'zeus') return null;
  const gold = G.players[pid].gold;
  return (
    <span className="creature-buy">
      {market.map((id, i) => {
        if (!id) return null; // пустой слот (рубашка) — покупать нечего
        // Герой: цена слота без скидки храмов; цель — свой остров (фигура).
        if (isHero(id)) {
          const h = HEROES[id];
          const hcost = CREATURE_SLOT_PRICES[i] ?? 2;
          const ok = !!sel && isIsland(sel) && sel.ownerId === pid;
          const disabled = !!s.creatureBought || gold < hcost || !ok;
          return (
            <button key={i} className="cr-buy hero" disabled={disabled}
              title={ok ? `нанять Героя на ${sel!.name}` : 'выберите свой остров для Героя'}
              onClick={() => moves.buyCreature(i, selected)}>
              {h.emblem} {h.name} (Герой, {hcost}🪙)
            </button>
          );
        }
        const d = CREATURES[id];
        const cost = creaturePriceAt(G, pid, i); // цена по позиции слота
        const needsTarget = d.target !== 'none';
        const targetOk = creatureTargetOk(d, sel, pid);
        const disabled = !!s.creatureBought || gold < cost || (needsTarget && !targetOk);
        const title = needsTarget && !targetOk ? `выберите цель: ${d.target}` : d.desc;
        return (
          <button key={i} className="cr-buy" disabled={disabled} title={title}
            onClick={() => moves.buyCreature(i, needsTarget ? selected : undefined)}>
            {d.emblem} {d.name} ({cost}🪙)
          </button>
        );
      })}
      {god === 'zeus' && (
        <button className="cr-cycle" disabled={!!s.creatureCycled}
          onClick={() => moves.cycleCreatures()} title="бесплатно сбросить рынок и открыть новый (1 раз за ход)">
          🔄 прокрутить
        </button>
      )}
    </span>
  );
}

/** Управление своими Героями: самопожертвование (Гектору — выбор) и роспуск. */
function HeroControls({ G, pid, moves }: { G: CycladesState; pid: string; moves: any }) {
  const heroes = G.players[pid].heroes;
  if (heroes.length === 0) return null;
  return (
    <span className="hero-controls">
      {heroes.map((h, i) => {
        const def = HEROES[h.id];
        const canSac = h.recruitedCycle !== G.cycle; // нельзя жертвовать в ход найма
        return (
          <span key={i} className="hero-ctl" title={`Бой: ${def.warPower}. Жертва: ${def.sacrifice}`}>
            <span className="hc-name">{def.emblem}{def.name}</span>
            {h.id === 'hector' ? (
              <>
                <button disabled={!canSac} onClick={() => moves.sacrificeHero('hector', '2to1')} title="2 Жреца → 1 Философ">⚱2→1</button>
                <button disabled={!canSac} onClick={() => moves.sacrificeHero('hector', '5to2')} title="5 Жрецов → 2 Философа">⚱5→2</button>
              </>
            ) : (
              <button disabled={!canSac} onClick={() => moves.sacrificeHero(h.id)} title={def.sacrifice}>⚱ жертва</button>
            )}
            <button className="dismiss" onClick={() => moves.dismissHero(h.id)} title="распустить (не платить апкип)">✖</button>
          </span>
        );
      })}
    </span>
  );
}

function EventLog({ G }: { G: CycladesState }) {
  const recent = G.log.slice(-6).reverse();
  return (
    <div className="log">
      {recent.map((e, i) => <div key={i} className="log-line">[ц{e.cycle}] {e.text}</div>)}
    </div>
  );
}
