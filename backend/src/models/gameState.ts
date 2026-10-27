import { randomInt } from 'crypto';
import { BoardData, PortType, RESOURCES, ResourceType, TERRAIN_TO_RESOURCE } from '../utils/boardGenerator';
import { BoardGraph, buildBoardGraph } from '../utils/boardGraph';
import { longestRoad } from '../utils/longestRoad';

export type GamePhase = 'setup' | 'playing' | 'finished';
// What has to happen next. 'discard' waits on every player who owes cards, not only the current one.
export type TurnStep =
  | 'place_settlement' | 'place_road' | 'roll' | 'discard' | 'move_robber' | 'steal' | 'road_building' | 'main';
export type BuildingType = 'settlement' | 'city';
export type Resources = Record<ResourceType, number>;
export type DevCardType = 'knight' | 'victory_point' | 'road_building' | 'year_of_plenty' | 'monopoly';
export type PlayableDevCard = Exclude<DevCardType, 'victory_point'>; // point cards are never "played"
export type DevCards = Record<DevCardType, number>;

export type GameAction =
  | { type: 'build_settlement'; vertexKey: string }
  | { type: 'build_road'; edgeKey: string }
  | { type: 'build_city'; vertexKey: string }
  | { type: 'roll_dice' }
  | { type: 'discard'; resources: Partial<Resources> }
  | { type: 'move_robber'; hexKey: string }
  | { type: 'steal'; victimId: string }
  | { type: 'bank_trade'; give: ResourceType; get: ResourceType }
  | { type: 'propose_trade'; give: Partial<Resources>; get: Partial<Resources> }
  | { type: 'respond_trade'; accept: boolean }
  | { type: 'confirm_trade'; partnerId: string }
  | { type: 'cancel_trade' }
  | { type: 'buy_dev_card' }
  | { type: 'play_knight' }
  | { type: 'play_road_building' }
  | { type: 'play_year_of_plenty'; resources: [ResourceType, ResourceType] }
  | { type: 'play_monopoly'; resource: ResourceType }
  | { type: 'end_turn' };

export const COSTS = {
  road: { wood: 1, brick: 1 },
  settlement: { wood: 1, brick: 1, wool: 1, wheat: 1 },
  city: { wheat: 2, ore: 3 },
  devCard: { wool: 1, wheat: 1, ore: 1 },
} satisfies Record<string, Partial<Resources>>;

export const DEV_DECK: DevCards = { knight: 14, victory_point: 5, road_building: 2, year_of_plenty: 2, monopoly: 2 };
const PLAYABLE_DEV_CARDS: PlayableDevCard[] = ['knight', 'road_building', 'year_of_plenty', 'monopoly'];
export const LARGEST_ARMY_MIN = 3;
export const LONGEST_ROAD_MIN = 5;
const AWARD_POINTS = 2;

export const PIECE_LIMITS = { road: 15, settlement: 5, city: 4 };
export const BANK_SIZE = 19;
export const POINTS_TO_WIN = 10;
export const MAX_SAFE_HAND = 7; // on a 7, bigger hands lose half

const STEP_HINT: Record<TurnStep, string> = {
  place_settlement: 'Coloque uma aldeia primeiro.',
  place_road: 'Coloque uma estrada primeiro.',
  roll: 'Role os dados primeiro.',
  discard: 'Aguardando os jogadores descartarem.',
  move_robber: 'Mova o ladrão primeiro.',
  steal: 'Escolha de quem roubar primeiro.',
  road_building: 'Coloque as estradas grátis primeiro.',
  main: 'Os dados já foram rolados.',
};

interface Building {
  owner: string;
  type: BuildingType;
}

interface PlayerState {
  color: string;
  resources: Resources;
  devCards: DevCards;
  newDevCards: DevCards; // bought this turn: can't be played until the next one
  knightsPlayed: number;
}

export interface PlayerView {
  color: string;
  victoryPoints: number;       // others only see public points; hidden point cards count for yourself
  resourceCount: number;
  resources: Resources | null; // only filled for the viewer's own hand
  piecesLeft: { road: number; settlement: number; city: number };
  devCardCount: number;
  devCards: DevCards | null;   // own cards only
  newDevCards: DevCards | null;
  knightsPlayed: number;
  roadLength: number;
}

