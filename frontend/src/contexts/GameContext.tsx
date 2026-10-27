import { useState, useEffect, useCallback, type ReactNode } from 'react';
import { socket } from '../services/socket';
import type { BoardData, GameAction, GameView } from '../components/Board/boardTypes';
import { GameContext, type RoomState, type UserInfo } from './useGame';

type AckResponse = { error?: string } & Record<string, unknown>;

// Emits an event and resolves with the server's ack, rejecting when it carries an error
function request<T>(event: string, payload: unknown): Promise<T> {
  return new Promise((resolve, reject) => {
    socket.emit(event, payload, (res: AckResponse) => {
      if (res.error) reject(new Error(res.error));
      else resolve(res as T);
    });
  });
}

export function GameProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserInfo | null>(null);
  const [room, setRoom] = useState<RoomState | null>(null);
  const [board, setBoard] = useState<BoardData | null>(null);
  const [gameState, setGameState] = useState<GameView | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    socket.connect();
    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));
    socket.on('room_state_updated', (state: RoomState) => setRoom(state));
    socket.on('board_generated', (data: BoardData) => setBoard(data));
    socket.on('game_state_update', (state: GameView) => setGameState(state));

    return () => {
      socket.off('connect');
      socket.off('disconnect');
      socket.off('room_state_updated');
      socket.off('board_generated');
      socket.off('game_state_update');
      socket.disconnect();
    };
  }, []);

  // Shows the server's refusal in the error banner, then rethrows for the caller
  const call = useCallback(async <T,>(event: string, payload: unknown = {}): Promise<T> => {
    try {
      return await request<T>(event, payload);
    } catch (err) {
      setError((err as Error).message);
      throw err;
    }
  }, []);

  const register = useCallback(async (username: string) => {
    const res = await call<{ user: UserInfo }>('register', { username });
    setUser(res.user);
  }, [call]);

  const createRoom = useCallback(async (maxPlayers: number, turnTimer: number) => {
    await call('create_room', { maxPlayers, turnTimer });
  }, [call]);

  const joinRoom = useCallback(async (code: string) => {
    await call('join_room', { code });
  }, [call]);

  const leaveRoom = useCallback(() => {
    socket.emit('leave_room', {}, () => setRoom(null));
  }, []);

  const startGame = useCallback(async () => {
    await call('start_game');
  }, [call]);

  const sendAction = useCallback(async (action: GameAction) => {
    await call('game_action', action);
  }, [call]);

  const clearError = useCallback(() => setError(null), []);

  return (
    <GameContext.Provider value={{
      user, room, board, gameState, connected,
      register, createRoom, joinRoom, leaveRoom, startGame, sendAction,
      error, clearError,
    }}>
      {children}
    </GameContext.Provider>
  );
}
