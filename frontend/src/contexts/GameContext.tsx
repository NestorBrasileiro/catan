import { useState, useEffect, useCallback, type ReactNode } from 'react';
import { socket } from '../services/socket';
import type { BoardData, GameAction, GameView } from '../components/Board/boardTypes';
import { GameContext, type RoomState, type UserInfo } from './useGame';

type AckResponse = { error?: string } & Record<string, unknown>;

// The session token brings this player back after a reload or a dropped connection.
// Each tab keeps its own (so several players can share one browser while testing);
// the shared copy only reopens the last session in a brand-new tab.
const SESSION_KEY = 'catan.session';

function readToken(): string | null {
  try {
    return sessionStorage.getItem(SESSION_KEY) ?? localStorage.getItem(SESSION_KEY);
  } catch {
    return null;
  }
}

function saveToken(token: string | null) {
  for (const store of [sessionStorage, localStorage]) {
    try {
      if (token) store.setItem(SESSION_KEY, token);
      else store.removeItem(SESSION_KEY);
    } catch { /* storage blocked (private mode): the session just won't survive a reload */ }
  }
}

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
  const [resuming, setResuming] = useState(() => readToken() !== null);
  const [error, setError] = useState<string | null>(null);

  const clearRoom = useCallback(() => {
    setRoom(null);
    setBoard(null);
    setGameState(null);
  }, []);

  useEffect(() => {
    // Runs on the first connection and on every reconnection
    const onConnect = () => {
      setConnected(true);
      const token = readToken();
      if (!token) {
        setResuming(false);
        return;
      }
      setResuming(true);
      socket.emit('resume', { token }, (res: AckResponse & { user?: UserInfo; inRoom?: boolean }) => {
        if (res.error || !res.user) {
          saveToken(null);
          setUser(null);
          clearRoom();
        } else {
          saveToken(token);
          setUser(res.user);
          if (!res.inRoom) clearRoom();
        }
        setResuming(false);
      });
    };

    socket.connect();
    socket.on('connect', onConnect);
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
  }, [clearRoom]);

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
    const res = await call<{ user: UserInfo; token: string }>('register', { username });
    saveToken(res.token);
    setUser(res.user);
  }, [call]);

  const createRoom = useCallback(async (maxPlayers: number, turnTimer: number) => {
    await call('create_room', { maxPlayers, turnTimer });
  }, [call]);

  const joinRoom = useCallback(async (code: string) => {
    await call('join_room', { code });
  }, [call]);

  const leaveRoom = useCallback(async () => {
    await call('leave_room');
    clearRoom();
  }, [call, clearRoom]);

  const startGame = useCallback(async () => {
    await call('start_game');
  }, [call]);

  const sendAction = useCallback(async (action: GameAction) => {
    await call('game_action', action);
  }, [call]);

  // Forget this browser's session and start over with a new name (e.g. a second player in the same browser)
  const switchPlayer = useCallback(() => {
    saveToken(null);
    setUser(null);
    clearRoom();
    socket.disconnect();
    socket.connect();
  }, [clearRoom]);

  const clearError = useCallback(() => setError(null), []);

  return (
    <GameContext.Provider value={{
      user, room, board, gameState, connected, resuming,
      register, createRoom, joinRoom, leaveRoom, startGame, sendAction, switchPlayer,
      error, clearError,
    }}>
      {children}
    </GameContext.Provider>
  );
}
