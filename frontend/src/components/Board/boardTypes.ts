// Shared board types (mirrors backend types)

export type TerrainType = 'forest' | 'pasture' | 'fields' | 'hills' | 'mountains' | 'desert';
export type ResourceType = 'wood' | 'wool' | 'wheat' | 'brick' | 'ore';
export type PortType = '3:1' | 'wood' | 'wool' | 'wheat' | 'brick' | 'ore';

export interface HexTile {
  q: number;
  r: number;
  terrain: TerrainType;
  number: number | null;
}

export interface VertexData {
  key: string;
  q: number;
  r: number;
  dir: 'T' | 'B';
}

export interface EdgeData {
  key: string;
  vertices: [string, string];
}

export interface Port {
  hexQ: number;
  hexR: number;
  edgeDir: number;
  type: PortType;
}

export interface BoardData {
  hexes: HexTile[];
  ports: Port[];
  vertices: VertexData[];
  edges: EdgeData[];
}

// ===== Game state as seen by one player (mirrors backend GameView) =====

export type GamePhase = 'setup' | 'playing' | 'finished';
export type TurnStep =
  | 'place_settlement' | 'place_road' | 'roll' | 'discard' | 'move_robber' | 'steal' | 'road_building' | 'main';
export type DevCardType = 'knight' | 'victory_point' | 'road_building' | 'year_of_plenty' | 'monopoly';
export type PlayableDevCard = Exclude<DevCardType, 'victory_point'>;
export type DevCards = Record<DevCardType, number>;
export type BuildKind = 'road' | 'settlement' | 'city';
export type Resources = Record<ResourceType, number>;

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

export interface PlayerView {
  color: string;
  victoryPoints: number;
  resourceCount: number;
  resources: Resources | null; // only our own hand
  piecesLeft: Record<BuildKind, number>;
  devCardCount: number;
  devCards: DevCards | null;   // only our own cards
  newDevCards: DevCards | null; // bought this turn
  knightsPlayed: number;
  roadLength: number;
}

export interface TradeOffer {
  give: Resources; // what the current player gives
  get: Resources;  // what they ask for
  responses: Record<string, 'accepted' | 'declined'>;
}

export interface GameView {
  phase: GamePhase;
  step: TurnStep;
  setupRound: 1 | 2;
  currentPlayerId: string;
  playerOrder: string[];
  players: Record<string, PlayerView>;
  buildings: Record<string, { owner: string; type: 'settlement' | 'city' }>;
  roads: Record<string, string>;
  robberHex: string;
  bank: Resources;
  dice: [number, number] | null;
  winnerId: string | null;
  discards: Record<string, number>; // cards each player still has to discard after a 7
  lastRobbery: { thiefId: string; victimId: string; resource: ResourceType | null } | null;
  tradeOffer: TradeOffer | null;
  devDeckCount: number;
  devCardPlayed: boolean;
  freeRoadsLeft: number;
  largestArmyHolder: string | null;
  longestRoadHolder: string | null;
  legal: {
    settlements: string[];
    roads: string[];
    cities: string[];
    robberHexes: string[];
    victims: string[];
    bankRatios: Resources;
    canBuyDevCard: boolean;
    devCardsToPlay: PlayableDevCard[];
  } | null;
}

export const RESOURCE_ORDER: ResourceType[] = ['wood', 'brick', 'wool', 'wheat', 'ore'];

export const RESOURCE_INFO: Record<ResourceType, { emoji: string; label: string }> = {
  wood: { emoji: '🌲', label: 'Madeira' },
  brick: { emoji: '🧱', label: 'Tijolo' },
  wool: { emoji: '🐑', label: 'Ovelha' },
  wheat: { emoji: '🌾', label: 'Trigo' },
  ore: { emoji: '⛰️', label: 'Minério' },
};

export const NO_RESOURCES: Resources = { wood: 0, brick: 0, wool: 0, wheat: 0, ore: 0 };

export function cardCount(cards: Resources): number {
  return RESOURCE_ORDER.reduce((sum, r) => sum + cards[r], 0);
}

// "2 🌲 + 1 🧱"
export function cardsText(cards: Resources): string {
  return RESOURCE_ORDER.filter(r => cards[r] > 0).map(r => `${cards[r]} ${RESOURCE_INFO[r].emoji}`).join(' + ');
}

// Display only — the server is the authority on costs
export const BUILD_COSTS: Record<BuildKind | 'devCard', Partial<Resources>> = {
  road: { wood: 1, brick: 1 },
  settlement: { wood: 1, brick: 1, wool: 1, wheat: 1 },
  city: { wheat: 2, ore: 3 },
  devCard: { wool: 1, wheat: 1, ore: 1 },
};

// Names as in the Brazilian edition
export const DEV_CARD_INFO: Record<DevCardType, { emoji: string; label: string; hint: string }> = {
  knight: { emoji: '⚔️', label: 'Cavaleiro', hint: 'Mova o ladrão e roube 1 carta.' },
  victory_point: { emoji: '⭐', label: 'Ponto de Vitória', hint: 'Vale 1 ponto. Só você vê até o fim do jogo.' },
  road_building: { emoji: '🛣️', label: 'Construção de Estradas', hint: 'Construa 2 estradas grátis.' },
  year_of_plenty: { emoji: '🎁', label: 'Invenção', hint: 'Pegue 2 recursos quaisquer do banco.' },
  monopoly: { emoji: '💰', label: 'Monopólio', hint: 'Todos te entregam as cartas de um recurso.' },
};

export const DEV_CARD_ORDER: DevCardType[] = ['knight', 'road_building', 'year_of_plenty', 'monopoly', 'victory_point'];

