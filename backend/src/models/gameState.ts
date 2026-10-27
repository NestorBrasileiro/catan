import { randomInt } from 'crypto';
import { BoardData, RESOURCES, ResourceType, TERRAIN_TO_RESOURCE } from '../utils/boardGenerator';
import { BoardGraph, buildBoardGraph } from '../utils/boardGraph';

export type GamePhase = 'setup' | 'playing' | 'finished';
// What the current player has to do next
export type TurnStep = 'place_settlement' | 'place_road' | 'roll' | 'main';
export type BuildingType = 'settlement' | 'city';
export type Resources = Record<ResourceType, number>;

export type GameAction =
  | { type: 'build_settlement'; vertexKey: string }
  | { type: 'build_road'; edgeKey: string }
  | { type: 'build_city'; vertexKey: string }
  | { type: 'roll_dice' }
  | { type: 'end_turn' };

export const COSTS = {
  road: { wood: 1, brick: 1 },
  settlement: { wood: 1, brick: 1, wool: 1, wheat: 1 },
  city: { wheat: 2, ore: 3 },
} satisfies Record<string, Partial<Resources>>;

export const PIECE_LIMITS = { road: 15, settlement: 5, city: 4 };
export const BANK_SIZE = 19;
export const POINTS_TO_WIN = 10;

const STEP_HINT: Record<TurnStep, string> = {
  place_settlement: 'Coloque uma aldeia primeiro.',
  place_road: 'Coloque uma estrada primeiro.',
  roll: 'Role os dados primeiro.',
  main: 'Os dados já foram rolados.',
};

interface Building {
  owner: string;
  type: BuildingType;
}

interface PlayerState {
  color: string;
  resources: Resources;
}

export interface PlayerView {
  color: string;
  victoryPoints: number;
  resourceCount: number;
  resources: Resources | null; // only filled for the viewer's own hand
  piecesLeft: { road: number; settlement: number; city: number };
}

export interface LegalMoves {
  settlements: string[];
  roads: string[];
  cities: string[];
}

export interface GameView {
  phase: GamePhase;
  step: TurnStep;
  setupRound: 1 | 2;
  currentPlayerId: string;
  playerOrder: string[];
  players: Record<string, PlayerView>;
  buildings: Record<string, Building>; // vertexKey → building
  roads: Record<string, string>;       // edgeKey → userId
  robberHex: string;                   // "q,r"
  dice: [number, number] | null;
  winnerId: string | null;
  legal: LegalMoves | null;            // only for the current player
}

function resources(amount: number): Resources {
  return { wood: amount, brick: amount, wool: amount, wheat: amount, ore: amount };
}

function rollTwoDice(): [number, number] {
  return [randomInt(1, 7), randomInt(1, 7)];
}

export class GameState {
  phase: GamePhase = 'setup';
  step: TurnStep = 'place_settlement';
  setupRound: 1 | 2 = 1;
  currentPlayerIndex = 0;
  readonly playerOrder: string[];
  readonly players = new Map<string, PlayerState>();
  readonly board: BoardData;
  readonly graph: BoardGraph;
  readonly buildings = new Map<string, Building>();
  readonly roads = new Map<string, string>();
  readonly bank: Resources = resources(BANK_SIZE);
  robberHex: string;
  dice: [number, number] | null = null;
  winnerId: string | null = null;
  private lastPlacedSettlement: string | null = null; // setup: the road must touch it

  constructor(
    board: BoardData,
    playerInfos: { userId: string; color: string }[],
    private readonly rollDice: () => [number, number] = rollTwoDice,
  ) {
    this.board = board;
    this.graph = buildBoardGraph(board.hexes);
    this.playerOrder = playerInfos.map(p => p.userId);
    for (const p of playerInfos) {
      this.players.set(p.userId, { color: p.color, resources: resources(0) });
    }
    const desert = board.hexes.find(h => h.terrain === 'desert')!;
    this.robberHex = `${desert.q},${desert.r}`;
  }

