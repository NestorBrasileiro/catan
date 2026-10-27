import type { DefaultEventsMap, Server, Socket } from 'socket.io';

// Who is behind a connection, set on register / create_room / join_room
export interface SessionData {
  userId?: string;
  username?: string;
  roomId?: string;
}

export type GameServer = Server<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, SessionData>;
export type GameSocket = Socket<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, SessionData>;

type Reply = (response: object) => void;

// Registers a client event whose handler always answers and never crashes the server,
// whatever payload (or missing callback) the client sends.
export function onEvent<T extends object>(
  socket: GameSocket,
  event: string,
  handler: (data: Partial<T>, reply: Reply) => void,
) {
  socket.on(event, (data: unknown, callback: unknown) => {
    const reply: Reply = typeof callback === 'function' ? (callback as Reply) : () => {};
    const payload = (typeof data === 'object' && data !== null ? data : {}) as Partial<T>;
    try {
      handler(payload, reply);
    } catch (err) {
      console.error(`[WS] Erro em ${event}:`, err);
      reply({ error: 'Erro interno do servidor.' });
    }
  });
}