// Terrain colors
export const TERRAIN_COLORS: Record<TerrainType, string> = {
  forest: '#2d5a27',
  pasture: '#90c44e',
  fields: '#f5c542',
  hills: '#c4622d',
  mountains: '#8b8b8b',
  desert: '#e8d5a3',
};

// Terrain emoji/label
export const TERRAIN_LABELS: Record<TerrainType, string> = {
  forest: '🌲',
  pasture: '🐑',
  fields: '🌾',
  hills: '🧱',
  mountains: '⛰️',
  desert: '🏜️',
};

// Convert axial (q,r) to pixel (x,y) for pointy-top hexagons
export function axialToPixel(q: number, r: number, size: number): { x: number; y: number } {
  const x = size * (Math.sqrt(3) * q + (Math.sqrt(3) / 2) * r);
  const y = size * ((3 / 2) * r);
  return { x, y };
}

// Pointy-top hex corner positions
export function hexCorners(cx: number, cy: number, size: number): string {
  return hexCornersArray(cx, cy, size).map(p => `${p.x},${p.y}`).join(' ');
}

export function hexCornersArray(cx: number, cy: number, size: number): { x: number; y: number }[] {
  const corners: { x: number; y: number }[] = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 180) * (60 * i - 30);
    corners.push({
      x: cx + size * Math.cos(angle),
      y: cy + size * Math.sin(angle),
    });
  }
  return corners;
}

// Get pixel position of a specific corner (0-5) of hex (q,r)
export function hexCornerPixel(q: number, r: number, corner: number, size: number): { x: number; y: number } {
  const { x: cx, y: cy } = axialToPixel(q, r, size);
  const angle = (Math.PI / 180) * (60 * corner - 30);
  return {
    x: cx + size * Math.cos(angle),
    y: cy + size * Math.sin(angle),
  };
}

// Build the coastline path around all land hexes
export function buildCoastlinePath(hexes: HexTile[], size: number): string {
  // Collect all hex centers
  const landSet = new Set(hexes.map(h => `${h.q},${h.r}`));

  // Neighbor directions for pointy-top (axial)
  const neighborDirs = [
    { dq: 1, dr: 0 },   // E
    { dq: 0, dr: 1 },   // SE
    { dq: -1, dr: 1 },  // SW
    { dq: -1, dr: 0 },  // W
    { dq: 0, dr: -1 },  // NW
    { dq: 1, dr: -1 },  // NE
  ];

  // Collect all border edges (edge between land and water)
  // Each edge has 2 corner points
  const edgeSegments: { x1: number; y1: number; x2: number; y2: number }[] = [];

  for (const hex of hexes) {
    const { x: cx, y: cy } = axialToPixel(hex.q, hex.r, size);
    const corners = hexCornersArray(cx, cy, size);

    for (let i = 0; i < 6; i++) {
      const nq = hex.q + neighborDirs[i].dq;
      const nr = hex.r + neighborDirs[i].dr;
      if (!landSet.has(`${nq},${nr}`)) {
        // This edge faces water — add it
        const c1 = corners[i];
        const c2 = corners[(i + 1) % 6];
        edgeSegments.push({ x1: c1.x, y1: c1.y, x2: c2.x, y2: c2.y });
      }
    }
  }

  // Chain segments into a closed path
  if (edgeSegments.length === 0) return '';

  const eps = 0.5;
  const used = new Array(edgeSegments.length).fill(false);
  const path: { x: number; y: number }[] = [];

  // Start with first segment
  used[0] = true;
  path.push({ x: edgeSegments[0].x1, y: edgeSegments[0].y1 });
  path.push({ x: edgeSegments[0].x2, y: edgeSegments[0].y2 });

  for (let count = 1; count < edgeSegments.length; count++) {
    const last = path[path.length - 1];
    let found = false;
    for (let i = 0; i < edgeSegments.length; i++) {
      if (used[i]) continue;
      const seg = edgeSegments[i];
      if (Math.abs(seg.x1 - last.x) < eps && Math.abs(seg.y1 - last.y) < eps) {
        path.push({ x: seg.x2, y: seg.y2 });
        used[i] = true;
        found = true;
        break;
      }
      if (Math.abs(seg.x2 - last.x) < eps && Math.abs(seg.y2 - last.y) < eps) {
        path.push({ x: seg.x1, y: seg.y1 });
        used[i] = true;
        found = true;
        break;
      }
    }
    if (!found) break;
  }

  return path.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ') + ' Z';
}

// Compute pixel position for a vertex (T = top/corner5 at 270°, B = bottom/corner2 at 90°)
export function vertexToPixel(q: number, r: number, dir: 'T' | 'B', size: number): { x: number; y: number } {
  const { x: cx, y: cy } = axialToPixel(q, r, size);
  if (dir === 'T') {
    // Corner 5 at 270°
    return { x: cx, y: cy - size };
  } else {
    // Corner 2 at 90°
    return { x: cx, y: cy + size };
  }
}

// Pixel position of a vertex key "q,r,T|B"
export function vertexKeyToPixel(key: string, size: number): { x: number; y: number } {
  const [q, r, dir] = key.split(',');
  return vertexToPixel(+q, +r, dir as 'T' | 'B', size);
}

// Compute pixel midpoint for an edge given its two vertex keys
export function edgeToPixel(v1Key: string, v2Key: string, size: number): { x: number; y: number } {
  const p1 = vertexKeyToPixel(v1Key, size);
  const p2 = vertexKeyToPixel(v2Key, size);
  return { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
}
