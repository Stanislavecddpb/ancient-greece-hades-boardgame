import { useState } from 'react';
import type { GodName } from '@cyclades/engine';

interface GodInfo {
  title: string;
  subtitle: string;
  emblem: string;
  building?: string;
  action: string;
  theme: string; // основной цвет темы
}

export const GOD_INFO: Record<GodName, GodInfo> = {
  ares: { title: 'Арес', subtitle: 'Бог войны', emblem: '⚔', building: '🛡️ Крепость', action: 'Набор войск и движение армий', theme: '#b23a3a' },
  poseidon: { title: 'Посейдон', subtitle: 'Владыка морей', emblem: '🔱', building: '⚓ Порт', action: 'Набор флота и морские походы', theme: '#1d7a8c' },
  zeus: { title: 'Зевс', subtitle: 'Громовержец', emblem: '⚡', building: '⛩️ Храм', action: 'Жрецы и мифические существа', theme: '#7a5cb0' },
  athena: { title: 'Афина', subtitle: 'Богиня мудрости', emblem: '🦉', building: '🎓 Университет', action: 'Философы: 4 дают Метрополию', theme: '#6f8a3a' },
  apollo: { title: 'Аполлон', subtitle: 'Бог света', emblem: '☀', action: 'Доход без борьбы — бесплатно', theme: '#c79a2e' },
};

interface Props {
  god: GodName;
  occupantName?: string;
  occupantColor?: string;
  bid: number;
  minBid: number;
  canBid: boolean;
  isApollo?: boolean;
  apolloNames?: string[];
  onBid?: (amount: number) => void;
  onApollo?: () => void;
}

export function GodCard({
  god, occupantName, occupantColor, bid, minBid, canBid, isApollo, apolloNames, onBid, onApollo,
}: Props) {
  const info = GOD_INFO[god];
  const [val, setVal] = useState(minBid);

  return (
    <div className="card" style={{ ['--theme' as any]: info.theme }}>
      <div className="card-head">
        <div className="card-title">{info.title}</div>
        <div className="card-sub">{info.subtitle}</div>
      </div>
      <div className="card-emblem">{info.emblem}</div>
      <div className="card-action">{info.action}</div>
      {info.building && <div className="card-building">{info.building}</div>}

      <div className="card-foot">
        {isApollo ? (
          <>
            <div className="card-occ">{apolloNames && apolloNames.length ? apolloNames.join(', ') : 'свободно'}</div>
            {canBid && <button className="card-btn" onClick={onApollo}>Под Аполлона</button>}
          </>
        ) : (
          <>
            <div className="card-occ">
              {occupantName ? (
                <span style={{ color: occupantColor }}>● {occupantName}: {bid}🪙</span>
              ) : 'свободно'}
            </div>
            {canBid && (
              <div className="card-bid">
                <input type="number" min={minBid} value={val} onChange={(e) => setVal(Number(e.target.value))} />
                <button className="card-btn" onClick={() => onBid?.(val)}>Ставка</button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
