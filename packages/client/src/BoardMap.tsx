import { motion } from 'framer-motion';
import {
  type CycladesState,
  type TerritoryId,
  type Island,
  type Sea,
  isIsland,
  isSea,
  CELL_D,
  BOARD_CENTER,
  BOARD_RADIUS,
  BOARD_VIEWBOX,
} from '@cyclades/engine';
import { SvgDefs } from './art/SvgDefs';
import { Trireme, Hoplite, BuildingGlyph, Metropolis, CoinStack } from './art/pieces';

interface Props {
  G: CycladesState;
  me: string | null;
  selected: TerritoryId | null;
  onSelect: (id: TerritoryId) => void;
}

const SEA_R = CELL_D * 0.46;
const LAND_R = CELL_D * 0.56;

export function BoardMap({ G, me, selected, onSelect }: Props) {
  const territories = Object.values(G.territories);
  const islands = territories.filter(isIsland);
  const seas = territories.filter(isSea);
  const colorOf = (pid: string | null) => (pid ? G.players[pid].color : '#7c8aa0');

  return (
    <svg className="map" viewBox={`0 0 ${BOARD_VIEWBOX} ${BOARD_VIEWBOX}`} preserveAspectRatio="xMidYMid meet">
      <SvgDefs />
      <BoardFrame />
      {seas.map((sea) => (
        <SeaCell key={sea.id} sea={sea} G={G} selected={selected === sea.id} color={colorOf(sea.ownerId)} onSelect={onSelect} />
      ))}
      {islands.map((isl) => (
        <IslandNode key={isl.id} isl={isl} G={G} me={me} selected={selected === isl.id} color={colorOf(isl.ownerId)} onSelect={onSelect} />
      ))}
    </svg>
  );
}

/** Круглое поле с бронзовой рамкой-меандром. */
function BoardFrame() {
  const c = BOARD_CENTER.x;
  return (
    <g>
      <circle cx={c} cy={c} r={BOARD_RADIUS + 16} fill="#caa24f" />
      <circle cx={c} cy={c} r={BOARD_RADIUS + 11} fill="none" stroke="#7a5e26" strokeWidth="2" />
      <circle cx={c} cy={c} r={BOARD_RADIUS + 6} fill="none" stroke="#5e4720" strokeWidth="6" strokeDasharray="11 7" />
      <circle cx={c} cy={c} r={BOARD_RADIUS} fill="url(#boardGlow)" stroke="#3a2c12" strokeWidth="3" />
      <circle cx={c} cy={c} r={BOARD_RADIUS} fill="none" filter="url(#waterTex)" opacity="0.4" />
    </g>
  );
}

function Badge({ x, y, text }: { x: number; y: number; text: string | number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <circle r="10" fill="#15212f" stroke="#dfe7f0" strokeWidth="1.2" />
      <text className="badge-txt" y="3.6">{text}</text>
    </g>
  );
}

function SeaCell({ sea, G, selected, color, onSelect }: {
  sea: Sea; G: CycladesState; selected: boolean; color: string; onSelect: (id: TerritoryId) => void;
}) {
  const { x, y } = sea.pos;
  return (
    <g style={{ cursor: 'pointer' }} onClick={() => onSelect(sea.id)}>
      <circle cx={x} cy={y} r={SEA_R} fill="#13507a" fillOpacity="0.5"
        stroke={selected ? '#ffd76a' : sea.fleets > 0 ? color : '#2f6f9e'}
        strokeWidth={selected ? 4 : 1.4} strokeOpacity={selected ? 1 : 0.55} />
      {sea.cornucopia > 0 && (
        <g transform={`translate(${x} ${y})`}>
          <circle r={SEA_R - 5} fill="none" stroke="#e8c451" strokeWidth="2" strokeDasharray="5 4" opacity="0.85" />
          <CoinStack count={sea.cornucopia} />
        </g>
      )}
      {sea.fleets > 0 && (
        <g transform={`translate(${x} ${y - 2})`}>
          <motion.g initial={{ scale: 0.7, opacity: 0 }} animate={{ scale: 1.5, opacity: 1 }}>
            <Trireme color={G.players[sea.ownerId!].color} />
            {sea.fleets > 1 && <Badge x={15} y={-9} text={sea.fleets} />}
          </motion.g>
        </g>
      )}
    </g>
  );
}

function IslandNode({ isl, G, me, selected, color, onSelect }: {
  isl: Island; G: CycladesState; me: string | null; selected: boolean; color: string; onSelect: (id: TerritoryId) => void;
}) {
  const pts = isl.cells.map((c) => c.pos);
  const { x, y } = isl.pos;
  const owned = isl.ownerId != null;

  return (
    <motion.g initial={{ opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }}
      style={{ cursor: 'pointer' }} onClick={() => onSelect(isl.id)}>
      {(selected || owned) && (
        <g filter="url(#goo)">
          {pts.map((p, i) => (
            <circle key={i} cx={p.x} cy={p.y} r={LAND_R + 5} fill={selected ? '#ffd76a' : color} opacity={selected ? 0.9 : 0.8} />
          ))}
        </g>
      )}
      <g filter="url(#goo)">
        {pts.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={LAND_R} fill="url(#sandGrad)" />)}
      </g>
      <g filter="url(#goo)" opacity="0.5">
        {pts.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={LAND_R} fill="none" stroke="#8a6a30" strokeWidth="3" />)}
      </g>

      <text className="t-name dark" x={x} y={y - LAND_R - 4}>{isl.name}</text>

      {isl.hasMetropolis ? (
        <g transform={`translate(${x} ${y})`}><Metropolis /></g>
      ) : (
        isl.buildings.map((b, i) => {
          const n = isl.buildings.length;
          const bx = x + (i - (n - 1) / 2) * 24;
          return <g key={i} transform={`translate(${bx} ${y - 2}) scale(1.3)`}><BuildingGlyph type={b.type} /></g>;
        })
      )}

      {/* рога изобилия на суше — у края клетки */}
      {isl.cornucopiaSpots.map((s, i) => {
        const dx = s.pos.x - x, dy = s.pos.y - y;
        const len = Math.hypot(dx, dy) || 1;
        const ox = s.pos.x + (dx / len) * (LAND_R * 0.4);
        const oy = s.pos.y + (dy / len) * (LAND_R * 0.4) + (len < 1 ? LAND_R * 0.4 : 0);
        return <g key={i} transform={`translate(${ox} ${oy})`}><CoinStack count={s.count} /></g>;
      })}

      {isl.troops > 0 && (
        <g transform={`translate(${x} ${y + LAND_R - 4})`}>
          <motion.g initial={{ scale: 0.7 }} animate={{ scale: 1.6 }}>
            <Hoplite color={G.players[isl.ownerId!].color} />
            {isl.troops > 1 && <Badge x={12} y={-10} text={isl.troops} />}
          </motion.g>
        </g>
      )}
    </motion.g>
  );
}
