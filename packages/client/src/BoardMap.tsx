import { motion } from 'framer-motion';
import {
  type CycladesState,
  type TerritoryId,
  type Island,
  type Sea,
  isIsland,
  isSea,
} from '@cyclades/engine';
import { SvgDefs } from './art/SvgDefs';
import { blobPath } from './art/blob';
import { Trireme, Hoplite, BuildingGlyph, Metropolis } from './art/pieces';

interface Props {
  G: CycladesState;
  me: string | null;
  selected: TerritoryId | null;
  onSelect: (id: TerritoryId) => void;
}

export function BoardMap({ G, me, selected, onSelect }: Props) {
  const territories = Object.values(G.territories);
  const islands = territories.filter(isIsland);
  const seas = territories.filter(isSea);
  const colorOf = (pid: string | null) => (pid ? G.players[pid].color : '#7c8aa0');

  const routes: { x1: number; y1: number; x2: number; y2: number; sea: boolean }[] = [];
  for (const sea of seas) {
    for (const sid of sea.adjacentSeas) {
      const o = G.territories[sid];
      if (o && sea.id < sid) routes.push({ x1: sea.pos.x, y1: sea.pos.y, x2: o.pos.x, y2: o.pos.y, sea: true });
    }
    for (const iid of sea.adjacentIslands) {
      const isl = G.territories[iid];
      if (isl) routes.push({ x1: sea.pos.x, y1: sea.pos.y, x2: isl.pos.x, y2: isl.pos.y, sea: false });
    }
  }

  return (
    <svg className="map" viewBox="0 0 1000 720" preserveAspectRatio="xMidYMid meet">
      <SvgDefs />
      <rect x="0" y="0" width="1000" height="720" fill="url(#seaGrad)" rx="14" />
      <rect x="0" y="0" width="1000" height="720" filter="url(#waterTex)" opacity="0.5" rx="14" />

      {/* морские маршруты */}
      <g strokeLinecap="round">
        {routes.map((r, i) => (
          <line key={i} x1={r.x1} y1={r.y1} x2={r.x2} y2={r.y2}
            stroke="#ffffff" strokeOpacity={r.sea ? 0.16 : 0.08}
            strokeWidth={r.sea ? 5 : 3} strokeDasharray={r.sea ? '1 9' : '1 7'} />
        ))}
      </g>

      {seas.map((sea) => (
        <SeaZone key={sea.id} sea={sea} G={G} selected={selected === sea.id} color={colorOf(sea.ownerId)} onSelect={onSelect} />
      ))}
      {islands.map((isl) => (
        <IslandNode key={isl.id} isl={isl} G={G} me={me} selected={selected === isl.id} color={colorOf(isl.ownerId)} onSelect={onSelect} />
      ))}
    </svg>
  );
}

function Badge({ x, y, text }: { x: number; y: number; text: string | number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <circle r="9" fill="#15212f" stroke="#dfe7f0" strokeWidth="1" opacity="0.95" />
      <text className="badge-txt" y="3.5">{text}</text>
    </g>
  );
}

function IslandNode({ isl, G, me, selected, color, onSelect }: {
  isl: Island; G: CycladesState; me: string | null; selected: boolean; color: string; onSelect: (id: TerritoryId) => void;
}) {
  const r = isl.id === 'delos' ? 62 : 52;
  const { x, y } = isl.pos;
  const owned = isl.ownerId != null;
  const path = blobPath(x, y, r, isl.id);

  return (
    <motion.g
      initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }}
      style={{ cursor: 'pointer' }} onClick={() => onSelect(isl.id)}
    >
      {selected && (
        <motion.path d={blobPath(x, y, r + 7, isl.id)} fill="none" stroke="#ffd76a" strokeWidth="4"
          animate={{ opacity: [0.5, 1, 0.5] }} transition={{ repeat: Infinity, duration: 1.6 }} />
      )}
      <path d={path} fill="url(#sandGrad)" filter="url(#softShadow)" />
      <path d={path} filter="url(#landTex)" opacity="0.7" />
      <path d={path} fill="none" stroke="#9a7b3e" strokeWidth="2.2" />
      {owned && <path d={path} fill="none" stroke={color} strokeWidth="3" strokeOpacity="0.85" strokeDasharray="6 5" />}

      <text className="t-name dark" x={x} y={y - r + 14}>{isl.name}</text>
      <text className="t-pros" x={x + r - 16} y={y - r + 16}>🌾{isl.prosperity}</text>

      {/* здания / метрополия */}
      {isl.hasMetropolis ? (
        <g transform={`translate(${x} ${y + 6})`}><Metropolis /></g>
      ) : (
        <g>
          {isl.buildings.map((b, i) => {
            const n = isl.buildings.length;
            const bx = x + (i - (n - 1) / 2) * 22;
            return <g key={i} transform={`translate(${bx} ${y + 8})`}><BuildingGlyph type={b.type} /></g>;
          })}
        </g>
      )}

      {/* войска */}
      {isl.troops > 0 && (
        <g transform={`translate(${x - r * 0.5} ${y + r * 0.42}) scale(1.25)`}>
          <Hoplite color={G.players[isl.ownerId!].color} />
          {isl.troops > 1 && <Badge x={11} y={-9} text={isl.troops} />}
        </g>
      )}
      {isl.ownerId === me && <circle cx={x} cy={y - r + 4} r="3.2" fill={color} stroke="#fff" strokeWidth="1" />}
    </motion.g>
  );
}

function SeaZone({ sea, G, selected, color, onSelect }: {
  sea: Sea; G: CycladesState; selected: boolean; color: string; onSelect: (id: TerritoryId) => void;
}) {
  const { x, y } = sea.pos;
  const w = 104, h = 60;
  return (
    <motion.g initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ cursor: 'pointer' }} onClick={() => onSelect(sea.id)}>
      <rect x={x - w / 2} y={y - h / 2} width={w} height={h} rx="22"
        fill="#10456c" fillOpacity="0.45"
        stroke={selected ? '#ffd76a' : sea.fleets > 0 ? color : '#7fb0d6'}
        strokeOpacity={selected ? 1 : 0.5} strokeWidth={selected ? 4 : 1.5} strokeDasharray="4 4" />
      <text className="t-name sea" x={x} y={y - h / 2 + 15}>{sea.name}</text>
      {sea.fleets > 0 && (
        <g transform={`translate(${x} ${y + 10}) scale(1.3)`}>
          <Trireme color={G.players[sea.ownerId!].color} />
          {sea.fleets > 1 && <Badge x={15} y={-8} text={sea.fleets} />}
        </g>
      )}
    </motion.g>
  );
}
