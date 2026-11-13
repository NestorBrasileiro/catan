import { createContext, useContext } from 'react';
import type { BoardData, GameAction, GameView } from '../components/Board/boardTypes';

export interface Player {
  user_id: string;
  username: string;
  color: string;
  online: boolean;
  bot?: boolean; // a seat the host gave to the computer
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

export interface ChatMessage {
  id: string;
  userId: string;
  username: string;
  text: string;
  at: number; // epoch ms
}

export interface GameContextType {
  user: UserInfo | null;
  room: RoomState | null;
  board: BoardData | null;
  gameState: GameView | null;
  chat: ChatMessage[];
  connected: boolean;
  resuming: boolean; // reconnecting a saved session
  register: (username: string) => Promise<void>;
  createRoom: (maxPlayers: number, turnTimer: number, bots?: number) => Promise<void>;
  joinRoom: (code: string) => Promise<void>;
  leaveRoom: () => Promise<void>;
  startGame: () => Promise<void>;
  addBot: () => Promise<void>;
  removeBot: (botId: string) => Promise<void>;
  sendAction: (action: GameAction) => Promise<void>;
  sendChat: (text: string) => Promise<void>;
  switchPlayer: () => void;
  error: string | null;
  clearError: () => void;
}

export const GameContext = createContext<GameContextType>(null!);

export function useGame() {
  return useContext(GameContext);
}