export interface LegalMoves {
  settlements: string[];
  roads: string[];
  cities: string[];
  robberHexes: string[];
  victims: string[];
  bankRatios: Resources; // cards of each kind needed for 1 from the bank (4, or 3/2 with ports)
  canBuyDevCard: boolean;
  devCardsToPlay: PlayableDevCard[];
}

// The current player's open offer to the table
interface TradeOffer {
  give: Resources;
  get: Resources;
  responses: Map<string, 'accepted' | 'declined'>;
}

export interface TradeOfferView {
  give: Resources;
  get: Resources;
  responses: Record<string, 'accepted' | 'declined'>;
}

interface Robbery {
  thiefId: string;
  victimId: string;
  resource: ResourceType | null; // hidden from everyone but thief and victim
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
  bank: Resources;                     // public, like the card piles on the table
  dice: [number, number] | null;
  winnerId: string | null;
  discards: Record<string, number>;    // userId → cards still owed after a 7
  lastRobbery: Robbery | null;
  tradeOffer: TradeOfferView | null;   // public, like an offer made out loud at the table
  devDeckCount: number;
  devCardPlayed: boolean;              // the current player already used their one card this turn
  freeRoadsLeft: number;               // during Road Building
  largestArmyHolder: string | null;
  longestRoadHolder: string | null;
  leftPlayers: string[];               // gave up the game: their turns are skipped
  legal: LegalMoves | null;            // only for the current player
}

function resources(amount: number): Resources {
  return { wood: amount, brick: amount, wool: amount, wheat: amount, ore: amount };
}

function handSize(hand: Resources): number {
  return RESOURCES.reduce((sum, r) => sum + hand[r], 0);
}

// Reads a client-sent card selection; null if anything isn't a non-negative integer
function parseCards(cards: unknown): Resources | null {
  if (typeof cards !== 'object' || cards === null) return null;
  const parsed = resources(0);
  for (const r of RESOURCES) {
    const n = (cards as Record<string, unknown>)[r] ?? 0;
    if (!Number.isInteger(n) || (n as number) < 0) return null;
    parsed[r] = n as number;
  }
  return parsed;
}

function noDevCards(): DevCards {
  return { knight: 0, victory_point: 0, road_building: 0, year_of_plenty: 0, monopoly: 0 };
}

