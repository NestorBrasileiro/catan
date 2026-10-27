import { createContext, useContext } from 'react';
import type { BoardData, GameAction, GameView } from '../components/Board/boardTypes';

export interface Player {
  user_id: string;
  username: string;
  color: string;
}

export interface RoomState {
  id: string;
  code: string;
  hostId: string;
  maxPlayers: number;
  turnTimer: number;
  status: 'waiting' | 'playing' | 'finished';
  players: Player[];
}

export interface UserInfo {
  id: string;
  username: string;
}

export interface GameContextType {
  user: UserInfo | null;
  room: RoomState | null;
  board: BoardData | null;
  gameState: GameView | null;
  connected: boolean;
  register: (username: string) => Promise<void>;
  createRoom: (maxPlayers: number, turnTimer: number) => Promise<void>;
  joinRoom: (code: string) => Promise<void>;
  leaveRoom: () => void;
  startGame: () => Promise<void>;
  sendAction: (action: GameAction) => Promise<void>;
  error: string | null;
  clearError: () => void;
}

export const GameContext = createContext<GameContextType>(null!);

export function useGame() {
  return useContext(GameContext);
}
