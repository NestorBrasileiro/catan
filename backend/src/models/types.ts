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

export const PLAYER_COLORS = ['red', 'blue', 'white', 'orange'] as const;

// Base game only for now; the 5-6 player extension needs its own board
export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 4;
export const MIN_TURN_TIMER = 30;
export const MAX_TURN_TIMER = 600;

