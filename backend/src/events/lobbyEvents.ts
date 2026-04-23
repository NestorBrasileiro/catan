import { Server, Socket } from 'socket.io';
import { getDb } from '../config/database';
import { nanoid } from 'nanoid';
import { Room, PLAYER_COLORS } from '../models/types';
import { generateBoard } from '../utils/boardGenerator';
import { buildBoardGraph } from '../utils/boardGraph';
import { GameState, activeGames } from '../models/gameState';
import { emitGameState } from './gameEvents';

function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 5; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

export function registerLobbyEvents(io: Server, socket: Socket) {
  const db = getDb();

  // Register user (simple — just a username, get back an id)
  socket.on('register', (data: { username: string }, callback) => {
    const { username } = data;
    if (!username || username.trim().length < 2) {
      return callback({ error: 'Nome deve ter pelo menos 2 caracteres.' });
    }
    const id = nanoid(12);
    db.prepare('INSERT INTO users (id, username) VALUES (?, ?)').run(id, username.trim());
    (socket as any).userId = id;
    (socket as any).username = username.trim();
    callback({ ok: true, user: { id, username: username.trim() } });
  });

  // Create room
  socket.on('create_room', (data: { maxPlayers?: number; turnTimer?: number }, callback) => {
    const userId = (socket as any).userId;
    if (!userId) return callback({ error: 'Registe-se primeiro.' });

    const maxPlayers = data.maxPlayers ?? 4;
    const turnTimer = data.turnTimer ?? 120;
    const roomId = nanoid(16);
    const code = generateRoomCode();

    db.prepare('INSERT INTO rooms (id, code, host_id, max_players, turn_timer) VALUES (?, ?, ?, ?, ?)')
      .run(roomId, code, userId, maxPlayers, turnTimer);

    const color = PLAYER_COLORS[0];
    db.prepare('INSERT INTO room_players (room_id, user_id, color) VALUES (?, ?, ?)')
      .run(roomId, userId, color);

    socket.join(roomId);
    (socket as any).roomId = roomId;

    callback({ ok: true, room: { id: roomId, code, maxPlayers, turnTimer } });
    emitRoomState(io, roomId);
  });

  // Join room
  socket.on('join_room', (data: { code: string }, callback) => {
    const userId = (socket as any).userId;
    if (!userId) return callback({ error: 'Registe-se primeiro.' });

    const room = db.prepare('SELECT * FROM rooms WHERE code = ?').get(data.code) as Room | undefined;
    if (!room) return callback({ error: 'Sala não encontrada.' });
    if (room.status !== 'waiting') return callback({ error: 'Jogo já iniciado.' });

    const players = db.prepare('SELECT * FROM room_players WHERE room_id = ?').all(room.id) as any[];
    if (players.length >= room.max_players) return callback({ error: 'Sala cheia.' });
    if (players.some(p => p.user_id === userId)) return callback({ error: 'Já está na sala.' });

    const usedColors = players.map(p => p.color);
    const color = PLAYER_COLORS.find(c => !usedColors.includes(c))!;

    db.prepare('INSERT INTO room_players (room_id, user_id, color) VALUES (?, ?, ?)')
      .run(room.id, userId, color);

    socket.join(room.id);
    (socket as any).roomId = room.id;

    callback({ ok: true, room: { id: room.id, code: room.code, maxPlayers: room.max_players, turnTimer: room.turn_timer } });
    emitRoomState(io, room.id);
  });

  // Leave room
  socket.on('leave_room', (_data, callback) => {
    const userId = (socket as any).userId;
    const roomId = (socket as any).roomId;
    if (!roomId) return callback?.({ error: 'Não está em nenhuma sala.' });

    db.prepare('DELETE FROM room_players WHERE room_id = ? AND user_id = ?').run(roomId, userId);
    socket.leave(roomId);
    (socket as any).roomId = null;

    emitRoomState(io, roomId);
    callback?.({ ok: true });
  });

  // Start game
  socket.on('start_game', (_data, callback) => {
    const userId = (socket as any).userId;
    const roomId = (socket as any).roomId;
    if (!roomId) return callback?.({ error: 'Não está em nenhuma sala.' });

    const room = db.prepare('SELECT * FROM rooms WHERE id = ?').get(roomId) as Room | undefined;
    if (!room) return callback?.({ error: 'Sala não encontrada.' });
    if (room.host_id !== userId) return callback?.({ error: 'Apenas o host pode iniciar o jogo.' });
    if (room.status !== 'waiting') return callback?.({ error: 'Jogo já iniciado.' });

    const players = db.prepare('SELECT * FROM room_players WHERE room_id = ?').all(roomId) as any[];
    if (players.length < 2) return callback?.({ error: 'Mínimo de 2 jogadores.' });

    db.prepare('UPDATE rooms SET status = ? WHERE id = ?').run('playing', roomId);

    const board = generateBoard(room.max_players);
    const graph = buildBoardGraph(board.hexes.map(h => ({ q: h.q, r: h.r })));

    // Create game state
    const playerInfos = players.map((p: any) => ({ userId: p.user_id, color: p.color }));
    const gameState = new GameState(roomId, board, playerInfos);
    activeGames.set(roomId, gameState);

    // Send board with vertex/edge data for rendering
    const vertexList = Array.from(graph.vertices.values()).map(v => ({
      key: v.key, q: v.q, r: v.r, dir: v.dir,
    }));
    const edgeList = Array.from(graph.edges.values()).map(e => ({
      key: e.key, vertices: e.vertices,
    }));

    callback?.({ ok: true });
    emitRoomState(io, roomId);
    io.to(roomId).emit('game_started', { roomId });
    io.to(roomId).emit('board_generated', { ...board, vertices: vertexList, edges: edgeList });
    emitGameState(io, roomId);
  });

  // Disconnect cleanup
  socket.on('disconnect', () => {
    const userId = (socket as any).userId;
    const roomId = (socket as any).roomId;
    if (roomId && userId) {
      const room = db.prepare('SELECT status FROM rooms WHERE id = ?').get(roomId) as any;
      if (room?.status === 'waiting') {
        db.prepare('DELETE FROM room_players WHERE room_id = ? AND user_id = ?').run(roomId, userId);
        emitRoomState(io, roomId);
      }
    }
  });
}

function emitRoomState(io: Server, roomId: string) {
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

