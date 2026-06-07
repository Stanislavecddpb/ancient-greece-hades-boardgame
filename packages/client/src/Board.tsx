import { useState } from 'react';
import type { BoardProps } from 'boardgame.io/react';
import {
  type CycladesState,
  type GodName,
  type TerritoryId,
  GOD_BUILDING,
  CREATURES,
  creatureCost,
  metropolisCount,
  currentTurn,
  activePlayerId,
  godLabel,
  recruitCost,
  freeSlots,
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
  return <GameView G={p.G} ctx={p.ctx} moves={p.moves} me={p.playerID} />;
}

/** Хотсит: «я» — текущий активный игрок (ходим за всех по очереди). */
export function HotseatBoard(p: BoardProps<CycladesState>) {
  return <GameView G={p.G} ctx={p.ctx} moves={p.moves} me={p.ctx.currentPlayer} />;
}

function GameView({ G, ctx, moves, me }: { G: CycladesState; ctx: any; moves: any; me: string | null }) {
  const [selected, setSelected] = useState<TerritoryId | null>(null);
  const [troopCount, setTroopCount] = useState(1);
  const [fleetTake, setFleetTake] = useState(99);

  if (ctx.gameover) {
    const w = G.players[ctx.gameover.winner];
    return <div className="gameover"><h1>🏆 Победа: {w?.name}!</h1></div>;
  }

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
    const n = Math.min(troopCount, sel.troops);
    const targets = [...troopReachable(G, sel.id, me)];
    if (targets.length) movement = { from: sel.id, targets, onMove: (to) => { moves.moveTroops(sel.id, to, n); setSelected(null); } };
  }

  return (
    <div className="game">
      <div className="map-area">
        <div className="board-stage">
          <BoardMap G={G} me={me} selected={selected} onSelect={setSelected} movement={movement} />
          <PlayersCorners G={G} ctx={ctx} activeId={activeId} me={me} />
        </div>
        <div className="phase-tag">Цикл {G.cycle} · {phaseLabel(ctx.phase)}</div>
        {G.combat ? (
          <CombatPanel G={G} me={me} moves={moves} />
        ) : G.fleetMove && G.fleetMove.playerId === me ? (
          <FleetMovePanel G={G} moves={moves} take={fleetTake} setTake={setFleetTake} />
        ) : ctx.phase === 'actions' && G.pendingCornucopia ? (
          G.pendingCornucopia === me ? (
            <ProsperityPrompt G={G} me={me} moves={moves} selected={selected} />
          ) : (
            <div className="action-bar"><div className="ab-title">☀️ {G.players[G.pendingCornucopia].name} кладёт рог изобилия…</div></div>
          )
        ) : ctx.phase === 'actions' ? (
          <ActionBar G={G} me={me} moves={moves} selected={selected}
            troopCount={troopCount} setTroopCount={setTroopCount} hasMove={!!movement} />
        ) : null}
        <EventLog G={G} />
      </div>
      <GodBoard G={G} ctx={ctx} me={me} moves={moves} />
    </div>
  );
}

function phaseLabel(phase: string | null): string {
  if (phase === 'auction') return 'аукцион богов';
  if (phase === 'actions') return 'фаза действий';
  return phase ?? '—';
}

const CORNERS = ['tl', 'tr', 'bl', 'br'];

function PlayersCorners({ G, ctx, activeId, me }: {
  G: CycladesState; ctx: any; activeId: string | null; me: string | null;
}) {
  return (
    <>
      {ctx.playOrder.map((pid: string, i: number) => {
        const p = G.players[pid];
        return (
          <div key={pid} className={`player-corner ${CORNERS[i] ?? 'tl'} ${pid === activeId ? 'active' : ''}`}
            style={{ ['--pc' as any]: p.color }}>
            <div className="pc-name"><span className="pc-dot" style={{ background: p.color }} />{p.name}{pid === me ? ' (вы)' : ''}</div>
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
              <span>войск:</span>
              <input type="number" min={1} max={(sel as any).troops} value={troopCount}
                onChange={(e) => setTroopCount(Math.max(1, Number(e.target.value)))} style={{ width: 40 }} />
              <span className="sel-hint">{hasMove ? '→ кликните стрелку на карте' : 'нет ходов'}</span>
            </span>
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
        const cost = creatureCost(G, pid, d);
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