  get currentPlayerId(): string {
    return this.playerOrder[this.currentPlayerIndex];
  }

  // Single entry point for every player action. Returns an error message, or null on success.
  apply(userId: string, action: GameAction): string | null {
    if (this.phase === 'finished') return 'O jogo já terminou.';
    if (userId !== this.currentPlayerId) return 'Não é a sua vez.';

    switch (action?.type) {
      case 'build_settlement': return this.buildSettlement(userId, action.vertexKey);
      case 'build_road': return this.buildRoad(userId, action.edgeKey);
      case 'build_city': return this.buildCity(userId, action.vertexKey);
      case 'roll_dice': return this.roll();
      case 'end_turn': return this.endTurn();
      default: return 'Ação inválida.';
    }
  }

  // ===== SETTLEMENTS =====

  private settlementError(userId: string, vertexKey: string): string | null {
    const stepError = this.stepError(this.phase === 'setup' ? 'place_settlement' : 'main');
    if (stepError) return stepError;

    const vertex = this.graph.vertices.get(vertexKey);
    if (!vertex) return 'Posição inválida.';
    if (this.buildings.has(vertexKey)) return 'Já existe uma construção aqui.';
    if (vertex.adjacentVertexKeys.some(k => this.buildings.has(k))) {
      return 'Viola a regra de distância (construção adjacente).';
    }
    if (this.phase === 'setup') return null;

    if (!vertex.adjacentEdgeKeys.some(e => this.roads.get(e) === userId)) {
      return 'A aldeia precisa estar ligada a uma estrada sua.';
    }
    if (this.countBuildings(userId, 'settlement') >= PIECE_LIMITS.settlement) {
      return 'Você não tem mais aldeias disponíveis.';
    }
    if (!this.canAfford(userId, COSTS.settlement)) return 'Recursos insuficientes.';
    return null;
  }

  private buildSettlement(userId: string, vertexKey: string): string | null {
    const err = this.settlementError(userId, vertexKey);
    if (err) return err;

    if (this.phase === 'setup') {
      this.buildings.set(vertexKey, { owner: userId, type: 'settlement' });
      this.lastPlacedSettlement = vertexKey;
      this.step = 'place_road';
      return null;
    }

    this.pay(userId, COSTS.settlement);
    this.buildings.set(vertexKey, { owner: userId, type: 'settlement' });
    this.checkVictory(userId);
    return null;
  }

  // ===== ROADS =====

  private roadError(userId: string, edgeKey: string): string | null {
    const stepError = this.stepError(this.phase === 'setup' ? 'place_road' : 'main');
    if (stepError) return stepError;

    const edge = this.graph.edges.get(edgeKey);
    if (!edge) return 'Caminho inválido.';
    if (this.roads.has(edgeKey)) return 'Já existe uma estrada aqui.';

    if (this.phase === 'setup') {
      return edge.vertices.includes(this.lastPlacedSettlement!)
        ? null
        : 'A estrada deve ser adjacente à aldeia que acabou de colocar.';
    }

    if (!edge.vertices.some(v => this.roadNetworkReaches(userId, v))) {
      return 'A estrada precisa estar ligada a uma estrada ou construção sua.';
    }
    if (this.countRoads(userId) >= PIECE_LIMITS.road) return 'Você não tem mais estradas disponíveis.';
    if (!this.canAfford(userId, COSTS.road)) return 'Recursos insuficientes.';
    return null;
  }

  // A road can extend from a vertex with the player's own building, or from the player's
  // road ending there — unless an opponent's building sits on that vertex and cuts the way.
  private roadNetworkReaches(userId: string, vertexKey: string): boolean {
    const building = this.buildings.get(vertexKey);
    if (building) return building.owner === userId;
    const vertex = this.graph.vertices.get(vertexKey)!;
    return vertex.adjacentEdgeKeys.some(e => this.roads.get(e) === userId);
  }

