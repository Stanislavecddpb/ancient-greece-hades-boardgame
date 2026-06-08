import { useState, type ReactElement } from 'react';
import type { BuildingType } from '@cyclades/engine';

// Иллюстрированные фишки. Каждая нарисована вокруг центра (0,0) и ставится
// через transform на карте. Внутренность при желании можно заменить на
// <image href> — внешний контракт (props color/size) останется тем же.

/** Иконка-картинка из /icons (центр 0,0) с откатом к рисованному значку. */
function SvgIcon({ href, size, fallback }: { href: string; size: number; fallback: ReactElement }) {
  const [err, setErr] = useState(false);
  if (err) return fallback;
  const h = size / 2;
  return (
    <image href={href} x={-h} y={-h} width={size} height={size}
      preserveAspectRatio="xMidYMid meet" onError={() => setErr(true)} style={{ filter: 'url(#pieceShadow)' }} />
  );
}

function darken(hex: string, amount = 0.7): string {
  const m = hex.replace('#', '');
  const n = parseInt(m.length === 3 ? m.split('').map((c) => c + c).join('') : m, 16);
  const r = Math.round(((n >> 16) & 255) * amount);
  const g = Math.round(((n >> 8) & 255) * amount);
  const b = Math.round((n & 255) * amount);
  return `rgb(${r},${g},${b})`;
}

const RIM = '#f4f1e6'; // светлый кант для читаемости (особенно для чёрного)

/** Трирема (флот) в цвете игрока; variant 0..3 — разный парус. Центр (0,0). */
export function Trireme({ color, variant = 0 }: { color: string; variant?: number }) {
  const dark = darken(color, 0.55);
  const hull = '#5a3c1e';
  const sail = () => {
    switch (variant % 4) {
      case 0: return <path d="M1 -15 L12 -4 L1 -4 Z" fill={color} stroke={RIM} strokeWidth="0.9" />; // треугольный
      case 1: return <rect x="-8" y="-15" width="16" height="11" rx="1.5" fill={color} stroke={RIM} strokeWidth="0.9" />; // квадратный
      case 2: return <path d="M1 -18 L10 -4 L1 -4 Z" fill={color} stroke={RIM} strokeWidth="0.9" />; // высокий
      default: return <> {/* два паруса */}
        <path d="M1 -15 L10 -6 L1 -6 Z" fill={color} stroke={RIM} strokeWidth="0.8" />
        <path d="M-1 -11 L-9 -4 L-1 -4 Z" fill={color} stroke={RIM} strokeWidth="0.8" /></>;
    }
  };
  return (
    <g filter="url(#pieceShadow)">
      {/* мачта */}
      <line x1="0" y1="-16" x2="0" y2="-3" stroke="#6b4a25" strokeWidth="1.6" />
      {sail()}
      {/* корпус */}
      <path d="M-16 -3 L16 -3 L12 7 Q0 10 -12 7 Z" fill={hull} stroke={RIM} strokeWidth="1.1" />
      {/* борт в цвете игрока */}
      <path d="M-16 -3 L16 -3 L14 1 L-14 1 Z" fill={color} />
      {/* вёсла */}
      <path d="M-11 3 l-3 4 M-6 4 l-2.5 4 M6 4 l2.5 4 M11 3 l3 4" stroke={hull} strokeWidth="1.2" strokeLinecap="round" />
      {/* нос-таран */}
      <path d="M16 -3 l5 2.5 l-5 2.5 Z" fill="#caa24f" stroke={RIM} strokeWidth="0.6" />
    </g>
  );
}

