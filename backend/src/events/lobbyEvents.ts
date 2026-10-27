import { randomInt } from 'crypto';
import { getDb } from '../config/database';
import { nanoid } from 'nanoid';
import { Room, RoomPlayer, PLAYER_COLORS, MIN_PLAYERS, MAX_PLAYERS, MIN_TURN_TIMER, MAX_TURN_TIMER } from '../models/types';
import { generateBoard } from '../utils/boardGenerator';
import { GameState, activeGames } from '../models/gameState';
import { emitGameState, emitRoomState } from './broadcast';
import { GameServer, GameSocket, onEvent } from './socket';

function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 5; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
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

export function registerLobbyEvents(io: GameServer, socket: GameSocket) {
  const db = getDb();

  // Register user (simple — just a username, get back an id)
  onEvent<{ username: string }>(socket, 'register', (data, reply) => {
    if (socket.data.userId) return reply({ error: 'Já está registado.' });
    const username = typeof data.username === 'string' ? data.username.trim() : '';
    if (username.length < 2 || username.length > 20) {
      return reply({ error: 'Nome deve ter entre 2 e 20 caracteres.' });
    }

    const id = nanoid(12);
    db.prepare('INSERT INTO users (id, username) VALUES (?, ?)').run(id, username);
    socket.data.userId = id;
    socket.data.username = username;
    reply({ ok: true, user: { id, username } });
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

  // Leave room
  onEvent(socket, 'leave_room', (_data, reply) => {
    const { userId, roomId } = socket.data;
    if (!roomId) return reply({ error: 'Não está em nenhuma sala.' });

    db.prepare('DELETE FROM room_players WHERE room_id = ? AND user_id = ?').run(roomId, userId);
    socket.leave(roomId);
    socket.data.roomId = undefined;

    emitRoomState(io, roomId);
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

    // Send board with vertex/edge data for rendering
    const vertices = [...game.graph.vertices.values()].map(v => ({ key: v.key, q: v.q, r: v.r, dir: v.dir }));
    const edges = [...game.graph.edges.values()].map(e => ({ key: e.key, vertices: e.vertices }));

    reply({ ok: true });
    emitRoomState(io, roomId);
    io.to(roomId).emit('game_started', { roomId });
    io.to(roomId).emit('board_generated', { ...game.board, vertices, edges });
    emitGameState(io, roomId);
  });

  // Disconnect cleanup
  socket.on('disconnect', () => {
    const { userId, roomId } = socket.data;
    if (!roomId || !userId) return;

    const room = db.prepare('SELECT status FROM rooms WHERE id = ?').get(roomId) as Pick<Room, 'status'> | undefined;
    if (room?.status === 'waiting') {
      db.prepare('DELETE FROM room_players WHERE room_id = ? AND user_id = ?').run(roomId, userId);
      emitRoomState(io, roomId);
    }
  });
}
