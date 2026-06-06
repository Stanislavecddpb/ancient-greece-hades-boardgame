import { Client } from 'boardgame.io/react';
import { SocketIO } from 'boardgame.io/multiplayer';
import { LobbyClient } from 'boardgame.io/client';
import { CycladesGame, GAME_ID } from '@cyclades/engine';
import { Board } from './Board';

// Сервер по умолчанию — тот же хост, что отдал клиент, порт 3001.
// Это позволяет друзьям в одной сети подключаться по локальному IP без правок.
export const SERVER = import.meta.env.VITE_SERVER ?? `http://${location.hostname}:3001`;

export const lobby = new LobbyClient({ server: SERVER });

/** Сетевой клиент (авторитарный сервер + SocketIO). */
export const NetClient = Client({
  game: CycladesGame,
  board: Board,
  multiplayer: SocketIO({ server: SERVER }),
  debug: false,
});

export { GAME_ID };

// --- Сохранение места игрока в партии (localStorage) ---

export interface Seat {
  playerID: string;
  credentials: string;
  name: string;
}

const seatKey = (matchID: string) => `cyclades:seat:${matchID}`;

export function loadSeat(matchID: string): Seat | null {
  try {
    const raw = localStorage.getItem(seatKey(matchID));
    return raw ? (JSON.parse(raw) as Seat) : null;
  } catch {
    return null;
  }
}

export function saveSeat(matchID: string, seat: Seat): void {
  localStorage.setItem(seatKey(matchID), JSON.stringify(seat));
}

export function savedName(): string {
  return localStorage.getItem('cyclades:name') ?? '';
}
export function rememberName(name: string): void {
  localStorage.setItem('cyclades:name', name);
}
