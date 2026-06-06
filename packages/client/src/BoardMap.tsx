import {
  type CycladesState,
  type BuildingType,
  type TerritoryId,
  isIsland,
  isSea,
} from '@cyclades/engine';

const BUILDING_ICON: Record<BuildingType, string> = {
  port: '⚓', fortress: '🛡️', temple: '⛩️', university: '🎓',
};

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

  // Рёбра рисуем один раз: связь моря с соседними морями и островами.
  const edges: { x1: number; y1: number; x2: number; y2: number; kind: string }[] = [];
  for (const sea of seas) {
    for (const sid of sea.adjacentSeas) {
      const other = G.territories[sid];
      if (other && sea.id < sid) edges.push({ x1: sea.pos.x, y1: sea.pos.y, x2: other.pos.x, y2: other.pos.y, kind: 'sea' });
    }
    for (const iid of sea.adjacentIslands) {
      const isl = G.territories[iid];
      if (isl) edges.push({ x1: sea.pos.x, y1: sea.pos.y, x2: isl.pos.x, y2: isl.pos.y, kind: 'link' });
    }
  }

  const colorOf = (pid: string | null) => (pid ? G.players[pid].color : '#5b6b7d');

  return (
    <svg className="map" viewBox="0 0 1000 720" preserveAspectRatio="xMidYMid meet">
      <rect x="0" y="0" width="1000" height="720" fill="#0c2238" rx="12" />
      {edges.map((e, i) => (
        <line
          key={i}
          x1={e.x1} y1={e.y1} x2={e.x2} y2={e.y2}
          stroke={e.kind === 'sea' ? '#234f74' : '#1c3a52'}
          strokeWidth={e.kind === 'sea' ? 6 : 3}
          strokeLinecap="round"
        />
      ))}

      {seas.map((sea) => {
        const sel = selected === sea.id;
        return (
          <g key={sea.id} className="node" onClick={() => onSelect(sea.id)} style={{ cursor: 'pointer' }}>
            <ellipse
              cx={sea.pos.x} cy={sea.pos.y} rx={46} ry={32}
              fill="#1f4e79"
              stroke={sel ? '#ffd76a' : colorOf(sea.ownerId)}
              strokeWidth={sel ? 5 : 2}
            />
            <text x={sea.pos.x} y={sea.pos.y - 8} className="t-name">{sea.name}</text>
            {sea.fleets > 0 && (
              <text x={sea.pos.x} y={sea.pos.y + 14} className="t-units">⛵ {sea.fleets}</text>
            )}
          </g>
        );
      })}

      {islands.map((isl) => {
        const sel = selected === isl.id;
        const owned = isl.ownerId === me;
        return (
          <g key={isl.id} className="node" onClick={() => onSelect(isl.id)} style={{ cursor: 'pointer' }}>
            <circle
              cx={isl.pos.x} cy={isl.pos.y} r={50}
              fill={owned ? '#d8c184' : '#c9b27a'}
              stroke={sel ? '#ffd76a' : colorOf(isl.ownerId)}
              strokeWidth={sel ? 6 : 4}
            />
            <text x={isl.pos.x} y={isl.pos.y - 30} className="t-name dark">{isl.name}</text>
            <text x={isl.pos.x} y={isl.pos.y - 14} className="t-pros">🌾{isl.prosperity}</text>
            {isl.troops > 0 && (
              <text x={isl.pos.x} y={isl.pos.y + 4} className="t-units dark">⚔️ {isl.troops}</text>
            )}
            <text x={isl.pos.x} y={isl.pos.y + 24} className="t-build">
              {isl.hasMetropolis ? '🏛️' : ''}
              {isl.buildings.map((b) => BUILDING_ICON[b.type]).join('')}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