/** Воин (сухопутный отряд) — фигурка человека в цвете игрока; variant 0..3 — оружие. Центр (0,0). */
export function Hoplite({ color, variant = 0 }: { color: string; variant?: number }) {
  const dark = darken(color, 0.5);
  const skin = '#eccba0';
  const steel = '#d4dbe2';
  const wood = '#7a5a2e';
  // Оружие в правой руке — разное у разных игроков.
  const weapon = () => {
    switch (variant % 4) {
      case 0: return <line x1="6.5" y1="-15" x2="6.5" y2="12" stroke={wood} strokeWidth="1.8" strokeLinecap="round" />; // копьё
      case 1: return <><line x1="6" y1="-2" x2="13" y2="-11" stroke={steel} strokeWidth="2.2" strokeLinecap="round" /><line x1="4.5" y1="-4" x2="8" y2="0.5" stroke={wood} strokeWidth="1.8" /></>; // меч
      case 2: return <><line x1="6.5" y1="-15" x2="6.5" y2="12" stroke={wood} strokeWidth="1.6" strokeLinecap="round" /><line x1="6.5" y1="-15" x2="3" y2="-12" stroke={steel} strokeWidth="1.4" /></>; // копьё с наконечником
      default: return <><line x1="8" y1="-14" x2="8" y2="10" stroke={wood} strokeWidth="1.8" strokeLinecap="round" /><path d="M8 -14 q7 1.5 4.5 7.5 q-2.5 -3.5 -4.5 -2.5 Z" fill={steel} stroke={RIM} strokeWidth="0.5" /></>; // топор
    }
  };
  return (
    <g filter="url(#pieceShadow)">
      {weapon()}
      {/* ноги */}
      <path d="M-2 7 L-3.2 13.5" stroke={dark} strokeWidth="3" strokeLinecap="round" />
      <path d="M2 7 L3.2 13.5" stroke={dark} strokeWidth="3" strokeLinecap="round" />
      {/* туловище — узкая туника в рост */}
      <path d="M-4 -4 L4 -4 L3.2 7.5 L-3.2 7.5 Z" fill={color} stroke={RIM} strokeWidth="1.1" />
      {/* плечи/плащ */}
      <path d="M-5.2 -3.5 Q0 -6.2 5.2 -3.5 L4 -1.5 Q0 -3.6 -4 -1.5 Z" fill={dark} stroke={RIM} strokeWidth="0.6" />
      {/* круглый щит сбоку (слева), не закрывает корпус */}
      <ellipse cx="-5.4" cy="1.5" rx="3" ry="4" fill={dark} stroke={RIM} strokeWidth="1" />
      <ellipse cx="-5.4" cy="1.5" rx="1.1" ry="1.5" fill={color} />
      {/* голова */}
      <circle cx="0" cy="-8.5" r="3.4" fill={skin} stroke={RIM} strokeWidth="0.9" />
      {/* шлем-купол */}
      <path d="M-3.5 -8.4 A3.5 3.5 0 0 1 3.5 -8.4 L3 -7.6 L-3 -7.6 Z" fill={color} stroke={RIM} strokeWidth="0.7" />
      {/* гребень шлема */}
      <path d="M0 -13 Q4.2 -12.4 2.6 -8.4" stroke={dark} strokeWidth="2" fill="none" strokeLinecap="round" />
    </g>
  );
}

/** Жетон контроля острова (без войск): щит-эмблема в цвете игрока. */
export function ControlToken({ color }: { color: string }) {
  const dark = darken(color, 0.6);
  return (
    <g filter="url(#pieceShadow)">
      <path d="M0 -8 L7 -5 V2 C7 6 0 9 0 9 C0 9 -7 6 -7 2 V-5 Z" fill={color} stroke={RIM} strokeWidth="1.2" />
      <path d="M0 -4 L-3 3 M0 -4 L3 3" stroke={RIM} strokeWidth="1.2" fill="none" opacity="0.9" />
      <circle cx="0" cy="-1" r="1.4" fill={dark} />
    </g>
  );
}

/** Здание заданного типа: иконка из /icons/<type>.png с откатом к рисованному. */
export function BuildingGlyph({ type }: { type: BuildingType }) {
  return <SvgIcon href={`/icons/${type}.png`} size={22} fallback={buildingFallback(type)} />;
}

function buildingFallback(type: BuildingType): ReactElement {
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

/** Метрополия: иконка из /icons/metropolis.png с откатом к рисованному храму. */
export function Metropolis() {
  return <SvgIcon href="/icons/metropolis.png" size={34} fallback={metropolisFallback()} />;
}

function metropolisFallback(): ReactElement {
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

/** Рог изобилия: иконка из /icons/cournocopia.png с откатом к стопке монет. */
export function CoinStack({ count = 1 }: { count?: number }) {
  const size = count >= 2 ? 24 : 19;
  return <SvgIcon href="/icons/cournocopia.png" size={size} fallback={coinStackFallback(count)} />;
}

function coinStackFallback(count: number): ReactElement {
  const coins = count >= 2 ? 5 : 3;
  return (
    <g filter="url(#pieceShadow)">
      {Array.from({ length: coins }, (_, i) => (
        <ellipse key={i} cx="0" cy={4 - i * 3} rx="6.5" ry="2.6"
          fill="#f0c542" stroke="#9c7416" strokeWidth="0.8" />
      ))}
    </g>
  );
}

const GOD_GLYPH: Record<string, string> = {
  ares: '⚔', poseidon: '🔱', zeus: '⚡', athena: '🦉', apollo: '☀',
};
export function godGlyph(g: string): string {
  return GOD_GLYPH[g] ?? '★';
}
