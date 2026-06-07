import { useState } from 'react';
import { Client } from 'boardgame.io/react';
import { Local } from 'boardgame.io/multiplayer';
import { CycladesGame } from '@cyclades/engine';
import { Board } from './Board';

// Хотсит: один экран, переключаем активное «место» кнопкой.
const LocalClient = Client({
  game: CycladesGame,
  board: Board,
  numPlayers: 2,
  multiplayer: Local(),
  debug: false,
});

export function LocalGame() {
  const [seat, setSeat] = useState(0);
  return (
    <div className="local-wrap">
      <div className="local-bar">
        <a href="#/" className="back">← выход</a>
        <span>Хотсит — место: <b>Игрок {seat + 1}</b></span>
        <button onClick={() => setSeat((s) => (s + 1) % 2)}>Передать ход →</button>
      </div>
      <LocalClient key={seat} matchID="local" playerID={String(seat)} />
    </div>
  );
}
