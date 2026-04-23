import { Server, Socket } from 'socket.io';
import { activeGames } from '../models/gameState';

export function registerGameEvents(io: Server, socket: Socket) {

  socket.on('build_settlement', (data: { vertexKey: string }, callback) => {
    const userId = (socket as any).userId;
    const roomId = (socket as any).roomId;
    if (!userId || !roomId) return callback?.({ error: 'Não está numa sala.' });

    const game = activeGames.get(roomId);
    if (!game) return callback?.({ error: 'Jogo não encontrado.' });

    const err = game.buildSettlement(userId, data.vertexKey);
    if (err) return callback?.({ error: err });

    callback?.({ ok: true });
    emitGameState(io, roomId);
  });

  socket.on('build_road', (data: { edgeKey: string }, callback) => {
    const userId = (socket as any).userId;
    const roomId = (socket as any).roomId;
    if (!userId || !roomId) return callback?.({ error: 'Não está numa sala.' });

    const game = activeGames.get(roomId);
    if (!game) return callback?.({ error: 'Jogo não encontrado.' });

    const err = game.buildRoad(userId, data.edgeKey);
    if (err) return callback?.({ error: err });

    callback?.({ ok: true });
    emitGameState(io, roomId);
  });

  // Client requests available spots for current player
  socket.on('get_available_spots', (_data, callback) => {
    const userId = (socket as any).userId;
    const roomId = (socket as any).roomId;
    if (!userId || !roomId) return callback?.({ error: 'Não está numa sala.' });

    const game = activeGames.get(roomId);
    if (!game) return callback?.({ error: 'Jogo não encontrado.' });

    callback?.({
      ok: true,
      settlements: game.getAvailableSettlementSpots(userId),
      roads: game.getAvailableRoadSpots(userId),
    });
  });
}

export function emitGameState(io: Server, roomId: string) {
  const game = activeGames.get(roomId);
  if (!game) return;

  const snapshot = game.toSnapshot();

  // Emit to each player individually (filter resources — only show own)
  const sockets = io.sockets.adapter.rooms.get(roomId);
  if (!sockets) return;

  for (const socketId of sockets) {
    const s = io.sockets.sockets.get(socketId);
    if (!s) continue;
    const sUserId = (s as any).userId;

    // Build per-player view: hide other players' resource counts
    const playerView = { ...snapshot };
    const filteredPlayers: typeof snapshot.players = {};
    for (const [pid, pdata] of Object.entries(snapshot.players)) {
      if (pid === sUserId) {
        filteredPlayers[pid] = pdata;
      } else {
        filteredPlayers[pid] = {
          ...pdata,
          resources: { wood: -1, wool: -1, wheat: -1, brick: -1, ore: -1 }, // hidden
        };
      }
    }
    playerView.players = filteredPlayers;

    // Include available spots only for the current player
    const availableSpots: { availableSettlements?: string[]; availableRoads?: string[] } = {};
    if (sUserId === game.currentPlayerId) {
      availableSpots.availableSettlements = game.getAvailableSettlementSpots(sUserId);
      availableSpots.availableRoads = game.getAvailableRoadSpots(sUserId);
    }

    s.emit('game_state_update', { ...playerView, ...availableSpots });
  }
}

