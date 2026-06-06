import { motion } from 'framer-motion';
import {
  type CycladesState,
  type TerritoryId,
  type Island,
  type Sea,
  isIsland,
  isSea,
  axialToPixel,
  HEX_SIZE,
  BOARD_CENTER,
  BOARD_VIEWBOX,
} from '@cyclades/engine';
import { SvgDefs } from './art/SvgDefs';
import { Trireme, Hoplite, BuildingGlyph, Metropolis } from './art/pieces';

interface Props {
  G: CycladesState;
  me: string | null;
  selected: TerritoryId | null;
  onSelect: (id: TerritoryId) => void;
}

const SEA_R = HEX_SIZE * 0.82;
const LAND_R = HEX_SIZE * 0.84;
const BOARD_R = BOARD_VIEWBOX / 2 - 18;

export function BoardMap({ G, me, selected, onSelect }: Props) {
  const territories = Object.values(G.territories);
  const islands = territories.filter(isIsland);
  const seas = territories.filter(isSea);
  const colorOf = (pid: string | null) => (pid ? G.players[pid].color : '#7c8aa0');

  return (
    <svg className="map" viewBox={`0 0 ${BOARD_VIEWBOX} ${BOARD_VIEWBOX}`} preserveAspectRatio="xMidYMid meet">
      <SvgDefs />
      <BoardFrame />

      {/* морские клетки */}
      {seas.map((sea) => (
        <SeaCell key={sea.id} sea={sea} G={G} selected={selected === sea.id} color={colorOf(sea.ownerId)} onSelect={onSelect} />
      ))}

      {/* острова поверх */}
      {islands.map((isl) => (
        <IslandNode key={isl.id} isl={isl} G={G} me={me} selected={selected === isl.id} color={colorOf(isl.ownerId)} onSelect={onSelect} />
      ))}
    </svg>
  );
}

/** Круглое поле с бронзовой рамкой-меандром и стрелками по сторонам. */
function BoardFrame() {
  const c = BOARD_CENTER.x;
  const meander = 2 * Math.PI * BOARD_R;
  const arrows = [0, 90, 180, 270];
  return (
    <g>
      <circle cx={c} cy={c} r={BOARD_R + 14} fill="#caa24f" />
      <circle cx={c} cy={c} r={BOARD_R + 10} fill="none" stroke="#7a5e26" strokeWidth="2" />
      {/* меандр — пунктир по кольцу */}
      <circle cx={c} cy={c} r={BOARD_R + 5} fill="none" stroke="#5e4720" strokeWidth="6"
        strokeDasharray="10 6" />
      <circle cx={c} cy={c} r={BOARD_R} fill="url(#boardGlow)" stroke="#3a2c12" strokeWidth="3" />
      <circle cx={c} cy={c} r={BOARD_R} fill="none" filter="url(#waterTex)" opacity="0.4" />
      {arrows.map((deg) => {
        const rad = (deg * Math.PI) / 180;
        const ax = c + Math.cos(rad) * (BOARD_R + 7);
        const ay = c + Math.sin(rad) * (BOARD_R + 7);
        return (
          <g key={deg} transform={`translate(${ax} ${ay}) rotate(${deg + 90})`}>
            <path d="M0 -9 L8 7 L-8 7 Z" fill="#f0e2b8" stroke="#7a5e26" strokeWidth="1" />
          </g>
        );
      })}
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
      <circle cx={x} cy={y} r={SEA_R} fill="#13507a" fillOpacity="0.55"
        stroke={selected ? '#ffd76a' : sea.fleets > 0 ? color : '#2f6f9e'}
        strokeWidth={selected ? 4 : 1.5} strokeOpacity={selected ? 1 : 0.6} />
      {sea.fleets > 0 && (
        <g transform={`translate(${x} ${y})`}>
          <motion.g initial={{ scale: 0.7, opacity: 0 }} animate={{ scale: 1.8, opacity: 1 }}>
            <Trireme color={G.players[sea.ownerId!].color} />
            {sea.fleets > 1 && <Badge x={16} y={-9} text={sea.fleets} />}
          </motion.g>
        </g>
      )}
    </g>
  );
}

function IslandNode({ isl, G, me, selected, color, onSelect }: {
  isl: Island; G: CycladesState; me: string | null; selected: boolean; color: string; onSelect: (id: TerritoryId) => void;
}) {
  const pts = isl.cells.map(axialToPixel);
  const { x, y } = isl.pos;
  const owned = isl.ownerId != null;

  return (
    <motion.g initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
      style={{ cursor: 'pointer' }} onClick={() => onSelect(isl.id)}>
      {/* выделение / ободок владельца — слитый ореол */}
      {(selected || owned) && (
        <g filter="url(#goo)">
          {pts.map((p, i) => (
            <circle key={i} cx={p.x} cy={p.y} r={LAND_R + 6}
              fill={selected ? '#ffd76a' : color} opacity={selected ? 0.9 : 0.8} />
          ))}
        </g>
      )}
      {/* суша */}
      <g filter="url(#goo)">
        {pts.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={LAND_R} fill="url(#sandGrad)" />
        ))}
      </g>
      <g filter="url(#goo)" opacity="0.5">
        {pts.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={LAND_R} fill="none" stroke="#8a6a30" strokeWidth="3" />
        ))}
      </g>

      <text className="t-name dark" x={x} y={y - LAND_R - 6}>{isl.name}</text>
      <text className="t-pros" x={x} y={y - LAND_R + 10}>🌾{isl.prosperity}</text>

      {isl.hasMetropolis ? (
        <g transform={`translate(${x} ${y})`}><Metropolis /></g>
      ) : (
        isl.buildings.map((b, i) => {
          const n = isl.buildings.length;
          const bx = x + (i - (n - 1) / 2) * 26;
          return <g key={i} transform={`translate(${bx} ${y - 4}) scale(1.35)`}><BuildingGlyph type={b.type} /></g>;
        })
      )}

      {isl.troops > 0 && (
        <g transform={`translate(${x} ${y + LAND_R - 6})`}>
          <motion.g initial={{ scale: 0.7 }} animate={{ scale: 1.7 }}>
            <Hoplite color={G.players[isl.ownerId!].color} />
            {isl.troops > 1 && <Badge x={12} y={-10} text={isl.troops} />}
          </motion.g>
        </g>
      )}
    </motion.g>
  );
}
