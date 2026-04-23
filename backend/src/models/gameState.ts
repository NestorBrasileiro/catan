import { BoardData, HexTile, ResourceType, TERRAIN_TO_RESOURCE } from '../utils/boardGenerator';
import { BoardGraph, buildBoardGraph, parseVertexKey } from '../utils/boardGraph';

export type GamePhase = 'setup' | 'playing' | 'finished';
export type SetupStep = 'settlement' | 'road';

interface PlayerState {
  userId: string;
  color: string;
  resources: Record<ResourceType, number>;
  settlements: string[];   // vertex keys
  cities: string[];        // vertex keys
  roads: string[];         // edge keys
  victoryPoints: number;
}

export interface GameStateSnapshot {
  phase: GamePhase;
  setupRound: number;
  setupStep: SetupStep;
  currentPlayerId: string;
  playerOrder: string[];
  players: Record<string, {
    color: string;
    resources: Record<ResourceType, number>;
    settlements: string[];
    cities: string[];
    roads: string[];
    victoryPoints: number;
  }>;
  settlements: Record<string, string>;  // vertexKey → userId
  roads: Record<string, string>;        // edgeKey → userId
}

const EMPTY_RESOURCES: Record<ResourceType, number> = {
  wood: 0, wool: 0, wheat: 0, brick: 0, ore: 0,
};

export class GameState {
  roomId: string;
  phase: GamePhase = 'setup';
  setupRound: 1 | 2 = 1;
  setupStep: SetupStep = 'settlement';
  currentPlayerIndex: number = 0;
  playerOrder: string[] = [];
  players: Map<string, PlayerState> = new Map();
  board: BoardData;
  graph: BoardGraph;
  settlements: Map<string, string> = new Map(); // vertexKey → userId
  roads: Map<string, string> = new Map();       // edgeKey → userId
  lastPlacedSettlement: string | null = null;    // for setup: road must be adjacent

  constructor(roomId: string, board: BoardData, playerInfos: { userId: string; color: string }[]) {
    this.roomId = roomId;
    this.board = board;
    this.graph = buildBoardGraph(board.hexes.map(h => ({ q: h.q, r: h.r })));
    this.playerOrder = playerInfos.map(p => p.userId);

    for (const p of playerInfos) {
      this.players.set(p.userId, {
        userId: p.userId,
        color: p.color,
        resources: { ...EMPTY_RESOURCES },
        settlements: [],
        cities: [],
        roads: [],
        victoryPoints: 0,
      });
    }
  }

  get currentPlayerId(): string {
    return this.playerOrder[this.currentPlayerIndex];
  }

  // ===== SETUP PHASE: BUILD SETTLEMENT =====
  canBuildSettlement(userId: string, vertexKey: string): string | null {
    if (this.phase !== 'setup') return 'Não está na fase de fundação.';
    if (userId !== this.currentPlayerId) return 'Não é a sua vez.';
    if (this.setupStep !== 'settlement') return 'Coloque uma estrada primeiro.';

    const vertex = this.graph.vertices.get(vertexKey);
    if (!vertex) return 'Posição inválida.';
    if (this.settlements.has(vertexKey)) return 'Já existe uma aldeia aqui.';

    // Distance rule: no settlement on adjacent vertices
    for (const adjKey of vertex.adjacentVertexKeys) {
      if (this.settlements.has(adjKey)) {
        return 'Viola a regra de distância (aldeia adjacente).';
      }
    }

    return null; // valid
  }

  buildSettlement(userId: string, vertexKey: string): string | null {
    const err = this.canBuildSettlement(userId, vertexKey);
    if (err) return err;

    this.settlements.set(vertexKey, userId);
    const player = this.players.get(userId)!;
    player.settlements.push(vertexKey);
    player.victoryPoints += 1;
    this.lastPlacedSettlement = vertexKey;
    this.setupStep = 'road';

    return null;
  }

