import { getDb } from '../config/database';
import { activeGames } from '../models/gameState';
import { Room } from '../models/types';
import { GameServer } from './socket';

export function emitRoomState(io: GameServer, roomId: string) {
  const db = getDb();
  const room = db.prepare('SELECT * FROM rooms WHERE id = ?').get(roomId) as Room | undefined;
  if (!room) return;

  const players = db.prepare(`
    SELECT rp.user_id, rp.color, u.username
    FROM room_players rp JOIN users u ON rp.user_id = u.id
    WHERE rp.room_id = ?
  `).all(roomId);

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
