export interface User {
  id: string;
  username: string;
}

export interface Room {
  id: string;
  code: string;
  host_id: string;
  max_players: number;
  turn_timer: number;
  status: 'waiting' | 'playing' | 'finished';
}

export interface RoomPlayer {
  room_id: string;
  user_id: string;
  color: string | null;
}

// The base game's four colors, then the 5-6 player extension's green and brown
export const PLAYER_COLORS = ['red', 'blue', 'white', 'orange', 'green', 'saddlebrown'] as const;

// 5 or 6 players play on the extension's larger island
export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 6;
export const MIN_TURN_TIMER = 30;
export const MAX_TURN_TIMER = 600;

