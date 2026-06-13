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
  CREATURES,
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

// ===== Размеры и расположение фишек на клетке — МЕНЯТЬ ЗДЕСЬ =====
// Размер здания (≈ четверть–половина клетки). CELL_D — размер клетки.
const BUILD_SIZE = CELL_D * 1.0;     // картинка здания, px
const METRO_SIZE = CELL_D * 1.3;     // картинка Метрополии, px
const TROOP_SCALE = 1.5;             // масштаб солдата (войска — снизу справа)
const TROOP_OVERLAP = 12;            // насколько солдаты «заезжают» друг на друга, px
const TROOP_MAX_SHOWN = 5;           // сколько фигур солдат показывать, дальше — счётчик
// Якорь солдат относительно центра острова (низ-право):
const TROOP_AX = LAND_R * 0.5;
const TROOP_AY = LAND_R * 0.5;
// ================================================================

/** Масштаб фигур в зависимости от их числа в клетке (меньше фишек — крупнее). */
const fleetScale = (n: number) => (n <= 1 ? 1.05 : n === 2 ? 0.85 : 0.68);

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
      {/* Фигуры существ на доске (Минотавр/Хирон/Медуза/Полифем/Кракен). */}
      {G.boardCreatures.map((bc, i) => {
        const t = G.territories[bc.location];
        if (!t) return null;
        return <CreatureToken key={i} x={t.pos.x} y={t.pos.y - LAND_R * 0.55}
          color={G.players[bc.ownerId].color} emblem={CREATURES[bc.kind]?.emblem ?? '★'} />;
      })}
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

/** Жетон фигуры существа на доске: диск цвета владельца + эмблема. */
function CreatureToken({ x, y, color, emblem }: { x: number; y: number; color: string; emblem: string }) {
  const r = CELL_D * 0.3;
  return (
    <g transform={`translate(${x} ${y})`} filter="url(#pieceShadow)">
      <circle r={r} fill="#10151c" stroke={color} strokeWidth="3.5" />
      <text textAnchor="middle" y={r * 0.36} fontSize={r * 1.15}>{emblem}</text>
    </g>
  );
}

/** Жетон Нежити (Аид): тёмный диск с черепом, обводкой цвета владельца и счётчиком. */
function UndeadMarker({ x, y, kind, count, color }: {
  x: number; y: number; kind: 'troop' | 'fleet'; count: number; color: string;
}) {
  const r = CELL_D * 0.24;
  return (
    <g transform={`translate(${x} ${y})`} filter="url(#pieceShadow)">
      <circle r={r} fill="#0e0a14" stroke={color} strokeWidth="3" />
      <text textAnchor="middle" y={r * 0.4} fontSize={r * 1.05}>{kind === 'fleet' ? '☠' : '💀'}</text>
      {count > 1 && (
        <g transform={`translate(${r * 0.85} ${-r * 0.85})`}>
          <circle r="8" fill="#2a1438" stroke="#cbb3e6" strokeWidth="1" />
          <text className="badge-txt" y="3.2">{count}</text>
        </g>
      )}
    </g>
  );
}

