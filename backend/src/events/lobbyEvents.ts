import { createHash, randomInt } from 'crypto';
import { getDb } from '../config/database';
import { nanoid } from 'nanoid';
import { Room, RoomPlayer, PLAYER_COLORS, MIN_PLAYERS, MAX_PLAYERS, MIN_TURN_TIMER, MAX_TURN_TIMER } from '../models/types';
import { generateBoard } from '../utils/boardGenerator';
import { GameState, activeGames } from '../models/gameState';
import { boardPayload, emitGameState, emitRoomState, onlineUserIds } from './broadcast';
import { recordWinner } from './gameEvents';
import { GameServer, GameSocket, onEvent } from './socket';

// How long a player who dropped out of a waiting room keeps their seat (e.g. a page reload)
const WAITING_ROOM_GRACE_MS = 20_000;
const pendingRemovals = new Map<string, NodeJS.Timeout>(); // userId → scheduled removal

function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 5; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

// Only a hash of the session token is stored, so a leaked database can't be used to log in
function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function isIntInRange(value: unknown, min: number, max: number): value is number {
  return Number.isInteger(value) && (value as number) >= min && (value as number) <= max;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// The room a returning player belongs to: a waiting room, or a game still in memory they haven't left
function findCurrentRoom(userId: string): Room | undefined {
  const rooms = getDb().prepare(`
    SELECT r.* FROM room_players rp JOIN rooms r ON r.id = rp.room_id
    WHERE rp.user_id = ? ORDER BY rp.joined_at DESC, rp.rowid DESC
  `).all(userId) as Room[];
  return rooms.find(r => r.status === 'waiting'
    || (activeGames.has(r.id) && !activeGames.get(r.id)!.leftPlayers.has(userId)));
}

// Frees the seat; the host role passes to whoever joined first, and an empty room is deleted
function removeFromWaitingRoom(io: GameServer, roomId: string, userId: string) {
  const db = getDb();
  db.prepare('DELETE FROM room_players WHERE room_id = ? AND user_id = ?').run(roomId, userId);
  const remaining = db.prepare('SELECT user_id FROM room_players WHERE room_id = ? ORDER BY joined_at, rowid')
    .all(roomId) as { user_id: string }[];
  if (remaining.length === 0) {
    db.prepare('DELETE FROM rooms WHERE id = ?').run(roomId);
    return;
  }
  db.prepare('UPDATE rooms SET host_id = ? WHERE id = ? AND host_id = ?').run(remaining[0].user_id, roomId, userId);
  emitRoomState(io, roomId);
}

function cancelPendingRemoval(userId: string) {
  clearTimeout(pendingRemovals.get(userId));
  pendingRemovals.delete(userId);
}

export function registerLobbyEvents(io: GameServer, socket: GameSocket) {
  const db = getDb();

  // Register user (just a username). The token lets this browser come back as the same player.
  onEvent<{ username: string }>(socket, 'register', (data, reply) => {
    if (socket.data.userId) return reply({ error: 'Já está registado.' });
    const username = typeof data.username === 'string' ? data.username.trim() : '';
    if (username.length < 2 || username.length > 20) {
      return reply({ error: 'Nome deve ter entre 2 e 20 caracteres.' });
    }

    const id = nanoid(12);
    const token = nanoid(32);
    db.prepare('INSERT INTO users (id, username, token_hash) VALUES (?, ?, ?)').run(id, username, hashToken(token));
    socket.data.userId = id;
    socket.data.username = username;
    reply({ ok: true, user: { id, username }, token });
  });

  // A returning browser (reload, dropped connection) takes its seat back
  onEvent<{ token: string }>(socket, 'resume', (data, reply) => {
    if (typeof data.token !== 'string' || data.token.length === 0) return reply({ error: 'Sessão inválida.' });
    const user = db.prepare('SELECT id, username FROM users WHERE token_hash = ?')
      .get(hashToken(data.token)) as { id: string; username: string } | undefined;
    if (!user) return reply({ error: 'Sessão expirada.' });
    if (socket.data.userId && socket.data.userId !== user.id) return reply({ error: 'Já está registado.' });

    socket.data.userId = user.id;
    socket.data.username = user.username;
    cancelPendingRemoval(user.id);

    const room = findCurrentRoom(user.id);
    reply({ ok: true, user, inRoom: room !== undefined });
    if (!room) return;

    socket.join(room.id);
    socket.data.roomId = room.id;
    emitRoomState(io, room.id);
    const game = activeGames.get(room.id);
    if (game) {
      socket.emit('board_generated', boardPayload(game));
      socket.emit('game_state_update', game.toView(user.id));
    }
  });

  // Create room
  onEvent<{ maxPlayers: number; turnTimer: number }>(socket, 'create_room', (data, reply) => {
    const { userId } = socket.data;
    if (!userId) return reply({ error: 'Registe-se primeiro.' });
    if (socket.data.roomId) return reply({ error: 'Você já está numa sala.' });

    const maxPlayers = data.maxPlayers ?? MAX_PLAYERS;
    const turnTimer = data.turnTimer ?? 120;
    if (!isIntInRange(maxPlayers, MIN_PLAYERS, MAX_PLAYERS)) {
      return reply({ error: `A sala deve ter de ${MIN_PLAYERS} a ${MAX_PLAYERS} jogadores.` });
    }
    if (!isIntInRange(turnTimer, MIN_TURN_TIMER, MAX_TURN_TIMER)) {
      return reply({ error: `Tempo por turno deve ser entre ${MIN_TURN_TIMER} e ${MAX_TURN_TIMER} segundos.` });
    }

    const roomId = nanoid(16);
    const code = generateRoomCode();

    db.prepare('INSERT INTO rooms (id, code, host_id, max_players, turn_timer) VALUES (?, ?, ?, ?, ?)')
      .run(roomId, code, userId, maxPlayers, turnTimer);
    db.prepare('INSERT INTO room_players (room_id, user_id, color) VALUES (?, ?, ?)')
      .run(roomId, userId, PLAYER_COLORS[0]);

    socket.join(roomId);
    socket.data.roomId = roomId;

    reply({ ok: true, room: { id: roomId, code, maxPlayers, turnTimer } });
    emitRoomState(io, roomId);
  });

  // Join room
  onEvent<{ code: string }>(socket, 'join_room', (data, reply) => {
    const { userId } = socket.data;
    if (!userId) return reply({ error: 'Registe-se primeiro.' });
    if (socket.data.roomId) return reply({ error: 'Você já está numa sala.' });
    if (typeof data.code !== 'string') return reply({ error: 'Código inválido.' });

    const room = db.prepare('SELECT * FROM rooms WHERE code = ?').get(data.code.trim().toUpperCase()) as Room | undefined;
    if (!room) return reply({ error: 'Sala não encontrada.' });
    if (room.status !== 'waiting') return reply({ error: 'Jogo já iniciado.' });

    const players = db.prepare('SELECT * FROM room_players WHERE room_id = ?').all(room.id) as RoomPlayer[];
    if (players.length >= room.max_players) return reply({ error: 'Sala cheia.' });

    const usedColors = players.map(p => p.color);
    const color = PLAYER_COLORS.find(c => !usedColors.includes(c))!;

    db.prepare('INSERT INTO room_players (room_id, user_id, color) VALUES (?, ?, ?)')
      .run(room.id, userId, color);

    socket.join(room.id);
    socket.data.roomId = room.id;

    reply({ ok: true, room: { id: room.id, code: room.code, maxPlayers: room.max_players, turnTimer: room.turn_timer } });
    emitRoomState(io, room.id);
  });

  // Leave the waiting room, or give up / walk away from a game
  onEvent(socket, 'leave_room', (_data, reply) => {
    const { userId, roomId } = socket.data;
    if (!roomId || !userId) return reply({ error: 'Não está em nenhuma sala.' });

    socket.leave(roomId);
    socket.data.roomId = undefined;
    const room = db.prepare('SELECT status FROM rooms WHERE id = ?').get(roomId) as Pick<Room, 'status'> | undefined;
    const game = activeGames.get(roomId);

    if (room?.status === 'waiting') {
      removeFromWaitingRoom(io, roomId, userId);
    } else if (game) {
      const wasOver = game.winnerId !== null;
      game.leave(userId);
      if (!wasOver && game.winnerId) recordWinner(io, roomId, game.winnerId);
      emitGameState(io, roomId);
      emitRoomState(io, roomId);
    }
    reply({ ok: true });
  });

  // Start game
  onEvent(socket, 'start_game', (_data, reply) => {
    const { userId, roomId } = socket.data;
    if (!roomId) return reply({ error: 'Não está em nenhuma sala.' });

    const room = db.prepare('SELECT * FROM rooms WHERE id = ?').get(roomId) as Room | undefined;
    if (!room) return reply({ error: 'Sala não encontrada.' });
    if (room.host_id !== userId) return reply({ error: 'Apenas o host pode iniciar o jogo.' });
    if (room.status !== 'waiting') return reply({ error: 'Jogo já iniciado.' });

    const players = db.prepare('SELECT * FROM room_players WHERE room_id = ?').all(roomId) as RoomPlayer[];
    if (players.length < MIN_PLAYERS) return reply({ error: `Mínimo de ${MIN_PLAYERS} jogadores.` });

    db.prepare('UPDATE rooms SET status = ? WHERE id = ?').run('playing', roomId);

    // Official rules: the starting player is drawn at random
    const playerInfos = shuffle(players).map(p => ({ userId: p.user_id, color: p.color! }));
    const game = new GameState(generateBoard(), playerInfos);
    activeGames.set(roomId, game);

    reply({ ok: true });
    emitRoomState(io, roomId);
    io.to(roomId).emit('game_started', { roomId });
    io.to(roomId).emit('board_generated', boardPayload(game));
    emitGameState(io, roomId);
  });

  // A dropped connection keeps the seat: in a game for good (others see the player offline),
  // in a waiting room for a short grace period
  socket.on('disconnect', () => {
    try {
      const { userId, roomId } = socket.data;
      if (!roomId || !userId) return;
      emitRoomState(io, roomId);
      if (onlineUserIds(io, roomId).has(userId)) return; // still connected from another tab

      const room = db.prepare('SELECT status FROM rooms WHERE id = ?').get(roomId) as Pick<Room, 'status'> | undefined;
      if (room?.status !== 'waiting') return;
      cancelPendingRemoval(userId);
      pendingRemovals.set(userId, setTimeout(() => {
        try {
          pendingRemovals.delete(userId);
          const current = db.prepare('SELECT status FROM rooms WHERE id = ?').get(roomId) as Pick<Room, 'status'> | undefined;
          if (current?.status === 'waiting' && !onlineUserIds(io, roomId).has(userId)) {
            removeFromWaitingRoom(io, roomId, userId);
          }
        } catch (err) {
          console.error('[WS] Erro ao liberar lugar na sala:', err);
        }
      }, WAITING_ROOM_GRACE_MS));
    } catch (err) {
      console.error('[WS] Erro em disconnect:', err);
    }
  });
}
