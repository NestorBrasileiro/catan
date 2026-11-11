import { RESOURCES, ResourceType } from '../utils/boardGenerator';
import { GameAction, GameState, Resources } from './gameState';

// How many of the 36 dice combinations roll each number
const PIPS: Record<number, number> = { 2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 8: 5, 9: 4, 10: 3, 11: 2, 12: 1 };

function best<T>(options: T[], score: (option: T) => number): T {
  return options.reduce((a, b) => (score(b) > score(a) ? b : a));
}

function hexPips(game: GameState, hexKey: string): number {
  const hex = game.board.hexes.find(h => `${h.q},${h.r}` === hexKey);
  return hex?.number ? PIPS[hex.number] : 0;
}

// A corner is worth what its hexes produce
function vertexScore(game: GameState, vertexKey: string): number {
  return game.graph.vertices.get(vertexKey)!.adjacentHexKeys.reduce((sum, h) => sum + hexPips(game, h), 0);
}

// Blocks the hex that hurts opponents the most, never one of its own
function robberScore(game: GameState, botId: string, hexKey: string): number {
  let opponents = 0;
  for (const vertexKey of game.graph.hexVertices.get(hexKey)!) {
    const building = game.buildings.get(vertexKey);
    if (!building) continue;
    if (building.owner === botId) return -1;
    opponents += building.type === 'city' ? 2 : 1;
  }
  return opponents * hexPips(game, hexKey);
}

function handSize(hand: Resources): number {
  return RESOURCES.reduce((sum, r) => sum + hand[r], 0);
}

// Gives up cards from whatever it holds the most of
function pickDiscard(hand: Resources, owed: number): Partial<Resources> {
  const left = { ...hand };
  const chosen: Partial<Resources> = {};
  for (let n = 0; n < owed; n++) {
    const r = best(RESOURCES, x => left[x]);
    left[r]--;
    chosen[r] = (chosen[r] ?? 0) + 1;
  }
  return chosen;
}

function scarcest(game: GameState, hand: Resources, exclude?: ResourceType): ResourceType | undefined {
  const available = RESOURCES.filter(r => r !== exclude && game.bank[r] > 0);
  return available.length ? best(available, r => -hand[r]) : undefined;
}

function mainAction(game: GameState, botId: string): GameAction {
  if (game.tradeOffer) return { type: 'cancel_trade' }; // an offer its player left open
  const legal = game.legalMoves(botId);
  const hand = game.players.get(botId)!.resources;

  if (legal.cities.length) return { type: 'build_city', vertexKey: best(legal.cities, v => vertexScore(game, v)) };
  if (legal.settlements.length) {
    return { type: 'build_settlement', vertexKey: best(legal.settlements, v => vertexScore(game, v)) };
  }

  if (legal.devCardsToPlay.includes('knight')) return { type: 'play_knight' };
  if (legal.devCardsToPlay.includes('road_building')) return { type: 'play_road_building' };
  if (legal.devCardsToPlay.includes('year_of_plenty')) {
    const first = scarcest(game, hand);
    const second = first && (game.bank[first] > 1 ? first : scarcest(game, hand, first));
    if (first && second) return { type: 'play_year_of_plenty', resources: [first, second] };
  }
  if (legal.devCardsToPlay.includes('monopoly')) {
    return { type: 'play_monopoly', resource: best(RESOURCES, r => -hand[r]) };
  }

  if (legal.canBuyDevCard) return { type: 'buy_dev_card' };
  // Roads only with wood and brick to spare, so they don't eat the next settlement
  if (legal.roads.length && hand.wood > 1 && hand.brick > 1) {
    return { type: 'build_road', edgeKey: legal.roads[Math.floor(Math.random() * legal.roads.length)] };
  }

  // A big hand is robber bait: trade the surplus with the bank for what it lacks most
  if (handSize(hand) > 6) {
    const give = RESOURCES.find(r => hand[r] > legal.bankRatios[r]);
    const get = give && scarcest(game, hand, give);
    if (give && get) return { type: 'bank_trade', give, get };
  }
  return { type: 'end_turn' };
}

// What a computer-played seat does now, or null if it has nothing to do
function chooseAction(game: GameState, botId: string): GameAction | null {
  const owed = game.pendingDiscards.get(botId);
  if (owed) return { type: 'discard', resources: pickDiscard(game.players.get(botId)!.resources, owed) };
  if (botId !== game.currentPlayerId) {
    // Bots keep it simple and never trade with other players
    return game.tradeOffer && !game.tradeOffer.responses.has(botId) ? { type: 'respond_trade', accept: false } : null;
  }

  const legal = game.legalMoves(botId);
  switch (game.step) {
    case 'place_settlement':
      return { type: 'build_settlement', vertexKey: best(legal.settlements, v => vertexScore(game, v)) };
    case 'place_road':
    case 'road_building':
      return { type: 'build_road', edgeKey: legal.roads[Math.floor(Math.random() * legal.roads.length)] };
    case 'roll':
      return { type: 'roll_dice' };
    case 'move_robber':
      return { type: 'move_robber', hexKey: best(legal.robberHexes, h => robberScore(game, botId, h)) };
    case 'steal':
      return { type: 'steal', victimId: best(legal.victims, v => handSize(game.players.get(v)!.resources)) };
    case 'main':
      return mainAction(game, botId);
    case 'discard':
      return null; // waiting for others to discard
  }
}

export function nextBotMove(game: GameState): { botId: string; action: GameAction } | null {
  if (game.phase === 'finished') return null;
  for (const botId of game.bots) {
    const action = chooseAction(game, botId);
    if (action) return { botId, action };
  }
  return null;
}
