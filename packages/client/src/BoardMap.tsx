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
import { Trireme, Hoplite, BuildingGlyph, Metropolis, CoinStack, ControlToken } from './art/pieces';

/** Активное перемещение: откуда, куда можно и что делать при клике по цели. */
export interface MovementCtx {
  from: TerritoryId;
  targets: TerritoryId[];
  onMove: (to: TerritoryId) => void;
}

interface Props {
  G: CycladesState;
  me: string | null;
  selected: TerritoryId | null;
  onSelect: (id: TerritoryId) => void;
  movement?: MovementCtx | null;
}

const SEA_R = CELL_D * 0.46;
const LAND_R = CELL_D * 0.5;

const SHOW_PIECES = true;

const seatOf = (pid: string) => Number(pid);

/** Масштаб фигур в зависимости от их числа в клетке (меньше фишек — крупнее). */
const fleetScale = (n: number) => (n <= 1 ? 1.05 : n === 2 ? 0.85 : 0.68);
const troopScale = (n: number) => (n <= 1 ? 1.6 : n === 2 ? 1.35 : 1.15);

/** Смещения для размещения n фишек в клетке. */
function offsets(n: number, kind: 'troop' | 'fleet'): Array<{ x: number; y: number }> {
  if (kind === 'troop') {
    if (n <= 1) return [{ x: 0, y: 0 }];
    if (n === 2) return [{ x: -15, y: 0 }, { x: 15, y: 0 }];
    return [{ x: -20, y: -2 }, { x: 0, y: 4 }, { x: 20, y: -2 }];
  }
  if (n <= 1) return [{ x: 0, y: 0 }];
  if (n === 2) return [{ x: -13, y: 0 }, { x: 13, y: 0 }];
  if (n === 3) return [{ x: -14, y: -8 }, { x: 14, y: -8 }, { x: 0, y: 8 }];
  return [{ x: -13, y: -9 }, { x: 13, y: -9 }, { x: -13, y: 9 }, { x: 13, y: 9 }];
}

export function BoardMap({ G, me, selected, onSelect, movement }: Props) {
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
      {movement && <MovementLayer G={G} movement={movement} />}
    </svg>
  );
}

/** Стрелки от выбранной фишки к доступным клеткам; клик по цели — ход. */
function MovementLayer({ G, movement }: { G: CycladesState; movement: MovementCtx }) {
  const src = G.territories[movement.from];
  if (!src) return null;
  const from = src.pos;
  return (
    <g>
      {movement.targets.map((id) => {
        const t = G.territories[id];
        if (!t) return null;
        return <MoveArrow key={id} from={from} to={t.pos} onMove={() => movement.onMove(id)} />;
      })}
    </g>
  );
}

function MoveArrow({ from, to, onMove }: {
  from: { x: number; y: number }; to: { x: number; y: number }; onMove: () => void;
}) {
  const dx = to.x - from.x, dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len, uy = dy / len;
  const sx = from.x + ux * 28, sy = from.y + uy * 28;
  const ex = to.x - ux * 30, ey = to.y - uy * 30;
  const hl = { x: ex - ux * 13 - uy * 8, y: ey - uy * 13 + ux * 8 };
  const hr = { x: ex - ux * 13 + uy * 8, y: ey - uy * 13 - ux * 8 };
  return (
    <g className="mv-arrow" style={{ cursor: 'pointer' }} onClick={(e) => { e.stopPropagation(); onMove(); }}>
      <circle cx={to.x} cy={to.y} r={SEA_R} className="mv-target" />
      <line x1={sx} y1={sy} x2={ex} y2={ey} className="mv-line" />
      <polygon points={`${ex},${ey} ${hl.x},${hl.y} ${hr.x},${hr.y}`} className="mv-head" />
    </g>
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
      <circle cx={x} cy={y} r={SEA_R} fill="#3f93c8" fillOpacity="0.4"
        stroke={selected ? '#ffd76a' : '#bfe0f2'}
        strokeWidth={selected ? 4 : 1.4} strokeOpacity={selected ? 1 : 0.45} />
      {/* флот: при наличии рога сдвигаем чуть вниз, чтобы монеты были видны сверху */}
      {SHOW_PIECES && sea.fleets > 0 && sea.ownerId && (
        <g>
          {offsets(Math.min(sea.fleets, 4), 'fleet').map((o, i) => (
            <g key={i} transform={`translate(${x + o.x} ${y + o.y + (sea.cornucopia > 0 ? 6 : 0)}) scale(${fleetScale(sea.fleets)})`}>
              <Trireme color={G.players[sea.ownerId!].color} variant={seatOf(sea.ownerId!)} />
            </g>
          ))}
          {sea.fleets > 4 && <Badge x={x + SEA_R - 4} y={y - SEA_R + 4} text={sea.fleets} />}
        </g>
      )}
      {/* рог изобилия — сверху клетки, поверх кораблей; в столбик при count>1 */}
      {sea.cornucopia > 0 && (
        <g transform={`translate(${x} ${y - SEA_R * 0.62})`}>
          {Array.from({ length: sea.cornucopia }, (_, k) => (
            <g key={k} transform={`translate(0 ${k * 18})`}><CoinStack /></g>
          ))}
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

      {/* жетон контроля (если островом владеют) */}
      {SHOW_PIECES && owned && (
        <g transform={`translate(${isl.pos.x} ${isl.pos.y - LAND_R * 0.75}) scale(0.9)`}>
          <ControlToken color={G.players[isl.ownerId!].color} />
        </g>
      )}

      {SHOW_PIECES && (isl.hasMetropolis ? (
        <g transform={`translate(${isl.pos.x} ${isl.pos.y - 2})`}><Metropolis /></g>
      ) : (
        isl.buildings.map((b, i) => {
          const n = isl.buildings.length;
          const bx = isl.pos.x + (i - (n - 1) / 2) * 22;
          return <g key={i} transform={`translate(${bx} ${isl.pos.y - LAND_R * 0.1}) scale(1.15)`}><BuildingGlyph type={b.type} /></g>;
        })
      ))}

      {/* войска (до 3 фигур + счётчик) */}
      {SHOW_PIECES && isl.troops > 0 && isl.ownerId && (
        <g>
          {offsets(Math.min(isl.troops, 3), 'troop').map((o, i) => (
            <g key={i} transform={`translate(${isl.pos.x + o.x} ${isl.pos.y + LAND_R * 0.3 + o.y}) scale(${troopScale(isl.troops)})`}>
              <Hoplite color={G.players[isl.ownerId!].color} variant={seatOf(isl.ownerId!)} />
            </g>
          ))}
          {isl.troops > 3 && <Badge x={isl.pos.x + 24} y={isl.pos.y + LAND_R * 0.42 - 14} text={isl.troops} />}
        </g>
      )}

      {/* рога изобилия на суше — по одной иконке на рог, в столбик при count>1 */}
      {isl.cornucopiaSpots.map((s, i) => (
        <g key={i} transform={`translate(${s.pos.x - LAND_R * 0.5} ${s.pos.y - LAND_R * 0.5})`}>
          {Array.from({ length: s.count }, (_, k) => (
            <g key={k} transform={`translate(0 ${k * 18})`}><CoinStack /></g>
          ))}
        </g>
      ))}
    </motion.g>
  );
}