function shuffledDeck(): DevCardType[] {
  const deck = (Object.keys(DEV_DECK) as DevCardType[]).flatMap(card => Array<DevCardType>(DEV_DECK[card]).fill(card));
  for (let i = deck.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

function rollTwoDice(): [number, number] {
  return [randomInt(1, 7), randomInt(1, 7)];
}

export class GameState {
  phase: GamePhase = 'setup';
  step: TurnStep = 'place_settlement';
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
  readonly pendingDiscards = new Map<string, number>();
  lastRobbery: Robbery | null = null;
  tradeOffer: TradeOffer | null = null;
  readonly ports = new Map<string, PortType>(); // vertexKey → port it gives access to
  devDeck: DevCardType[] = shuffledDeck(); // drawn from the end
  devCardPlayed = false;
  freeRoadsLeft = 0;
  largestArmyHolder: string | null = null;
  longestRoadHolder: string | null = null;
  readonly leftPlayers = new Set<string>();
  private setupTurn = 0; // walks the player order forward, then backward
  private lastPlacedSettlement: string | null = null; // setup: the road must touch it
  private resumeStep: TurnStep = 'main'; // where the turn continues after the robber or Road Building

  constructor(
    board: BoardData,
    playerInfos: { userId: string; color: string }[],
    private readonly rollDice: () => [number, number] = rollTwoDice,
  ) {
    this.board = board;
    this.graph = buildBoardGraph(board.hexes);
    this.playerOrder = playerInfos.map(p => p.userId);
    for (const p of playerInfos) {
      this.players.set(p.userId, {
        color: p.color, resources: resources(0), devCards: noDevCards(), newDevCards: noDevCards(), knightsPlayed: 0,
      });
    }
    const desert = board.hexes.find(h => h.terrain === 'desert')!;
    this.robberHex = `${desert.q},${desert.r}`;
    for (const port of board.ports) {
      const corners = this.graph.hexVertices.get(`${port.hexQ},${port.hexR}`)!;
      this.ports.set(corners[port.edgeDir], port.type);
      this.ports.set(corners[(port.edgeDir + 1) % 6], port.type);
    }
  }

  get currentPlayerId(): string {
    return this.playerOrder[this.currentPlayerIndex];
  }

  get setupRound(): 1 | 2 {
    return this.setupTurn < this.playerOrder.length ? 1 : 2;
  }

  // Single entry point for every player action. Returns an error message, or null on success.
  apply(userId: string, action: GameAction): string | null {
    if (this.phase === 'finished') return 'O jogo já terminou.';
    if (this.leftPlayers.has(userId)) return 'Você saiu da partida.';
    const err = this.dispatch(userId, action);
    // A player wins the moment they have 10 points during their own turn (hidden points included),
    // which also covers starting a turn with points gained during someone else's
    if (!err && this.phase === 'playing') this.checkVictory(this.currentPlayerId);
    return err;
  }

  private dispatch(userId: string, action: GameAction): string | null {
    // Discarding after a 7 and answering a trade offer are the actions taken outside one's own turn
    if (action?.type === 'discard') return this.discard(userId, action.resources);
    if (action?.type === 'respond_trade') return this.respondTrade(userId, action.accept);
    if (userId !== this.currentPlayerId) return 'Não é a sua vez.';

    switch (action?.type) {
      case 'build_settlement': return this.buildSettlement(userId, action.vertexKey);
      case 'build_road': return this.buildRoad(userId, action.edgeKey);
      case 'build_city': return this.buildCity(userId, action.vertexKey);
      case 'roll_dice': return this.roll();
      case 'move_robber': return this.moveRobber(userId, action.hexKey);
      case 'steal': return this.steal(userId, action.victimId);
      case 'bank_trade': return this.bankTrade(userId, action.give, action.get);
      case 'propose_trade': return this.proposeTrade(userId, action.give, action.get);
      case 'confirm_trade': return this.confirmTrade(userId, action.partnerId);
      case 'cancel_trade': return this.cancelTrade();
      case 'buy_dev_card': return this.buyDevCard(userId);
      case 'play_knight': return this.playKnight(userId);
      case 'play_road_building': return this.playRoadBuilding(userId);
      case 'play_year_of_plenty': return this.playYearOfPlenty(userId, action.resources);
      case 'play_monopoly': return this.playMonopoly(userId, action.resource);
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
    this.updateLongestRoad(); // may cut an opponent's road
    return null;
  }

  // ===== ROADS =====

  // `free`: placed by Road Building, so no cost and no need to be in the main step
  private roadError(userId: string, edgeKey: string, free = this.step === 'road_building'): string | null {
    if (!free) {
      const stepError = this.stepError(this.phase === 'setup' ? 'place_road' : 'main');
      if (stepError) return stepError;
    }

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
    if (!free && !this.canAfford(userId, COSTS.road)) return 'Recursos insuficientes.';
    return null;
  }

  private freeRoadSpots(userId: string): string[] {
    return [...this.graph.edges.keys()].filter(e => !this.roadError(userId, e, true));
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

    if (this.step === 'road_building') {
      this.roads.set(edgeKey, userId);
      this.freeRoadsLeft--;
      if (this.freeRoadsLeft === 0 || this.freeRoadSpots(userId).length === 0) {
        this.freeRoadsLeft = 0;
        this.step = this.resumeStep;
      }
    } else {
      this.pay(userId, COSTS.road);
      this.roads.set(edgeKey, userId);
    }
    this.updateLongestRoad();
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
    return null;
  }

  // ===== TURN FLOW =====

  private roll(): string | null {
    const err = this.stepError('roll');
    if (err) return err;

    this.dice = this.rollDice();
    const sum = this.dice[0] + this.dice[1];
    if (sum === 7) {
      this.startRobber();
    } else {
      this.produce(sum);
      this.step = 'main';
    }
    return null;
  }

  // ===== ROBBER (a 7 was rolled) =====

  private startRobber() {
    for (const [id, p] of this.players) {
      const size = handSize(p.resources);
      if (size > MAX_SAFE_HAND) this.pendingDiscards.set(id, Math.floor(size / 2));
    }
    this.resumeStep = 'main';
    this.step = this.pendingDiscards.size > 0 ? 'discard' : 'move_robber';
  }

  private discard(userId: string, cards: unknown): string | null {
    if (this.step !== 'discard') return 'Não há descarte pendente.';
    const owed = this.pendingDiscards.get(userId);
    if (!owed) return 'Você não precisa descartar.';

    const chosen = parseCards(cards);
    if (!chosen) return 'Cartas inválidas.';
    if (handSize(chosen) !== owed) return `Descarte exatamente ${owed} cartas.`;
    if (!this.canAfford(userId, chosen)) return 'Você não tem essas cartas.';

    this.pay(userId, chosen);
    this.pendingDiscards.delete(userId);
    if (this.pendingDiscards.size === 0) this.step = 'move_robber';
    return null;
  }

  private moveRobber(userId: string, hexKey: string): string | null {
    const err = this.stepError('move_robber');
    if (err) return err;
    if (!this.graph.hexVertices.has(hexKey)) return 'Hexágono inválido.';
    if (hexKey === this.robberHex) return 'O ladrão precisa mudar de lugar.';

    this.robberHex = hexKey;
    const victims = this.robberVictims(userId);
    if (victims.length === 1) this.stealFrom(userId, victims[0]);
    this.step = victims.length > 1 ? 'steal' : this.resumeStep;
    return null;
  }

  private steal(userId: string, victimId: string): string | null {
    const err = this.stepError('steal');
    if (err) return err;
    if (!this.robberVictims(userId).includes(victimId)) return 'Não é possível roubar desse jogador.';

    this.stealFrom(userId, victimId);
    this.step = this.resumeStep;
    return null;
  }

  // Opponents with a building on the robber's hex and at least one card
  private robberVictims(userId: string): string[] {
    const victims = new Set<string>();
    for (const vertexKey of this.graph.hexVertices.get(this.robberHex)!) {
      const owner = this.buildings.get(vertexKey)?.owner;
      if (owner && owner !== userId && handSize(this.players.get(owner)!.resources) > 0) victims.add(owner);
    }
    return [...victims];
  }

  // Takes one card at random, as if drawn face down from the victim's hand
  private stealFrom(thiefId: string, victimId: string) {
    const hand = this.players.get(victimId)!.resources;
    const cards = RESOURCES.flatMap(r => Array<ResourceType>(hand[r]).fill(r));
    const resource = cards[randomInt(cards.length)];
    hand[resource]--;
    this.players.get(thiefId)!.resources[resource]++;
    this.lastRobbery = { thiefId, victimId, resource };
  }

  private produce(sum: number) {
    const owed = new Map<ResourceType, Map<string, number>>();
    for (const hex of this.board.hexes) {
      const hexKey = `${hex.q},${hex.r}`;
      const resource = TERRAIN_TO_RESOURCE[hex.terrain];
      if (hex.number !== sum || !resource || hexKey === this.robberHex) continue;

      for (const vertexKey of this.graph.hexVertices.get(hexKey)!) {
        const building = this.buildings.get(vertexKey);
        if (!building || this.leftPlayers.has(building.owner)) continue;
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

  // ===== TRADE =====

  tradeRatios(userId: string): Resources {
    const ratios = resources(4);
    for (const [vertexKey, port] of this.ports) {
      if (this.buildings.get(vertexKey)?.owner !== userId) continue;
      if (port === '3:1') for (const r of RESOURCES) ratios[r] = Math.min(ratios[r], 3);
      else ratios[port] = 2;
    }
    return ratios;
  }

  private bankTrade(userId: string, give: ResourceType, get: ResourceType): string | null {
    const err = this.stepError('main');
    if (err) return err;
    if (!RESOURCES.includes(give) || !RESOURCES.includes(get)) return 'Recurso inválido.';
    if (give === get) return 'Escolha recursos diferentes.';

    const ratio = this.tradeRatios(userId)[give];
    if (!this.canAfford(userId, { [give]: ratio })) return `Você precisa de ${ratio} cartas para essa troca.`;
    if (this.bank[get] < 1) return 'O banco não tem mais esse recurso.';

    this.pay(userId, { [give]: ratio });
    this.take(userId, get, 1);
    return null;
  }

  private proposeTrade(userId: string, give: unknown, get: unknown): string | null {
    const err = this.stepError('main');
    if (err) return err;
    const offerGive = parseCards(give);
    const offerGet = parseCards(get);
    if (!offerGive || !offerGet) return 'Cartas inválidas.';
    if (handSize(offerGive) === 0 || handSize(offerGet) === 0) return 'A troca precisa ter cartas dos dois lados.';
    if (RESOURCES.some(r => offerGive[r] > 0 && offerGet[r] > 0)) return 'Não dá para trocar um recurso por ele mesmo.';
    if (!this.canAfford(userId, offerGive)) return 'Você não tem essas cartas.';

    this.tradeOffer = { give: offerGive, get: offerGet, responses: new Map() };
    return null;
  }

  private respondTrade(userId: string, accept: unknown): string | null {
    const offer = this.tradeOffer;
    if (!offer) return 'Não há oferta de troca.';
    if (userId === this.currentPlayerId) return 'A oferta é sua.';
    if (!this.players.has(userId)) return 'Jogador inválido.';
    if (accept === true && !this.canAfford(userId, offer.get)) return 'Você não tem as cartas pedidas.';

    offer.responses.set(userId, accept === true ? 'accepted' : 'declined');
    return null;
  }

  private confirmTrade(userId: string, partnerId: string): string | null {
    const err = this.stepError('main');
    if (err) return err;
    const offer = this.tradeOffer;
    if (!offer) return 'Não há oferta de troca.';
    if (offer.responses.get(partnerId) !== 'accepted') return 'Esse jogador não aceitou a troca.';
    if (!this.canAfford(userId, offer.give)) return 'Você não tem mais as cartas oferecidas.';
    if (!this.canAfford(partnerId, offer.get)) return 'O outro jogador não tem mais as cartas pedidas.';

    this.moveCards(userId, partnerId, offer.give);
    this.moveCards(partnerId, userId, offer.get);
    this.tradeOffer = null;
    return null;
  }

  private cancelTrade(): string | null {
    if (!this.tradeOffer) return 'Não há oferta de troca.';
    this.tradeOffer = null;
    return null;
  }

  private moveCards(fromId: string, toId: string, cards: Resources) {
    const from = this.players.get(fromId)!.resources;
    const to = this.players.get(toId)!.resources;
    for (const r of RESOURCES) {
      from[r] -= cards[r];
      to[r] += cards[r];
    }
  }

  // ===== DEVELOPMENT CARDS =====

  private buyDevCard(userId: string): string | null {
    const err = this.stepError('main');
    if (err) return err;
    if (this.devDeck.length === 0) return 'Não há mais cartas de desenvolvimento.';
    if (!this.canAfford(userId, COSTS.devCard)) return 'Recursos insuficientes.';

    this.pay(userId, COSTS.devCard);
    const card = this.devDeck.pop()!;
    const player = this.players.get(userId)!;
    player.devCards[card]++;
    player.newDevCards[card]++;
    return null;
  }

  // Rules shared by every card: on your turn before or after rolling, one per turn, not one bought this turn
  private devCardError(userId: string, card: PlayableDevCard): string | null {
    if (this.step !== 'roll' && this.step !== 'main') return 'Termine a ação atual antes de jogar uma carta.';
    if (this.devCardPlayed) return 'Só dá para jogar uma carta de desenvolvimento por turno.';
    const player = this.players.get(userId)!;
    if (player.devCards[card] === 0) return 'Você não tem essa carta.';
    if (player.devCards[card] === player.newDevCards[card]) {
      return 'Cartas compradas neste turno só podem ser jogadas a partir do próximo.';
    }
    return null;
  }

  private spendDevCard(userId: string, card: PlayableDevCard) {
    this.players.get(userId)!.devCards[card]--;
    this.devCardPlayed = true;
  }

  // Knight: move the robber and steal, as on a 7 but without discards
  private playKnight(userId: string): string | null {
    const err = this.devCardError(userId, 'knight');
    if (err) return err;

    this.spendDevCard(userId, 'knight');
    this.players.get(userId)!.knightsPlayed++;
    this.updateLargestArmy(userId);
    this.resumeStep = this.step;
    this.step = 'move_robber';
    return null;
  }

  private playRoadBuilding(userId: string): string | null {
    const err = this.devCardError(userId, 'road_building');
    if (err) return err;
    if (this.freeRoadSpots(userId).length === 0) return 'Não há onde construir estradas.';

    this.spendDevCard(userId, 'road_building');
    this.freeRoadsLeft = Math.min(2, PIECE_LIMITS.road - this.countRoads(userId));
    this.resumeStep = this.step;
    this.step = 'road_building';
    return null;
  }

  // Year of Plenty: any 2 resources from the bank
  private playYearOfPlenty(userId: string, picks: unknown): string | null {
    const err = this.devCardError(userId, 'year_of_plenty');
    if (err) return err;
    if (!Array.isArray(picks) || picks.length !== 2 || !picks.every(r => RESOURCES.includes(r))) {
      return 'Escolha 2 recursos.';
    }
    const wanted = resources(0);
    for (const r of picks as ResourceType[]) wanted[r]++;
    if (RESOURCES.some(r => this.bank[r] < wanted[r])) return 'O banco não tem esses recursos.';

    this.spendDevCard(userId, 'year_of_plenty');
    for (const r of RESOURCES) this.take(userId, r, wanted[r]);
    return null;
  }

  // Monopoly: every other player hands over all their cards of one resource
  private playMonopoly(userId: string, resource: unknown): string | null {
    const err = this.devCardError(userId, 'monopoly');
    if (err) return err;
    if (!RESOURCES.includes(resource as ResourceType)) return 'Recurso inválido.';

    this.spendDevCard(userId, 'monopoly');
    const r = resource as ResourceType;
    const hand = this.players.get(userId)!.resources;
    for (const [id, other] of this.players) {
      if (id === userId) continue;
      hand[r] += other.resources[r];
      other.resources[r] = 0;
    }
    return null;
  }

  // ===== AWARDS (2 points each) =====

  // First to 3 knights takes Largest Army; someone else needs strictly more to take it away
  private updateLargestArmy(userId: string) {
    const holder = this.largestArmyHolder;
    const toBeat = holder ? this.players.get(holder)!.knightsPlayed : LARGEST_ARMY_MIN - 1;
    if (holder !== userId && this.players.get(userId)!.knightsPlayed > toBeat) this.largestArmyHolder = userId;
  }

  // Runs after every road or settlement, since either can lengthen a road or cut one.
  // The holder keeps the card while still (tied for) the longest; otherwise it goes to a single
  // longest road of 5+, or is set aside when nobody qualifies or several players tie.
  private updateLongestRoad() {
    const lengths = new Map(this.playerOrder.map(id => [id, this.roadLength(id)]));
    const best = Math.max(...lengths.values());
    const holder = this.longestRoadHolder;
    if (holder && lengths.get(holder)! >= LONGEST_ROAD_MIN && lengths.get(holder) === best) return;

    const leaders = [...lengths].filter(([, length]) => length === best && length >= LONGEST_ROAD_MIN);
    this.longestRoadHolder = leaders.length === 1 ? leaders[0][0] : null;
  }

  roadLength(userId: string): number {
    return longestRoad(this.graph, this.roads, this.buildings, userId);
  }

  private endTurn(): string | null {
    const err = this.stepError('main');
    if (err) return err;
    this.nextTurn();
    return null;
  }

  // Hands the turn to the next player still in the game
  private nextTurn() {
    this.players.get(this.currentPlayerId)!.newDevCards = noDevCards();
    this.devCardPlayed = false;
    do {
      this.currentPlayerIndex = (this.currentPlayerIndex + 1) % this.playerOrder.length;
    } while (this.leftPlayers.has(this.currentPlayerId));
    this.step = 'roll';
    this.lastRobbery = null;
    this.tradeOffer = null;
  }

  // Setup order is 1-2-3-4 then 4-3-2-1 (skipping anyone who left); the first player then opens the game
  private advanceSetupTurn() {
    const n = this.playerOrder.length;
    const indexAt = (turn: number) => (turn < n ? turn : 2 * n - 1 - turn);
    this.step = 'place_settlement';
    do {
      this.setupTurn++;
    } while (this.setupTurn < 2 * n && this.leftPlayers.has(this.playerOrder[indexAt(this.setupTurn)]));

    if (this.setupTurn < 2 * n) {
      this.currentPlayerIndex = indexAt(this.setupTurn);
    } else {
      this.phase = 'playing';
      this.step = 'roll';
      this.currentPlayerIndex = this.playerOrder.findIndex(id => !this.leftPlayers.has(id));
    }
  }

  // ===== LEAVING =====

  // A player who gives up stays on the board, but their turns are skipped, their hand goes back
  // to the bank and they stop producing. The last player standing wins.
  leave(userId: string): string | null {
    if (!this.players.has(userId)) return 'Jogador inválido.';
    if (this.leftPlayers.has(userId)) return null;
    this.leftPlayers.add(userId);
    if (this.phase === 'finished') return null; // just leaving the table after the end

    this.pay(userId, { ...this.players.get(userId)!.resources }); // a copy: pay() empties the hand as it goes
    this.pendingDiscards.delete(userId);
    this.tradeOffer?.responses.delete(userId);

    const remaining = this.playerOrder.filter(id => !this.leftPlayers.has(id));
    if (remaining.length === 1) {
      this.phase = 'finished';
      this.winnerId = remaining[0];
      return null;
    }

    if (userId === this.currentPlayerId) {
      // Whatever the turn was in the middle of is dropped
      this.pendingDiscards.clear();
      this.freeRoadsLeft = 0;
      if (this.phase === 'setup') {
        this.lastPlacedSettlement = null;
        this.advanceSetupTurn();
      } else {
        this.nextTurn();
      }
    } else if (this.step === 'discard' && this.pendingDiscards.size === 0) {
      this.step = 'move_robber';
    }
    return null;
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

  // What everyone can see on the table
  publicVictoryPoints(userId: string): number {
    return this.countBuildings(userId, 'settlement')
      + 2 * this.countBuildings(userId, 'city')
      + (this.largestArmyHolder === userId ? AWARD_POINTS : 0)
      + (this.longestRoadHolder === userId ? AWARD_POINTS : 0);
  }

  victoryPoints(userId: string): number {
    return this.publicVictoryPoints(userId) + this.players.get(userId)!.devCards.victory_point;
  }

  legalMoves(userId: string): LegalMoves {
    const vertices = [...this.graph.vertices.keys()];
    return {
      settlements: vertices.filter(v => !this.settlementError(userId, v)),
      cities: vertices.filter(v => !this.cityError(userId, v)),
      roads: [...this.graph.edges.keys()].filter(e => !this.roadError(userId, e)),
      robberHexes: this.step === 'move_robber' ? [...this.graph.hexVertices.keys()].filter(h => h !== this.robberHex) : [],
      victims: this.step === 'steal' ? this.robberVictims(userId) : [],
      bankRatios: this.tradeRatios(userId),
      canBuyDevCard: this.step === 'main' && this.devDeck.length > 0 && this.canAfford(userId, COSTS.devCard),
      devCardsToPlay: PLAYABLE_DEV_CARDS.filter(card => !this.devCardError(userId, card)
        && (card !== 'road_building' || this.freeRoadSpots(userId).length > 0)),
    };
  }

  // What one player is allowed to see: other players' hands and development cards are reduced
  // to counts, and their hidden point cards stay hidden until the game ends
  toView(viewerId: string): GameView {
    const players: Record<string, PlayerView> = {};
    for (const [id, p] of this.players) {
      const own = id === viewerId;
      players[id] = {
        color: p.color,
        victoryPoints: own || this.phase === 'finished' ? this.victoryPoints(id) : this.publicVictoryPoints(id),
        resourceCount: handSize(p.resources),
        resources: own ? { ...p.resources } : null,
        piecesLeft: {
          road: PIECE_LIMITS.road - this.countRoads(id),
          settlement: PIECE_LIMITS.settlement - this.countBuildings(id, 'settlement'),
          city: PIECE_LIMITS.city - this.countBuildings(id, 'city'),
        },
        devCardCount: Object.values(p.devCards).reduce((a, b) => a + b, 0),
        devCards: own ? { ...p.devCards } : null,
        newDevCards: own ? { ...p.newDevCards } : null,
        knightsPlayed: p.knightsPlayed,
        roadLength: this.roadLength(id),
      };
    }

    const isActivePlayer = viewerId === this.currentPlayerId && this.phase !== 'finished';
    const robbery = this.lastRobbery;
    const seesStolenCard = robbery && (viewerId === robbery.thiefId || viewerId === robbery.victimId);
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
      bank: { ...this.bank },
      dice: this.dice,
      winnerId: this.winnerId,
      discards: Object.fromEntries(this.pendingDiscards),
      lastRobbery: robbery && { ...robbery, resource: seesStolenCard ? robbery.resource : null },
      tradeOffer: this.tradeOffer && {
        give: { ...this.tradeOffer.give },
        get: { ...this.tradeOffer.get },
        responses: Object.fromEntries(this.tradeOffer.responses),
      },
      devDeckCount: this.devDeck.length,
      devCardPlayed: this.devCardPlayed,
      freeRoadsLeft: this.freeRoadsLeft,
      largestArmyHolder: this.largestArmyHolder,
      longestRoadHolder: this.longestRoadHolder,
      leftPlayers: [...this.leftPlayers],
      legal: isActivePlayer ? this.legalMoves(viewerId) : null,
    };
  }
}

// Active games live in memory, keyed by room id
export const activeGames = new Map<string, GameState>();