  // ===== SETUP PHASE: BUILD ROAD =====
  canBuildRoad(userId: string, edgeKey: string): string | null {
    if (this.phase !== 'setup') return 'Não está na fase de fundação.';
    if (userId !== this.currentPlayerId) return 'Não é a sua vez.';
    if (this.setupStep !== 'road') return 'Coloque uma aldeia primeiro.';

    const edge = this.graph.edges.get(edgeKey);
    if (!edge) return 'Caminho inválido.';
    if (this.roads.has(edgeKey)) return 'Já existe uma estrada aqui.';

    // During setup, road must be adjacent to the settlement just placed
    if (this.lastPlacedSettlement) {
      const [v1, v2] = edge.vertices;
      if (v1 !== this.lastPlacedSettlement && v2 !== this.lastPlacedSettlement) {
        return 'A estrada deve ser adjacente à aldeia que acabou de colocar.';
      }
    }

    return null;
  }

  buildRoad(userId: string, edgeKey: string): string | null {
    const err = this.canBuildRoad(userId, edgeKey);
    if (err) return err;

    this.roads.set(edgeKey, userId);
    const player = this.players.get(userId)!;
    player.roads.push(edgeKey);

    // If setup round 2, give resources from 2nd settlement
    if (this.setupRound === 2 && this.lastPlacedSettlement) {
      this.giveInitialResources(userId, this.lastPlacedSettlement);
    }

    this.lastPlacedSettlement = null;
    this.advanceSetupTurn();
    return null;
  }

  private giveInitialResources(userId: string, vertexKey: string) {
    const vertex = this.graph.vertices.get(vertexKey);
    if (!vertex) return;

    const player = this.players.get(userId)!;
    for (const hexKey of vertex.adjacentHexKeys) {
      const hex = this.board.hexes.find(h => `${h.q},${h.r}` === hexKey);
      if (hex && hex.terrain !== 'desert') {
        const resource = TERRAIN_TO_RESOURCE[hex.terrain];
        if (resource) {
          player.resources[resource] += 1;
        }
      }
    }
  }

  private advanceSetupTurn() {
    const n = this.playerOrder.length;

    if (this.setupRound === 1) {
      // Forward: 0 → 1 → 2 → ... → n-1
      if (this.currentPlayerIndex < n - 1) {
        this.currentPlayerIndex++;
      } else {
        // Switch to round 2 (reverse), same player goes again
        this.setupRound = 2;
      }
    } else {
      // Reverse: n-1 → n-2 → ... → 0
      if (this.currentPlayerIndex > 0) {
        this.currentPlayerIndex--;
      } else {
        // Setup complete! Transition to playing phase
        this.phase = 'playing';
        this.currentPlayerIndex = 0;
      }
    }

    this.setupStep = 'settlement';
  }

  // ===== SNAPSHOT (sent to clients) =====
  toSnapshot(): GameStateSnapshot {
    const playersObj: GameStateSnapshot['players'] = {};
    for (const [id, p] of this.players) {
      playersObj[id] = {
        color: p.color,
        resources: { ...p.resources },
        settlements: [...p.settlements],
        cities: [...p.cities],
        roads: [...p.roads],
        victoryPoints: p.victoryPoints,
      };
    }

    return {
      phase: this.phase,
      setupRound: this.setupRound,
      setupStep: this.setupStep,
      currentPlayerId: this.currentPlayerId,
      playerOrder: [...this.playerOrder],
      players: playersObj,
      settlements: Object.fromEntries(this.settlements),
      roads: Object.fromEntries(this.roads),
    };
  }

  // Get available vertices for current player to build settlement
  getAvailableSettlementSpots(userId: string): string[] {
    if (userId !== this.currentPlayerId || this.setupStep !== 'settlement') return [];
    const spots: string[] = [];
    for (const [key] of this.graph.vertices) {
      if (!this.canBuildSettlement(userId, key)) {
        spots.push(key);
      }
    }
    return spots;
  }

  // Get available edges for current player to build road
  getAvailableRoadSpots(userId: string): string[] {
    if (userId !== this.currentPlayerId || this.setupStep !== 'road') return [];
    const spots: string[] = [];
    for (const [key] of this.graph.edges) {
      if (!this.canBuildRoad(userId, key)) {
        spots.push(key);
      }
    }
    return spots;
  }
}

// Store active games in memory
export const activeGames = new Map<string, GameState>();

