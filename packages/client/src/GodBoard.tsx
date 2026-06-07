import { useState } from 'react';
import {
  type CycladesState,
  type GodName,
  COMPETITIVE_GODS,
} from '@cyclades/engine';

interface GodData {
  title: string;
  emblem: string;
  theme: string;
  abilities: string[];
  build?: string;
}

const GOD_DATA: Record<GodName, GodData> = {
  ares: {
    title: 'Арес', emblem: '⚔', theme: '#b23a3a',
    abilities: ['Воин бесплатно', '+воин = 2🪙 / 3🪙 / 4🪙', '1🪙: двигать 3 воина по кораблю остров→остров'],
    build: '🏰 Крепость = 2🪙',
  },
  poseidon: {
    title: 'Посейдон', emblem: '🔱', theme: '#1d7a8c',
    abilities: ['Корабль бесплатно', '+корабль = 2🪙 / 3🪙 / 4🪙', '1🪙: двигать флот на 3 клетки'],
    build: '⚓ Порт = 2🪙',
  },
  zeus: {
    title: 'Зевс', emblem: '⚡', theme: '#7a5cb0',
    abilities: ['Жрец бесплатно', '+жрец = 4🪙', '1🪙: прокрутить колоду существ'],
    build: '🏛️ Храм = 2🪙 (−1 к цене существ)',
  },
  athena: {
    title: 'Афина', emblem: '🦉', theme: '#6f8a3a',
    abilities: ['Философ бесплатно', '+философ = 4🪙', '4 философа = Метрополия'],
    build: '🎓 Университет = 2🪙',
  },
  apollo: {
    title: 'Аполлон', emblem: '☀', theme: '#c79a2e',
    abilities: ['Доход без борьбы', 'Первый — рог изобилия + 🪙', 'Остальные — 🪙'],
  },
};

interface Props {
  G: CycladesState;
  ctx: { phase: string | null; currentPlayer: string; numPlayers: number; playOrder: string[] };
  me: string | null;
  moves: any;
}

export function GodBoard({ G, ctx, me, moves }: Props) {
  const auction = G.auction;
  const phase = ctx.phase;
  const cycleGods: GodName[] = auction
    ? auction.slots.map((s) => s.god)
    : G.actions
      ? COMPETITIVE_GODS.filter((g) => G.actions!.queue.some((t) => t.god === g))
      : [];

  return (
    <div className="godboard">
      <div className="gb-top">
        <TurnOrder G={G} ctx={ctx} />
        <Creatures />
      </div>

      <div className="gb-gods">
        {cycleGods.map((god) => (
          <GodSlot key={god} god={god} G={G} phase={phase} me={me} moves={moves} />
        ))}
        <GodSlot god="apollo" G={G} phase={phase} me={me} moves={moves} />
      </div>
    </div>
  );
}

function TurnOrder({ G, ctx }: { G: CycladesState; ctx: Props['ctx'] }) {
  const n = ctx.numPlayers;
  const order = Array.from({ length: n }, (_, i) => ctx.playOrder[(G.startIndex + i) % ctx.playOrder.length]);
  const activeId = G.auction ? G.auction.toAct : null;
  return (
    <div className="turn-order">
      {Array.from({ length: 5 }, (_, i) => {
        const pid = order[i];
        const p = pid ? G.players[pid] : null;
        return (
          <div key={i} className={`to-row ${p && p.id === activeId ? 'active' : ''}`}>
            <span className="to-num">{i + 1}</span>
            {p && <span className="to-tok" style={{ background: p.color }} />}
            {p && <span className="to-name">{p.name}</span>}
          </div>
        );
      })}
    </div>
  );
}

function Creatures() {
  return (
    <div className="creatures">
      <div className="cr-row">
        <div className="cr-slot deck">колода</div>
        <div className="cr-slot grave">кладбище</div>
      </div>
      <div className="cr-row">
        <div className="cr-slot cost">4🪙</div>
        <div className="cr-slot cost">3🪙</div>
        <div className="cr-slot cost">2🪙</div>
      </div>
      <div className="cr-note">🏛️ храм: −1 к цене существ</div>
    </div>
  );
}

function GodSlot({ god, G, phase, me, moves }: {
  god: GodName; G: CycladesState; phase: string | null; me: string | null; moves: any;
}) {
  const d = GOD_DATA[god];
  const auction = G.auction;
  const isApollo = god === 'apollo';
  const slot = auction?.slots.find((s) => s.god === god);
  const myTurn = phase === 'auction' && auction?.toAct === me;
  const occupant = slot?.occupantId ? G.players[slot.occupantId] : null;

  // активный бог в фазе действий
  const activeTurn = G.actions ? G.actions.queue[G.actions.index] : null;
  const isActiveGod = phase === 'actions' && activeTurn?.god === god;

  return (
    <div className={`god-slot ${isActiveGod ? 'acting' : ''}`} style={{ ['--theme' as any]: d.theme }}>
      {/* ставочная дорожка */}
      {phase === 'auction' && !isApollo && (
        <BidTrack slotBid={slot?.bid ?? 0} occupant={occupant} canBid={!!myTurn && slot?.occupantId !== me}
          onBid={(amount) => moves.bidGod(god, amount)} />
      )}
      {phase === 'auction' && isApollo && (
        <ApolloTrack G={G} canPick={!!myTurn} onPick={() => moves.chooseApollo()} />
      )}

      <div className="gs-body">
        <div className="gs-emblem">{d.emblem}</div>
        <div className="gs-main">
          <div className="gs-title">{d.title}</div>
          <ul className="gs-abil">
            {d.abilities.map((a, i) => <li key={i}>{a}</li>)}
          </ul>
          {d.build && <div className="gs-build">{d.build}</div>}
        </div>
        {occupant && phase === 'auction' && (
          <div className="gs-occ" style={{ color: occupant.color }}>● {occupant.name}: {slot!.bid}🪙</div>
        )}
      </div>
    </div>
  );
}

function BidTrack({ slotBid, occupant, canBid, onBid }: {
  slotBid: number; occupant: { color: string } | null; canBid: boolean; onBid: (n: number) => void;
}) {
  const [plus10, setPlus10] = useState(false);
  const cells = Array.from({ length: 10 }, (_, i) => i + 1);
  const mark = slotBid > 10 ? slotBid - 10 : slotBid; // на какой кружок поставить метку
  return (
    <div className="bid-track">
      <span className="bt-priest" title="жрец снижает оплату на 1">🪙⚜️</span>
      {cells.map((n) => {
        const occupied = occupant && mark === n;
        return (
          <button key={n} className={`bt-cell ${occupied ? 'occ' : ''}`}
            style={occupied ? { background: occupant!.color } : undefined}
            disabled={!canBid} onClick={() => onBid(plus10 ? n + 10 : n)}>
            {n}
          </button>
        );
      })}
      <button className={`bt-cell plus ${plus10 ? 'on' : ''}`} disabled={!canBid}
        onClick={() => setPlus10((v) => !v)}>+10</button>
    </div>
  );
}

function ApolloTrack({ G, canPick, onPick }: { G: CycladesState; canPick: boolean; onPick: () => void }) {
  const apollo = G.auction?.apollo ?? [];
  return (
    <div className="apollo-track">
      {Array.from({ length: 5 }, (_, i) => {
        const pid = apollo[i];
        const p = pid ? G.players[pid] : null;
        return (
          <button key={i} className="at-slot" disabled={!canPick || !!p}
            onClick={onPick} style={p ? { background: p.color } : undefined}>
            {p ? '' : i + 1}
          </button>
        );
      })}
    </div>
  );
}