/** Подвижные маркеры процветания (Аполлон/Гермес; крадутся Фуриями). */
function ProsperityMarkers({ x, y, n }: { x: number; y: number; n: number }) {
  const shown = Math.min(n, 4);
  return (
    <g transform={`translate(${x} ${y})`} filter="url(#pieceShadow)">
      {Array.from({ length: shown }, (_, k) => (
        <g key={k} transform={`translate(${(k - (shown - 1) / 2) * 15} 0)`}>
          <circle r="8.5" fill="#caa24f" stroke="#5e4720" strokeWidth="1.5" />
          <text textAnchor="middle" y="3.2" fontSize="10" fill="#3a2c12" fontWeight="800">✦</text>
        </g>
      ))}
      {n > 4 && <text x={shown * 8} y="3" className="badge-txt">+{n - 4}</text>}
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
      {/* Флотилии Нежити (Аид) — тёмный жетон с черепом и счётчиком. */}
      {SHOW_PIECES && sea.undeadFleets > 0 && sea.ownerId && (
        <UndeadMarker x={x - SEA_R * 0.55} y={y + SEA_R * 0.55} kind="fleet"
          count={sea.undeadFleets} color={G.players[sea.ownerId].color} />
      )}
      {/* Маркеры процветания в зоне (Гермес) — сверху клетки. */}
      {sea.prosperity > 0 && <ProsperityMarkers x={x} y={y - SEA_R * 0.85} n={sea.prosperity} />}
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

      {/* здания — в центре своей клетки; Метрополия — в центре острова (могут сосуществовать) */}
      {SHOW_PIECES && isl.buildings.map((b, i) => {
        const cell = isl.cells[i % isl.cells.length].pos;
        return <g key={i} transform={`translate(${cell.x} ${cell.y})`}><BuildingGlyph type={b.type} size={BUILD_SIZE} /></g>;
      })}
      {SHOW_PIECES && isl.hasMetropolis && (
        <g transform={`translate(${isl.pos.x} ${isl.pos.y})`}><Metropolis size={METRO_SIZE} /></g>
      )}
      {/* Некрополь (Аид): ⚰️ на месте Метрополии + счётчик накопленного золота. */}
      {SHOW_PIECES && isl.necropolis && (
        <g transform={`translate(${isl.pos.x} ${isl.pos.y})`}>
          <g filter="url(#pieceShadow)">
            <circle r={CELL_D * 0.32} fill="#1a1320" stroke="#9a6cd0" strokeWidth="3" />
            <text textAnchor="middle" y={CELL_D * 0.12} fontSize={CELL_D * 0.4}>⚰️</text>
          </g>
          {isl.necropolisGold > 0 && <Badge x={CELL_D * 0.3} y={-CELL_D * 0.3} text={`${isl.necropolisGold}🪙`} />}
        </g>
      )}

      {/* войска — снизу справа, стопкой (нижние спереди), при избытке — счётчик */}
      {SHOW_PIECES && isl.troops > 0 && isl.ownerId && (
        <g>
          {Array.from({ length: Math.min(isl.troops, TROOP_MAX_SHOWN) }, (_, i) => Math.min(isl.troops, TROOP_MAX_SHOWN) - 1 - i).map((i) => (
            <g key={i} transform={`translate(${isl.pos.x + TROOP_AX} ${isl.pos.y + TROOP_AY - i * TROOP_OVERLAP}) scale(${TROOP_SCALE})`}>
              <Hoplite color={G.players[isl.ownerId!].color} variant={seatOf(isl.ownerId!)} />
            </g>
          ))}
          {isl.troops > TROOP_MAX_SHOWN && (
            <Badge x={isl.pos.x + TROOP_AX + 13} y={isl.pos.y + TROOP_AY - TROOP_MAX_SHOWN * TROOP_OVERLAP} text={isl.troops} />
          )}
        </g>
      )}

      {/* Войска Нежити (Аид) — тёмный жетон с черепом слева снизу. */}
      {SHOW_PIECES && isl.undeadTroops > 0 && isl.ownerId && (
        <UndeadMarker x={isl.pos.x - TROOP_AX - 6} y={isl.pos.y + TROOP_AY} kind="troop"
          count={isl.undeadTroops} color={G.players[isl.ownerId].color} />
      )}

      {/* Маркеры процветания (подвижные) — сверху острова. */}
      {isl.prosperity > 0 && <ProsperityMarkers x={isl.pos.x} y={isl.pos.y - LAND_R * 0.95} n={isl.prosperity} />}

      {/* рога изобилия на суше — по одной иконке на рог, в столбик при count>1 */}
      {isl.cornucopiaSpots.map((s, i) => (
        <g key={i} transform={`translate(${s.pos.x - LAND_R * 0.85} ${s.pos.y - LAND_R * 0.5})`}>
          {Array.from({ length: s.count }, (_, k) => (
            <g key={k} transform={`translate(0 ${k * 18})`}><CoinStack /></g>
          ))}
        </g>
      ))}
    </motion.g>
  );
}
