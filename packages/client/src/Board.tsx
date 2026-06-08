import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import type { BoardProps } from 'boardgame.io/react';
import {
  type CycladesState,
  type GodName,
  type TerritoryId,
  GOD_BUILDING,
  CREATURES,
  creaturePriceAt,
  CREATURE_SLOT_PRICES,
  metropolisCount,
  currentTurn,
  activePlayerId,
  godLabel,
  recruitCost,
  freeSlots,
  metropolisSlotCost,
  canBuildMetropolis,
  canPlaceFleet,
  troopReachable,
  isIsland,
  isSea,
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
  if (canAct && me && G.fleetMove && G.fleetMove.playerId === me) {
    // Идёт приказ флоту: стрелки в соседние клетки от текущей позиции группы.
    const at = G.territories[G.fleetMove.at];
    const carrying = G.fleetMove.carrying;
    const take = Math.min(Math.max(1, fleetTake), carrying);
    const targets = isSea(at) ? at.adjacentSeas.filter((id) => isSea(G.territories[id])) : [];
    movement = { from: G.fleetMove.at, targets, onMove: (to) => moves.hopFleet(to, take) };
  } else if (canAct && me && !G.combat && sel && turn!.god === 'ares' && isIsland(sel) && sel.ownerId === me && sel.troops > 0) {
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
        ) : G.fleetMove && G.fleetMove.playerId === me ? (
          <FleetMovePanel G={G} moves={moves} take={fleetTake} setTake={setFleetTake} />
        ) : ctx.phase === 'actions' && G.pendingCornucopia ? (
          G.pendingCornucopia === me ? (
            <ProsperityPrompt G={G} me={me} moves={moves} selected={selected} />
          ) : (
            <div className="action-bar"><div className="ab-title">☀️ {nameOf(G.pendingCornucopia)} кладёт рог изобилия…</div></div>
          )
        ) : ctx.phase === 'actions' ? (
          <ActionBar G={G} me={me} moves={moves} selected={selected}
            troopCount={troopCount} setTroopCount={setTroopCount} hasMove={!!movement} />
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
              <span title="метрополии">🏛️{metropolisCount(G, pid)}</span>
            </div>
          </div>
        );
      })}
    </>
  );
}

function ActionBar({ G, me, moves, selected, troopCount, setTroopCount, hasMove }: {
  G: CycladesState; me: string | null; moves: any; selected: TerritoryId | null;
  troopCount: number; setTroopCount: (n: number) => void; hasMove: boolean;
}) {
  const turn = currentTurn(G);
  if (!turn) return null;
  const myTurn = activePlayerId(G) === me;
  const god = turn.god;
  const pid = turn.playerId;
  const s = G.actions!;
  const sel = selected ? G.territories[selected] : null;
  const buildType = GOD_BUILDING[god];

  const canRecruitTroop = !!sel && isIsland(sel) && sel.ownerId === pid;
  const canRecruitFleet = !!sel && isSea(sel) && canPlaceFleet(G, pid, sel.id);
  const canBuildHere =
    !!sel && isIsland(sel) && sel.ownerId === pid && freeSlots(sel) > 0 &&
    !!buildType && !sel.buildings.some((b) => b.type === buildType);
  // Источник перемещения войск выбран — показываем выбор количества; стрелки рисует карта.
  const troopSource = !!sel && isIsland(sel) && sel.ownerId === pid && sel.troops > 0 && god === 'ares';
  const fleetSource = !!sel && isSea(sel) && sel.ownerId === pid && sel.fleets > 0 && god === 'poseidon';
  const canStartFleet = fleetSource && G.players[pid].gold >= 1;
  const troopMax = troopSource ? Math.min(3, (sel as any).troops) : 3;
  // Постройка Метрополии: есть ресурс и выбранный свой остров с местом.
  const metroReady = canBuildMetropolis(G, pid);
  const canMetroHere =
    !!sel && isIsland(sel) && sel.ownerId === pid && !sel.hasMetropolis && freeSlots(sel) >= metropolisSlotCost(sel);

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
          {metroReady && (
            <button disabled={!canMetroHere} onClick={() => moves.buildMetropolis(selected)}
              title="4 разных здания или 4 философа → Метрополия на острове с местом">
              🏛️ Метрополия
            </button>
          )}
          {fleetSource && (
            <button disabled={!canStartFleet} onClick={() => moves.startFleetMove(selected)}
              title="за 1 монету двигать корабли до 3 клеток, можно высаживать по пути">
              ⛵ двинуть флот (1🪙)
            </button>
          )}
          <CreatureButtons G={G} pid={pid} moves={moves} sel={sel} selected={selected} god={god} s={s} />
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
          <CreatureCard def={CREATURES[id]} />
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
  return (
    <div className="action-bar combat">
      <div className="ab-title">⚔️ Бой за {loc?.name} · раунд {c.round}</div>
      <div className="ab-controls">
        <span className="combat-side" style={{ color: attacker.color }}>
          {attacker.name}: {unit}×{c.attackerUnits}
        </span>
        <span className="combat-vs">против</span>
        <span className="combat-side" style={{ color: defender.color }}>
          {defender.name}: {unit}×{c.defenderUnits}{c.defenderBonus > 0 ? ` (+${c.defenderBonus}🛡)` : ''}
        </span>
        {last && (
          <span className="combat-roll">
            раунд: {last.aLost ? `−${unit}атак.` : ''} {last.dLost ? `−${unit}защ.` : ''}{!last.aLost && !last.dLost ? 'без потерь' : ''}
          </span>
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

function ProsperityPrompt({ G, me, moves, selected }: {
  G: CycladesState; me: string | null; moves: any; selected: TerritoryId | null;
}) {
  const sel = selected ? G.territories[selected] : null;
  const ok = !!sel && isIsland(sel) && sel.ownerId === me;
  return (
    <div className="action-bar prosperity">
      <div className="ab-title">☀️ Аполлон: положите рог изобилия на свой остров (+1 к доходу)</div>
      <div className="ab-controls">
        <span className="sel-hint">{sel ? sel.name : 'кликните свой остров на карте'}</span>
        <button disabled={!ok} onClick={() => moves.placeCornucopia(selected)}>🌽 Положить рог</button>
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

function EventLog({ G }: { G: CycladesState }) {
  const recent = G.log.slice(-6).reverse();
  return (
    <div className="log">
      {recent.map((e, i) => <div key={i} className="log-line">[ц{e.cycle}] {e.text}</div>)}
    </div>
  );
}
