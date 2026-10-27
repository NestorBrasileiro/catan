import { getDb } from '../config/database';
import { activeGames, GameAction } from '../models/gameState';
import { emitGameState, emitRoomState } from './broadcast';
import { GameServer, GameSocket, onEvent } from './socket';

export function registerGameEvents(io: GameServer, socket: GameSocket) {
  // Every in-game move goes through here; GameState validates it
  onEvent<GameAction>(socket, 'game_action', (action, reply) => {
    const { userId, roomId } = socket.data;
    if (!userId || !roomId) return reply({ error: 'Não está numa sala.' });

    const game = activeGames.get(roomId);
    if (!game) return reply({ error: 'Jogo não encontrado.' });

    const err = game.apply(userId, action as GameAction);
    if (err) return reply({ error: err });

    if (game.winnerId) recordWinner(io, roomId, game.winnerId);
    reply({ ok: true });
    emitGameState(io, roomId);
  });
}

export function recordWinner(io: GameServer, roomId: string, winnerId: string) {
  const db = getDb();
  db.prepare("UPDATE rooms SET status = 'finished' WHERE id = ?").run(roomId);
  db.prepare('INSERT INTO game_history (room_id, winner_id) VALUES (?, ?)').run(roomId, winnerId);
  emitRoomState(io, roomId);
}
