import { Client } from 'boardgame.io/react';
import { Local } from 'boardgame.io/multiplayer';
import { CycladesGame } from '@cyclades/engine';
import { Board } from './Board';

// На время разработки используем локальный мультиплеер в браузере: оба «места»
// игроков синхронизируются между собой без сервера. Сетевую игру с друзьями
// (SocketIO + лобби по ссылке) подключим на Этапе 3.
const CycladesClient = Client({
  game: CycladesGame,
  board: Board,
  numPlayers: 2,
  multiplayer: Local(),
});

export function App() {
  return (
    <div className="app">
      <h1>Cyclades</h1>
      <p className="hint">
        Локальный режим: ходите за обоих игроков по очереди. Активная панель — та,
        чей сейчас ход.
      </p>
      <div className="seats">
        <CycladesClient matchID="dev" playerID="0" />
        <CycladesClient matchID="dev" playerID="1" />
      </div>
    </div>
  );
}
