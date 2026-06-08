// Переиспользуемые SVG-определения: градиенты и фильтры-текстуры.
// Подключаются один раз внутри <svg> карты.
export function SvgDefs() {
  return (
    <defs>
      <linearGradient id="seaGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#1a5a86" />
        <stop offset="55%" stopColor="#114c74" />
        <stop offset="100%" stopColor="#0a3457" />
      </linearGradient>

      <radialGradient id="sandGrad" cx="40%" cy="35%" r="75%">
        <stop offset="0%" stopColor="#efdca6" />
        <stop offset="60%" stopColor="#d9c081" />
        <stop offset="100%" stopColor="#b9994f" />
      </radialGradient>

      <radialGradient id="marbleGrad" cx="40%" cy="30%" r="80%">
        <stop offset="0%" stopColor="#fbfbf6" />
        <stop offset="100%" stopColor="#cdd2cf" />
      </radialGradient>

      {/* Лёгкая рябь на воде. */}
      <filter id="waterTex" x="-20%" y="-20%" width="140%" height="140%">
        <feTurbulence type="fractalNoise" baseFrequency="0.012 0.03" numOctaves="2" seed="7" result="noise" />
        <feColorMatrix in="noise" type="matrix"
          values="0 0 0 0 0.22  0 0 0 0 0.52  0 0 0 0 0.7  0 0 0 0.42 0" result="tint" />
        <feComposite in="tint" in2="SourceGraphic" operator="over" />
      </filter>

      {/* Зернистость суши. */}
      <filter id="landTex" x="-20%" y="-20%" width="140%" height="140%">
        <feTurbulence type="fractalNoise" baseFrequency="0.08" numOctaves="3" seed="11" result="n" />
        <feColorMatrix in="n" type="matrix"
          values="0 0 0 0 0.45  0 0 0 0 0.36  0 0 0 0 0.18  0 0 0 0.16 0" result="grain" />
        <feComposite in="grain" in2="SourceGraphic" operator="atop" />
      </filter>

      <filter id="softShadow" x="-40%" y="-40%" width="180%" height="180%">
        <feDropShadow dx="0" dy="3" stdDeviation="3" floodColor="#04121f" floodOpacity="0.55" />
      </filter>

      <filter id="pieceShadow" x="-60%" y="-60%" width="220%" height="220%">
        <feDropShadow dx="0" dy="1.5" stdDeviation="1.2" floodColor="#04121f" floodOpacity="0.6" />
      </filter>

      {/* «Goo»: сливает группу кружков в единый органический массив суши. */}
      <filter id="goo" x="-30%" y="-30%" width="160%" height="160%">
        <feGaussianBlur in="SourceGraphic" stdDeviation="9" result="blur" />
        <feColorMatrix in="blur" type="matrix"
          values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 22 -10" result="goo" />
        <feComposite in="SourceGraphic" in2="goo" operator="atop" />
      </filter>

      <radialGradient id="boardGlow" cx="50%" cy="46%" r="60%">
        <stop offset="0%" stopColor="#3f9fd4" />
        <stop offset="70%" stopColor="#2a78ad" />
        <stop offset="100%" stopColor="#1d5582" />
      </radialGradient>

      {/* Неровная береговая линия: шум + смещение краёв острова. */}
      <filter id="coast" x="-35%" y="-35%" width="170%" height="170%">
        <feTurbulence type="fractalNoise" baseFrequency="0.045 0.05" numOctaves="2" seed="5" result="n" />
        <feDisplacementMap in="SourceGraphic" in2="n" scale="20" xChannelSelector="R" yChannelSelector="G" />
      </filter>

      {/* Зелень острова (трава → склон). */}
      <radialGradient id="grassGrad" cx="42%" cy="36%" r="75%">
        <stop offset="0%" stopColor="#86a85a" />
        <stop offset="55%" stopColor="#5f8540" />
        <stop offset="100%" stopColor="#456330" />
      </radialGradient>
      {/* Песчаный берег. */}
      <radialGradient id="beachGrad" cx="45%" cy="40%" r="75%">
        <stop offset="0%" stopColor="#ecd9a8" />
        <stop offset="100%" stopColor="#d8bd84" />
      </radialGradient>
    </defs>
  );
}
