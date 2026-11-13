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


// Seats the host fills with the computer before the game starts. They're stored as users whose id
// starts with this prefix and have no session token, so nobody can log in as them.
export const BOT_ID_PREFIX = 'bot_';
export const BOT_NAMES = ['Zé Bot', 'Dona Bot', 'Bot Tião', 'Bot Cida', 'Robozinho', 'Bot Neide'];

export function isBotId(userId: string): boolean {
  return userId.startsWith(BOT_ID_PREFIX);
}
