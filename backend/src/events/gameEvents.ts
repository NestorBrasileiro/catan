import { getDb } from '../config/database';
import { nextBotMove } from '../models/bot';
import { activeGames, GameAction } from '../models/gameState';
import { emitGameState, emitRoomState } from './broadcast';
import { GameServer, GameSocket, onEvent } from './socket';

// Long enough for players to follow what a bot does (and for the dice animation to finish)
const BOT_DELAY_MS = 1300;
const botTimers = new Map<string, NodeJS.Timeout>(); // roomId → the bots' next move

// Plays the seats the computer took over, one move at a time, for as long as one has something to do.
// With nobody playing their own seat (everyone offline), the game waits instead of playing itself out.
export function scheduleBots(io: GameServer, roomId: string) {
  const game = activeGames.get(roomId);
  if (botTimers.has(roomId) || !game || !game.hasHumans || !nextBotMove(game)) return;

  botTimers.set(roomId, setTimeout(() => {
    botTimers.delete(roomId);
    try {
      const game = activeGames.get(roomId);
      const move = game && nextBotMove(game);
      if (!game || !move || !game.hasHumans) return;
      const err = game.apply(move.botId, move.action);
      if (err) {
        console.error(`[BOT] Jogada recusada (${err}):`, move.action);
        return;
      }
      if (game.winnerId) recordWinner(io, roomId, game.winnerId);
      emitGameState(io, roomId);
      scheduleBots(io, roomId);
    } catch (err) {
      console.error('[BOT] Erro ao jogar:', err);
    }
  }, BOT_DELAY_MS));
}

export function registerGameEvents(io: GameServer, socket: GameSocket) {
  // Every in-game move goes through here; GameState validates it
  onEvent<GameAction>(socket, 'game_action', (action, reply) => {
    const { userId, roomId } = socket.data;
    if (!userId || !roomId) return reply({ error: 'Não está numa sala.' });

    const game = activeGames.get(roomId);
    if (!game) return reply({ error: 'Jogo não encontrado.' });
    if (game.leftPlayers.has(userId)) return reply({ error: 'Você saiu da partida.' });
    game.setAway(userId, false); // playing again takes the seat back from the bot

    const err = game.apply(userId, action as GameAction);
    if (err) return reply({ error: err });

    if (game.winnerId) recordWinner(io, roomId, game.winnerId);
    reply({ ok: true });
    emitGameState(io, roomId);
    scheduleBots(io, roomId);
  });
}

export function recordWinner(io: GameServer, roomId: string, winnerId: string) {
  const db = getDb();
  db.prepare("UPDATE rooms SET status = 'finished' WHERE id = ?").run(roomId);
  db.prepare('INSERT INTO game_history (room_id, winner_id) VALUES (?, ?)').run(roomId, winnerId);
  emitRoomState(io, roomId);
}
