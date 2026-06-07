import { useState } from 'react';
import type { BoardProps } from 'boardgame.io/react';
import {
  type CycladesState,
  type GodName,
  type TerritoryId,
  GOD_BUILDING,
  metropolisCount,
  currentTurn,
  activePlayerId,
  godLabel,
  recruitCost,
  freeSlots,
  canPlaceFleet,
  fleetReachable,
  troopReachable,
  isIsland,
  isSea,
} from '@cyclades/engine';
import { BoardMap } from './BoardMap';
import { GodBoard } from './GodBoard';

const GOD_EMOJI: Record<GodName, string> = {
  ares: '🗡️', poseidon: '🌊', zeus: '⚡', athena: '🦉', apollo: '☀️',
};

export function Board({ G, ctx, moves, playerID }: BoardProps<CycladesState>) {
  const [selected, setSelected] = useState<TerritoryId | null>(null);

  if (ctx.gameover) {
    const w = G.players[ctx.gameover.winner];
    return <div className="gameover"><h1>🏆 Победа: {w?.name}!</h1></div>;
  }

  const activeId = G.auction ? G.auction.toAct : activePlayerId(G);

  return (
    <div className="game">
      <div className="map-area">
        <BoardMap G={G} me={playerID} selected={selected} onSelect={setSelected} />
        <PlayersCorners G={G} ctx={ctx} activeId={activeId} me={playerID} />
        <div className="phase-tag">Цикл {G.cycle} · {phaseLabel(ctx.phase)}</div>
        {ctx.phase === 'actions' && (
          <ActionBar G={G} me={playerID} moves={moves} selected={selected} />
        )}
        <EventLog G={G} />
      </div>
      <GodBoard G={G} ctx={ctx as any} me={playerID} moves={moves} />
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
              <span title="золото">🪙{p.gold}</span>
              <span title="жрецы">⚜️{p.priests}</span>
              <span title="философы">📜{p.philosophers}</span>
              <span title="метрополии">🏛️{metropolisCount(G, pid)}</span>
            </div>
          </div>
        );
      })}
    </>
  );
}

function ActionBar({ G, me, moves, selected }: {
  G: CycladesState; me: string | null; moves: any; selected: TerritoryId | null;
}) {
  const [troopCount, setTroopCount] = useState(1);
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
  const fleetTargets = sel && isSea(sel) && sel.ownerId === pid && sel.fleets > 0 ? [...fleetReachable(G, sel.id, pid)] : [];
  const troopTargets = sel && isIsland(sel) && sel.ownerId === pid && sel.troops > 0 ? [...troopReachable(G, sel.id, pid)] : [];

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
          {troopTargets.length > 0 && (
            <span className="move-box">
              <input type="number" min={1} max={(sel as any).troops} value={troopCount}
                onChange={(e) => setTroopCount(Number(e.target.value))} style={{ width: 36 }} />
              {troopTargets.map((id) => <button key={id} onClick={() => moves.moveTroops(selected, id, troopCount)}>→ {G.territories[id].name}</button>)}
            </span>
          )}
          {fleetTargets.length > 0 && (
            <span className="move-box">
              {fleetTargets.map((id) => <button key={id} onClick={() => moves.moveFleet(selected, id)}>⛵→ {G.territories[id].name}</button>)}
            </span>
          )}
          <button className="end-turn" onClick={() => moves.endGod()}>Завершить →</button>
        </div>
      )}
    </div>
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
