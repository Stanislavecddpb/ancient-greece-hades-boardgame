import { Client } from 'boardgame.io/react';
import { Local } from 'boardgame.io/multiplayer';
import { CycladesGame } from '@cyclades/engine';
import { Board } from './Board';

// Хотсит: оба игрока за одним компьютером, синхронизация в браузере без сервера.
const LocalClient = Client({
  game: CycladesGame,
  board: Board,
  numPlayers: 2,
  multiplayer: Local(),
  debug: false,
});

export function LocalGame() {
  return (
    <div className="app">
      <div className="room-bar"><a href="#/" className="back">← выход</a><span>Локальная игра (хотсит)</span></div>
      <div className="seats">
        <LocalClient matchID="local" playerID="0" />
        <LocalClient matchID="local" playerID="1" />
      </div>
    </div>
  );
}
