import type { BuildingType } from '@cyclades/engine';

// Иллюстрированные фишки. Каждая нарисована вокруг центра (0,0) и ставится
// через transform на карте. Внутренность при желании можно заменить на
// <image href> — внешний контракт (props color/size) останется тем же.

function darken(hex: string, amount = 0.7): string {
  const m = hex.replace('#', '');
  const n = parseInt(m.length === 3 ? m.split('').map((c) => c + c).join('') : m, 16);
  const r = Math.round(((n >> 16) & 255) * amount);
  const g = Math.round(((n >> 8) & 255) * amount);
  const b = Math.round((n & 255) * amount);
  return `rgb(${r},${g},${b})`;
}

/** Трирема (флот) в цвете игрока. */
export function Trireme({ color }: { color: string }) {
  const dark = darken(color, 0.6);
  return (
    <g filter="url(#pieceShadow)">
      {/* парус */}
      <path d="M0 -12 L9 -3 L0 -3 Z" fill={color} stroke={dark} strokeWidth="0.8" />
      <line x1="0" y1="-13" x2="0" y2="-2" stroke={dark} strokeWidth="1.4" />
      {/* корпус */}
      <path d="M-13 -1 C-9 6 9 6 13 -1 L9 3 C4 6 -4 6 -9 3 Z" fill={dark} stroke="#1b2b3a" strokeWidth="0.8" />
      {/* вёсла */}
      <path d="M-9 1 l-3 3 M-4 2 l-2 3 M4 2 l2 3 M9 1 l3 3" stroke="#1b2b3a" strokeWidth="0.7" />
    </g>
  );
}

/** Воин (сухопутный отряд): гоплитский щит с копьём. */
export function Hoplite({ color }: { color: string }) {
  const dark = darken(color, 0.55);
  return (
    <g filter="url(#pieceShadow)">
      <line x1="-7" y1="-9" x2="7" y2="9" stroke="#5a4326" strokeWidth="1.6" />
      <circle cx="0" cy="0" r="8" fill={color} stroke={dark} strokeWidth="1.4" />
      <path d="M0 -5 L-3.6 4 M0 -5 L3.6 4" stroke="#fff" strokeWidth="1.5" fill="none" opacity="0.92" />
    </g>
  );
}

/** Здание заданного типа (мрамор с цветовым акцентом). */
export function BuildingGlyph({ type }: { type: BuildingType }) {
  switch (type) {
    case 'temple':
      return (
        <g filter="url(#pieceShadow)">
          <path d="M-9 -4 L0 -10 L9 -4 Z" fill="#e9e4d3" stroke="#9a9079" strokeWidth="0.7" />
          <rect x="-9" y="6" width="18" height="2.5" fill="#d8d2c0" />
          <g fill="#f3efe2" stroke="#b3ab93" strokeWidth="0.5">
            <rect x="-8" y="-4" width="3" height="10" /><rect x="-1.5" y="-4" width="3" height="10" /><rect x="5" y="-4" width="3" height="10" />
          </g>
        </g>
      );
    case 'fortress':
      return (
        <g filter="url(#pieceShadow)">
          <rect x="-8" y="-6" width="16" height="14" fill="#8a8f96" stroke="#54585d" strokeWidth="0.8" />
          <path d="M-8 -6 v-3 h3 v3 M-2 -6 v-3 h3 v3 M5 -6 v-3 h3 v3" fill="#8a8f96" stroke="#54585d" strokeWidth="0.8" />
          <rect x="-2.5" y="1" width="5" height="7" fill="#3c4045" />
        </g>
      );
    case 'port':
      return (
        <g filter="url(#pieceShadow)" stroke="#3a5a72" strokeWidth="1.6" fill="none">
          <circle cx="0" cy="-6" r="2.4" />
          <line x1="0" y1="-3.6" x2="0" y2="8" />
          <path d="M-7 3 A7 7 0 0 0 7 3" />
          <line x1="-4" y1="-1" x2="4" y2="-1" />
        </g>
      );
    case 'university':
      return (
        <g filter="url(#pieceShadow)">
          <path d="M-8 -6 h13 a3 3 0 0 1 3 3 v11 h-13 a3 3 0 0 1 -3 -3 Z" fill="#e7dcc4" stroke="#8a7b59" strokeWidth="0.8" />
          <path d="M-8 -6 a3 3 0 0 0 -3 3 v11 a3 3 0 0 1 3 -3 Z" fill="#cdbf9d" stroke="#8a7b59" strokeWidth="0.8" />
          <line x1="-4" y1="-2" x2="6" y2="-2" stroke="#8a7b59" strokeWidth="0.7" />
          <line x1="-4" y1="2" x2="6" y2="2" stroke="#8a7b59" strokeWidth="0.7" />
        </g>
      );
  }
}

/** Метрополия: широкий мраморный храм с золотым фронтоном. */
export function Metropolis() {
  return (
    <g filter="url(#softShadow)">
      <path d="M-15 -7 L0 -16 L15 -7 Z" fill="#d9b24a" stroke="#a8842c" strokeWidth="1" />
      <rect x="-15" y="9" width="30" height="3.5" fill="#c9a64a" />
      <g fill="url(#marbleGrad)" stroke="#a9a18b" strokeWidth="0.6">
        <rect x="-14" y="-7" width="4" height="16" /><rect x="-7.5" y="-7" width="4" height="16" />
        <rect x="-1" y="-7" width="4" height="16" /><rect x="5.5" y="-7" width="4" height="16" />
        <rect x="11" y="-7" width="3.5" height="16" />
      </g>
    </g>
  );
}

/** Рог изобилия — стопка золотых монет (count = сколько стопок). */
export function CoinStack({ count = 1 }: { count?: number }) {
  const oneStack = (dx: number) => (
    <g transform={`translate(${dx} 0)`}>
      {[0, 1, 2].map((i) => (
        <ellipse key={i} cx="0" cy={4 - i * 3.2} rx="6.5" ry="2.6"
          fill="#f0c542" stroke="#9c7416" strokeWidth="0.8" />
      ))}
    </g>
  );
  return (
    <g filter="url(#pieceShadow)">
      {count >= 2 ? (<>{oneStack(-5)}{oneStack(5)}</>) : oneStack(0)}
    </g>
  );
}

const GOD_GLYPH: Record<string, string> = {
  ares: '⚔', poseidon: '🔱', zeus: '⚡', athena: '🦉', apollo: '☀',
};
export function godGlyph(g: string): string {
  return GOD_GLYPH[g] ?? '★';
}
