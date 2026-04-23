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

export const PLAYER_COLORS = ['red', 'blue', 'white', 'orange', 'green', 'brown'] as const;

