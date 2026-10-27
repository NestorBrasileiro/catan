import { getDb } from '../config/database';
import { GameState, activeGames } from '../models/gameState';
import { Room } from '../models/types';
import { GameServer } from './socket';

// Players with at least one open connection in the room
export function onlineUserIds(io: GameServer, roomId: string): Set<string> {
  const online = new Set<string>();
  for (const socketId of io.sockets.adapter.rooms.get(roomId) ?? []) {
    const userId = io.sockets.sockets.get(socketId)?.data.userId;
    if (userId) online.add(userId);
  }
  return online;
}

export function emitRoomState(io: GameServer, roomId: string) {
  const db = getDb();
  const room = db.prepare('SELECT * FROM rooms WHERE id = ?').get(roomId) as Room | undefined;
  if (!room) return;

  const online = onlineUserIds(io, roomId);
  const players = (db.prepare(`
    SELECT rp.user_id, rp.color, u.username
    FROM room_players rp JOIN users u ON rp.user_id = u.id
    WHERE rp.room_id = ?
    ORDER BY rp.joined_at, rp.rowid
  `).all(roomId) as { user_id: string }[]).map(p => ({ ...p, online: online.has(p.user_id) }));

  io.to(roomId).emit('room_state_updated', {
    id: room.id,
    code: room.code,
    hostId: room.host_id,
    maxPlayers: room.max_players,
    turnTimer: room.turn_timer,
    status: room.status,
    players,
  });
}

// Each player gets their own view of the game (hidden hands, own legal moves)
export function emitGameState(io: GameServer, roomId: string) {
  const game = activeGames.get(roomId);
  const socketIds = io.sockets.adapter.rooms.get(roomId);
  if (!game || !socketIds) return;

  for (const socketId of socketIds) {
    const s = io.sockets.sockets.get(socketId);
    if (s?.data.userId) s.emit('game_state_update', game.toView(s.data.userId));
  }
}

// Static board plus the vertex/edge lists the client needs to draw pieces
export function boardPayload(game: GameState) {
  return {
    ...game.board,
    vertices: [...game.graph.vertices.values()].map(v => ({ key: v.key, q: v.q, r: v.r, dir: v.dir })),
    edges: [...game.graph.edges.values()].map(e => ({ key: e.key, vertices: e.vertices })),
  };
}