  private buildRoad(userId: string, edgeKey: string): string | null {
    const err = this.roadError(userId, edgeKey);
    if (err) return err;

    if (this.phase === 'setup') {
      this.roads.set(edgeKey, userId);
      if (this.setupRound === 2) this.collectInitialResources(userId, this.lastPlacedSettlement!);
      this.lastPlacedSettlement = null;
      this.advanceSetupTurn();
      return null;
    }

    this.pay(userId, COSTS.road);
    this.roads.set(edgeKey, userId);
    return null;
  }

  // ===== CITIES =====

  private cityError(userId: string, vertexKey: string): string | null {
    if (this.phase === 'setup') return 'Cidades só depois da fase de fundação.';
    const stepError = this.stepError('main');
    if (stepError) return stepError;

    const building = this.buildings.get(vertexKey);
    if (building?.owner !== userId || building.type !== 'settlement') {
      return 'A cidade deve substituir uma aldeia sua.';
    }
    if (this.countBuildings(userId, 'city') >= PIECE_LIMITS.city) return 'Você não tem mais cidades disponíveis.';
    if (!this.canAfford(userId, COSTS.city)) return 'Recursos insuficientes.';
    return null;
  }

  private buildCity(userId: string, vertexKey: string): string | null {
    const err = this.cityError(userId, vertexKey);
    if (err) return err;

    this.pay(userId, COSTS.city);
    this.buildings.set(vertexKey, { owner: userId, type: 'city' });
    this.checkVictory(userId);
    return null;
  }

  // ===== TURN FLOW =====

  private roll(): string | null {
    const err = this.stepError('roll');
    if (err) return err;

    this.dice = this.rollDice();
    const sum = this.dice[0] + this.dice[1];
    // A 7 produces nothing; the robber's effects (discard, move, steal) are not in the game yet
    if (sum !== 7) this.produce(sum);
    this.step = 'main';
    return null;
  }

  private produce(sum: number) {
    const owed = new Map<ResourceType, Map<string, number>>();
    for (const hex of this.board.hexes) {
      const hexKey = `${hex.q},${hex.r}`;
      const resource = TERRAIN_TO_RESOURCE[hex.terrain];
      if (hex.number !== sum || !resource || hexKey === this.robberHex) continue;

      for (const vertexKey of this.graph.hexVertices.get(hexKey)!) {
        const building = this.buildings.get(vertexKey);
        if (!building) continue;
        const perPlayer = owed.get(resource) ?? new Map<string, number>();
        perPlayer.set(building.owner, (perPlayer.get(building.owner) ?? 0) + (building.type === 'city' ? 2 : 1));
        owed.set(resource, perPlayer);
      }
    }

    // Official rule: if the bank can't pay everyone a resource, nobody gets it,
    // unless only one player is owed it, who then takes whatever is left.
    for (const [resource, perPlayer] of owed) {
      const total = [...perPlayer.values()].reduce((a, b) => a + b, 0);
      if (total > this.bank[resource] && perPlayer.size > 1) continue;
      for (const [owner, amount] of perPlayer) {
        this.take(owner, resource, Math.min(amount, this.bank[resource]));
      }
    }
  }

  private endTurn(): string | null {
    const err = this.stepError('main');
    if (err) return err;

    this.currentPlayerIndex = (this.currentPlayerIndex + 1) % this.playerOrder.length;
    this.step = 'roll';
    return null;
  }

  // Setup order is 1-2-3-4 then 4-3-2-1; the first player then opens the game
  private advanceSetupTurn() {
    const n = this.playerOrder.length;
    this.step = 'place_settlement';

    if (this.setupRound === 1) {
      if (this.currentPlayerIndex < n - 1) this.currentPlayerIndex++;
      else this.setupRound = 2; // the last player places again
      return;
    }

    if (this.currentPlayerIndex > 0) {
      this.currentPlayerIndex--;
    } else {
      this.phase = 'playing';
      this.step = 'roll';
    }
  }

