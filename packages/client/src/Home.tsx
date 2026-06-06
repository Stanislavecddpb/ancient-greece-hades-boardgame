import { useState } from 'react';
import { lobby, GAME_ID, saveSeat, savedName, rememberName } from './net';

export function Home() {
  const [name, setName] = useState(savedName() || 'Игрок');
  const [numPlayers, setNumPlayers] = useState(2);
  const [joinCode, setJoinCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function createGame() {
    setBusy(true);
    setError(null);
    try {
      rememberName(name);
      const { matchID } = await lobby.createMatch(GAME_ID, { numPlayers });
      // Создатель занимает первое место.
      const { playerCredentials } = await lobby.joinMatch(GAME_ID, matchID, {
        playerID: '0',
        playerName: name,
      });
      saveSeat(matchID, { playerID: '0', credentials: playerCredentials, name });
      location.hash = `#/m/${matchID}`;
    } catch (e) {
      setError('Не удалось создать игру. Сервер запущен?');
    } finally {
      setBusy(false);
    }
  }

  function joinByCode() {
    const code = joinCode.trim();
    if (code) location.hash = `#/m/${code}`;
  }

  return (
    <div className="home">
      <h1>Cyclades</h1>
      <p className="hint">Борьба за господство над островами Эгейского моря. Соберите 2 Метрополии.</p>

      <div className="home-card">
        <label>Ваше имя
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={20} />
        </label>

        <label>Игроков
          <select value={numPlayers} onChange={(e) => setNumPlayers(Number(e.target.value))}>
            <option value={2}>2</option>
            <option value={3}>3</option>
            <option value={4}>4</option>
          </select>
        </label>

        <button disabled={busy} onClick={createGame}>Создать игру</button>
        {error && <div className="err">{error}</div>}
      </div>

      <div className="home-card">
        <label>Код партии (от друга)
          <input value={joinCode} onChange={(e) => setJoinCode(e.target.value)} placeholder="например, W28urhFkUw7" />
        </label>
        <button disabled={!joinCode.trim()} onClick={joinByCode}>Присоединиться</button>
      </div>

      <a className="local-link" href="#/local">Локальная игра за одним компьютером →</a>
    </div>
  );
}
