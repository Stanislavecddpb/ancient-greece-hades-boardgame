import { useState } from 'react';
import type { BoardProps } from 'boardgame.io/react';
import {
  type CycladesState,
  type GodName,
  type TerritoryId,
  GOD_BUILDING,
  islandsOf,
  metropolisCount,
  currentTurn,
  activePlayerId,
  godLabel,
  recruitCost,
  freeSlots,
  canPlaceFleet,
  isIsland,
  isSea,
} from '@cyclades/engine';
import { BoardMap } from './BoardMap';

const GOD_EMOJI: Record<GodName, string> = {
  ares: '🗡️', poseidon: '🌊', zeus: '⚡', athena: '🦉', apollo: '☀️',
};

export function Board({ G, ctx, moves, playerID }: BoardProps<CycladesState>) {
  const [selected, setSelected] = useState<TerritoryId | null>(null);

  if (ctx.gameover) {
    const w = G.players[ctx.gameover.winner];
    return <div className="board"><h2>🏆 Победа: {w?.name}!</h2></div>;
  }

  return (
    <div className="board">
      <div className="status">
        Цикл {G.cycle} · фаза: <b>{phaseLabel(ctx.phase)}</b> · вы: <b>{G.players[playerID ?? '0']?.name}</b>
      </div>
      <BoardMap G={G} me={playerID} selected={selected} onSelect={setSelected} />
      <PlayersTable G={G} me={playerID} />
      {ctx.phase === 'auction' && <AuctionPanel G={G} me={playerID} moves={moves} />}
      {ctx.phase === 'actions' && (
        <ActionsPanel G={G} me={playerID} moves={moves} selected={selected} />
      )}
      <EventLog G={G} />
    </div>
  );
}

function phaseLabel(phase: string | null): string {
  if (phase === 'auction') return 'аукцион богов';
  if (phase === 'actions') return 'действия';
  return phase ?? '—';
}

function PlayersTable({ G, me }: { G: CycladesState; me: string | null }) {
  return (
    <table className="players">
      <thead>
        <tr><th></th><th title="золото">🪙</th><th title="жрецы">⚜️</th><th title="философы">📜</th><th title="метрополии">🏛️</th><th title="острова">о-ва</th></tr>
      </thead>
      <tbody>
        {Object.values(G.players).map((p) => (
          <tr key={p.id} className={p.id === me ? 'me' : ''}>
            <td><span className="dot" style={{ background: p.color }} />{p.name}{p.id === me ? ' (вы)' : ''}</td>
            <td>{p.gold}</td>
            <td>{p.priests}</td>
            <td>{p.philosophers}</td>
            <td>{metropolisCount(G, p.id)}</td>
            <td>{islandsOf(G, p.id).length}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function AuctionPanel({ G, me, moves }: { G: CycladesState; me: string | null; moves: any }) {
  const a = G.auction;
  const [bids, setBids] = useState<Record<string, number>>({});
  if (!a) return null;
  const myTurn = a.toAct === me;

  return (
    <div className="panel">
      <h3>Аукцион {myTurn ? '— ваш ход' : `— ходит ${G.players[a.toAct].name}`}</h3>
      <div className="gods">
        {a.slots.map((slot) => {
          const minBid = slot.occupantId ? slot.bid + 1 : 1;
          const val = bids[slot.god] ?? minBid;
          return (
            <div key={slot.god} className="god">
              <div className="god-name">{GOD_EMOJI[slot.god]} {godLabel(slot.god)}</div>
              <div className="god-bid">
                {slot.occupantId ? `${G.players[slot.occupantId].name}: ${slot.bid}🪙` : 'свободно'}
              </div>
              {myTurn && slot.occupantId !== me && (
                <div className="bid-row">
                  <input
                    type="number" min={minBid} value={val}
                    onChange={(e) => setBids({ ...bids, [slot.god]: Number(e.target.value) })}
                  />
                  <button onClick={() => moves.bidGod(slot.god, val)}>Ставка</button>
                </div>
              )}
            </div>
          );
        })}
        <div className="god apollo">
          <div className="god-name">☀️ Аполлон</div>
          <div className="god-bid">бесплатно{a.apollo.length ? ` · ${a.apollo.map((p) => G.players[p].name).join(', ')}` : ''}</div>
          {myTurn && <button onClick={() => moves.chooseApollo()}>Под Аполлона</button>}
        </div>
      </div>
    </div>
  );
}

function ActionsPanel({
  G, me, moves, selected,
}: { G: CycladesState; me: string | null; moves: any; selected: TerritoryId | null }) {
  const turn = currentTurn(G);
  if (!turn) return null;
  const myTurn = activePlayerId(G) === me;
  const god = turn.god;
  const s = G.actions!;
  const sel = selected ? G.territories[selected] : null;
  const buildType = GOD_BUILDING[god];

  const canRecruitTroop = !!sel && isIsland(sel) && sel.ownerId === turn.playerId;
  const canRecruitFleet = !!sel && isSea(sel) && canPlaceFleet(G, turn.playerId, sel.id);
  const canBuildHere =
    !!sel && isIsland(sel) && sel.ownerId === turn.playerId && freeSlots(sel) > 0 &&
    !!buildType && !sel.buildings.some((b) => b.type === buildType);

  return (
    <div className="panel">
      <h3>{GOD_EMOJI[god]} {godLabel(god)} — {myTurn ? 'ваш ход' : G.players[turn.playerId].name}</h3>
      {myTurn && (
        <div className="actions">
          <div className="sel-hint">Выбрано: <b>{sel ? sel.name : '— кликните по карте'}</b></div>

          {god === 'ares' && (
            <button disabled={!canRecruitTroop} onClick={() => moves.recruit(selected)}>
              ⚔️ Войско на остров ({recruitCost(god, s.recruited)}🪙)
            </button>
          )}
          {god === 'poseidon' && (
            <button disabled={!canRecruitFleet} onClick={() => moves.recruit(selected)}>
              ⛵ Флот в море ({recruitCost(god, s.recruited)}🪙)
            </button>
          )}
          {god === 'zeus' && (
            <button onClick={() => moves.recruit()}>⚜️ Нанять жреца ({recruitCost(god, s.recruited)}🪙)</button>
          )}
          {god === 'athena' && (
            <button onClick={() => moves.recruit()}>📜 Нанять философа ({recruitCost(god, s.recruited)}🪙)</button>
          )}
          {buildType && (
            <button disabled={!canBuildHere || s.built} onClick={() => moves.build(selected)}>
              🏗️ Построить {buildType} (2🪙)
            </button>
          )}
          <button className="end-turn" onClick={() => moves.endGod()}>Завершить действия →</button>
        </div>
      )}
    </div>
  );
}

function EventLog({ G }: { G: CycladesState }) {
  const recent = G.log.slice(-8).reverse();
  return (
    <div className="log">
      {recent.map((e, i) => (
        <div key={i} className="log-line">[ц{e.cycle}] {e.text}</div>
      ))}
    </div>
  );
}
