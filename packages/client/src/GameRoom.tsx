import { useEffect, useState, useCallback } from 'react';
import { lobby, GAME_ID, NetClient, loadSeat, saveSeat, savedName, rememberName, type Seat } from './net';

interface MatchPlayer {
  id: number;
  name?: string;
}

export function GameRoom({ matchID }: { matchID: string }) {
  const [players, setPlayers] = useState<MatchPlayer[] | null>(null);
  const [seat, setSeat] = useState<Seat | null>(loadSeat(matchID));
  const [name, setName] = useState(savedName() || 'Игрок');
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const m = await lobby.getMatch(GAME_ID, matchID);
      setPlayers(m.players as MatchPlayer[]);
      setError(null);
    } catch {
      setError('Партия не найдена. Проверьте код.');
    }
  }, [matchID]);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 2500);
    return () => clearInterval(t);
  }, [refresh]);

  async function take(seatId: number) {
    try {
      rememberName(name);
      const { playerCredentials } = await lobby.joinMatch(GAME_ID, matchID, {
        playerID: String(seatId),
        playerName: name,
      });
      const s: Seat = { playerID: String(seatId), credentials: playerCredentials, name };
      saveSeat(matchID, s);
      setSeat(s);
      refresh();
    } catch {
      setError('Не удалось занять место (возможно, уже занято).');
    }
  }

  const shareUrl = `${location.origin}${location.pathname}#/m/${matchID}`;
  const joined = players?.filter((p) => p.name).length ?? 0;
  const total = players?.length ?? 0;
  const full = total > 0 && joined === total;

  function copyLink() {
    navigator.clipboard?.writeText(shareUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  // Уже сидим за столом — показываем игру (с баннером ожидания, пока не все).
  if (seat) {
    return (
      <div className="room">
        <div className="room-bar">
          <a href="#/" className="back">← выход</a>
          <span>Код: <b>{matchID}</b></span>
          <button onClick={copyLink}>{copied ? 'Скопировано!' : 'Скопировать ссылку'}</button>
          <span className="joined">Игроки: {joined}/{total}</span>
        </div>
        {!full && (
          <div className="waiting">Ожидаем игроков… поделитесь ссылкой с друзьями.</div>
        )}
        <NetClient matchID={matchID} playerID={seat.playerID} credentials={seat.credentials} />
      </div>
    );
  }

  // Ещё не выбрали место — рассадка.
  return (
    <div className="home">
      <h1>Комната {matchID}</h1>
      <a href="#/" className="back">← на главную</a>
      {error && <div className="err">{error}</div>}

      <div className="home-card">
        <label>Ваше имя
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={20} />
        </label>
        <div className="seat-list">
          {players?.map((p) => (
            <div key={p.id} className="seat-row">
              <span>Место {p.id + 1}: {p.name ? <b>{p.name}</b> : <i>свободно</i>}</span>
              {!p.name && <button onClick={() => take(p.id)}>Занять</button>}
            </div>
          ))}
          {!players && <div>Загрузка…</div>}
        </div>
      </div>

      <div className="home-card">
        <div className="hint">Ссылка для друзей:</div>
        <div className="share"><code>{shareUrl}</code></div>
        <button onClick={copyLink}>{copied ? 'Скопировано!' : 'Скопировать ссылку'}</button>
      </div>
    </div>
  );
}
