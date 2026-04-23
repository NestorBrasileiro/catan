import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { socket } from '../services/socket';
import type { BoardData, GameStateSnapshot } from '../components/Board/boardTypes';

interface Player {
  user_id: string;
  username: string;
  color: string;
}

interface RoomState {
  id: string;
  code: string;
  hostId: string;
  maxPlayers: number;
  turnTimer: number;
  status: string;
  players: Player[];
}

interface UserInfo {
  id: string;
  username: string;
}

interface GameContextType {
  user: UserInfo | null;
  room: RoomState | null;
  board: BoardData | null;
  gameState: GameStateSnapshot | null;
  connected: boolean;
  register: (username: string) => Promise<void>;
  createRoom: (maxPlayers: number, turnTimer: number) => Promise<string>;
  joinRoom: (code: string) => Promise<void>;
  leaveRoom: () => void;
  startGame: () => Promise<void>;
  buildSettlement: (vertexKey: string) => Promise<void>;
  buildRoad: (edgeKey: string) => Promise<void>;
  error: string | null;
  clearError: () => void;
}

const GameContext = createContext<GameContextType>(null!);

export function useGame() {
  return useContext(GameContext);
}

export function GameProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserInfo | null>(null);
  const [room, setRoom] = useState<RoomState | null>(null);
  const [board, setBoard] = useState<BoardData | null>(null);
  const [gameState, setGameState] = useState<GameStateSnapshot | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    socket.connect();
    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));
    socket.on('room_state_updated', (state: RoomState) => setRoom(state));
    socket.on('board_generated', (data: BoardData) => setBoard(data));
    socket.on('game_state_update', (state: GameStateSnapshot) => setGameState(state));

    return () => {
      socket.off('connect');
      socket.off('disconnect');
      socket.off('room_state_updated');
      socket.off('board_generated');
      socket.off('game_state_update');
      socket.disconnect();
    };
  }, []);

  const register = useCallback(async (username: string) => {
    return new Promise<void>((resolve, reject) => {
      socket.emit('register', { username }, (res: any) => {
        if (res.error) { setError(res.error); reject(res.error); }
        else { setUser(res.user); resolve(); }
      });
    });
  }, []);

  const createRoom = useCallback(async (maxPlayers: number, turnTimer: number) => {
    return new Promise<string>((resolve, reject) => {
      socket.emit('create_room', { maxPlayers, turnTimer }, (res: any) => {
        if (res.error) { setError(res.error); reject(res.error); }
        else resolve(res.room.code);
      });
    });
  }, []);

  const joinRoom = useCallback(async (code: string) => {
    return new Promise<void>((resolve, reject) => {
      socket.emit('join_room', { code }, (res: any) => {
        if (res.error) { setError(res.error); reject(res.error); }
        else resolve();
      });
    });
  }, []);

  const leaveRoom = useCallback(() => {
    socket.emit('leave_room', {}, () => setRoom(null));
  }, []);

  const startGame = useCallback(async () => {
    return new Promise<void>((resolve, reject) => {
      socket.emit('start_game', {}, (res: any) => {
        if (res.error) { setError(res.error); reject(res.error); }
        else resolve();
      });
    });
  }, []);

  const buildSettlement = useCallback(async (vertexKey: string) => {
    return new Promise<void>((resolve, reject) => {
      socket.emit('build_settlement', { vertexKey }, (res: any) => {
        if (res.error) { setError(res.error); reject(res.error); }
        else resolve();
      });
    });
  }, []);

  const buildRoad = useCallback(async (edgeKey: string) => {
    return new Promise<void>((resolve, reject) => {
      socket.emit('build_road', { edgeKey }, (res: any) => {
        if (res.error) { setError(res.error); reject(res.error); }
        else resolve();
      });
    });
  }, []);

  const clearError = useCallback(() => setError(null), []);

  return (
    <GameContext.Provider value={{ user, room, board, gameState, connected, register, createRoom, joinRoom, leaveRoom, startGame, buildSettlement, buildRoad, error, clearError }}>
      {children}
    </GameContext.Provider>
  );
}
