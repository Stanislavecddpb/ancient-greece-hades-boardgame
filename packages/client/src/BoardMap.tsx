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
const LAND_R = CELL_D * 0.5;

// Игровые фишки (войска/флот/здания) показываем во время игры.
const SHOW_PIECES = true;

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
      <circle cx={x} cy={y} r={SEA_R} fill="#13507a" fillOpacity="0.45"
        stroke={selected ? '#ffd76a' : '#2f6f9e'}
        strokeWidth={selected ? 4 : 1.4} strokeOpacity={selected ? 1 : 0.5} />
      {sea.cornucopia > 0 && (
        <g transform={`translate(${x} ${y})`}>
          <CoinStack count={sea.cornucopia} />
        </g>
      )}
      {SHOW_PIECES && sea.fleets > 0 && (
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
  void me;
  const pts = isl.cells.map((c) => c.pos);
  const owned = isl.ownerId != null;

  return (
    <motion.g initial={{ opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }}
      style={{ cursor: 'pointer' }} onClick={() => onSelect(isl.id)}>
      {(selected || owned) && (
        <g filter="url(#goo)">
          {pts.map((p, i) => (
            <circle key={i} cx={p.x} cy={p.y} r={LAND_R + 4} fill={selected ? '#ffd76a' : color} opacity={selected ? 0.85 : 0.7} />
          ))}
        </g>
      )}

      {/* Массив суши с неровной береговой линией и рельефом. */}
      <g filter="url(#coast)">
        <g filter="url(#goo)">
          {pts.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={LAND_R} fill="url(#beachGrad)" />)}
        </g>
        <g filter="url(#goo)">
          {pts.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={LAND_R - 7} fill="url(#grassGrad)" />)}
        </g>
        {/* горный рельеф */}
        {pts.map((p, i) => (
          <ellipse key={`m${i}`} cx={p.x - 5} cy={p.y - 6} rx={LAND_R * 0.34} ry={LAND_R * 0.26}
            fill="#6f5d39" opacity="0.75" />
        ))}
      </g>

      {/* рога изобилия на суше — снизу слева клетки */}
      {isl.cornucopiaSpots.map((s, i) => (
        <g key={i} transform={`translate(${s.pos.x - LAND_R * 0.5} ${s.pos.y + LAND_R * 0.45})`}>
          <CoinStack count={s.count} />
        </g>
      ))}

      {SHOW_PIECES && (isl.hasMetropolis ? (
        <g transform={`translate(${isl.pos.x} ${isl.pos.y})`}><Metropolis /></g>
      ) : (
        isl.buildings.map((b, i) => {
          const n = isl.buildings.length;
          const bx = isl.pos.x + (i - (n - 1) / 2) * 24;
          return <g key={i} transform={`translate(${bx} ${isl.pos.y - 2}) scale(1.3)`}><BuildingGlyph type={b.type} /></g>;
        })
      ))}

      {SHOW_PIECES && isl.troops > 0 && (
        <g transform={`translate(${isl.pos.x} ${isl.pos.y + LAND_R - 4})`}>
          <motion.g initial={{ scale: 0.7 }} animate={{ scale: 1.6 }}>
            <Hoplite color={G.players[isl.ownerId!].color} />
            {isl.troops > 1 && <Badge x={12} y={-10} text={isl.troops} />}
          </motion.g>
        </g>
      )}
    </motion.g>
  );
}