  private collectInitialResources(userId: string, vertexKey: string) {
    for (const hexKey of this.graph.vertices.get(vertexKey)!.adjacentHexKeys) {
      const hex = this.board.hexes.find(h => `${h.q},${h.r}` === hexKey)!;
      const resource = TERRAIN_TO_RESOURCE[hex.terrain];
      if (resource) this.take(userId, resource, 1);
    }
  }

  private checkVictory(userId: string) {
    if (this.victoryPoints(userId) >= POINTS_TO_WIN) {
      this.phase = 'finished';
      this.winnerId = userId;
    }
  }

  // ===== HELPERS =====

  private stepError(expected: TurnStep): string | null {
    return this.step === expected ? null : STEP_HINT[this.step];
  }

  private canAfford(userId: string, cost: Partial<Resources>): boolean {
    const hand = this.players.get(userId)!.resources;
    return RESOURCES.every(r => hand[r] >= (cost[r] ?? 0));
  }

  private pay(userId: string, cost: Partial<Resources>) {
    const hand = this.players.get(userId)!.resources;
    for (const r of RESOURCES) {
      hand[r] -= cost[r] ?? 0;
      this.bank[r] += cost[r] ?? 0;
    }
  }

  private take(userId: string, resource: ResourceType, amount: number) {
    this.bank[resource] -= amount;
    this.players.get(userId)!.resources[resource] += amount;
  }

  private countBuildings(userId: string, type: BuildingType): number {
    let count = 0;
    for (const b of this.buildings.values()) if (b.owner === userId && b.type === type) count++;
    return count;
  }

  private countRoads(userId: string): number {
    let count = 0;
    for (const owner of this.roads.values()) if (owner === userId) count++;
    return count;
  }

  victoryPoints(userId: string): number {
    return this.countBuildings(userId, 'settlement') + 2 * this.countBuildings(userId, 'city');
  }

  legalMoves(userId: string): LegalMoves {
    const vertices = [...this.graph.vertices.keys()];
    return {
      settlements: vertices.filter(v => !this.settlementError(userId, v)),
      cities: vertices.filter(v => !this.cityError(userId, v)),
      roads: [...this.graph.edges.keys()].filter(e => !this.roadError(userId, e)),
    };
  }

  // What one player is allowed to see: other players' hands are reduced to a card count
  toView(viewerId: string): GameView {
    const players: Record<string, PlayerView> = {};
    for (const [id, p] of this.players) {
      players[id] = {
        color: p.color,
        victoryPoints: this.victoryPoints(id),
        resourceCount: RESOURCES.reduce((sum, r) => sum + p.resources[r], 0),
        resources: id === viewerId ? { ...p.resources } : null,
        piecesLeft: {
          road: PIECE_LIMITS.road - this.countRoads(id),
          settlement: PIECE_LIMITS.settlement - this.countBuildings(id, 'settlement'),
          city: PIECE_LIMITS.city - this.countBuildings(id, 'city'),
        },
      };
    }

    const isActivePlayer = viewerId === this.currentPlayerId && this.phase !== 'finished';
    return {
      phase: this.phase,
      step: this.step,
      setupRound: this.setupRound,
      currentPlayerId: this.currentPlayerId,
      playerOrder: [...this.playerOrder],
      players,
      buildings: Object.fromEntries([...this.buildings].map(([k, b]) => [k, { ...b }])),
      roads: Object.fromEntries(this.roads),
      robberHex: this.robberHex,
      dice: this.dice,
      winnerId: this.winnerId,
      legal: isActivePlayer ? this.legalMoves(viewerId) : null,
    };
  }
}

// Active games live in memory, keyed by room id
export const activeGames = new Map<string, GameState>();
