// Axial coordinate system for hexagonal grid
// Each hex is identified by (q, r), with s = -q - r (cube coordinates)

export interface HexTile {
  q: number;
  r: number;
  terrain: TerrainType;
  number: number | null;   // null for desert
  hasRobber: boolean;
}

export interface Port {
  // Which border hex and which of its edges (0-5) faces the ocean
  hexQ: number;
  hexR: number;
  edgeDir: number; // 0-5, the edge of the hex facing outward
  type: PortType;
}

// VertexId and EdgeId kept for future use (settlements, roads)

export interface VertexId {
  q: number;
  r: number;
  dir: 'N' | 'S';  // North (top) or South (bottom) vertex of hex (q,r)
}

export interface EdgeId {
  q: number;
  r: number;
  dir: 'E' | 'SE' | 'SW'; // Three unique edges per hex
}

export interface BoardData {
  hexes: HexTile[];
  ports: Port[];
  robberPos: { q: number; r: number };
}

export type TerrainType = 'forest' | 'pasture' | 'fields' | 'hills' | 'mountains' | 'desert';
export type ResourceType = 'wood' | 'wool' | 'wheat' | 'brick' | 'ore';
export type PortType = '3:1' | 'wood' | 'wool' | 'wheat' | 'brick' | 'ore';

export const TERRAIN_TO_RESOURCE: Record<TerrainType, ResourceType | null> = {
  forest: 'wood',
  pasture: 'wool',
  fields: 'wheat',
  hills: 'brick',
  mountains: 'ore',
  desert: null,
};

// Standard 4-player board: 19 hexes
const STANDARD_TERRAINS: TerrainType[] = [
  'forest', 'forest', 'forest', 'forest',
  'pasture', 'pasture', 'pasture', 'pasture',
  'fields', 'fields', 'fields', 'fields',
  'hills', 'hills', 'hills',
  'mountains', 'mountains', 'mountains',
  'desert',
];

// 5-6 player expansion: 30 hexes total
const EXPANDED_TERRAINS: TerrainType[] = [
  'forest', 'forest', 'forest', 'forest', 'forest', 'forest',
  'pasture', 'pasture', 'pasture', 'pasture', 'pasture', 'pasture',
  'fields', 'fields', 'fields', 'fields', 'fields', 'fields',
  'hills', 'hills', 'hills', 'hills', 'hills',
  'mountains', 'mountains', 'mountains', 'mountains', 'mountains',
  'desert', 'desert',
];

// Number tokens in spiral placement order (standard)
const STANDARD_NUMBERS = [5, 2, 6, 3, 8, 10, 9, 12, 11, 4, 8, 10, 9, 4, 5, 6, 3, 11];

// Expanded tokens
const EXPANDED_NUMBERS = [
  2, 5, 4, 6, 3, 9, 8, 11, 11, 10, 6, 3, 8, 4, 8, 10, 11, 12, 3, 12, 6, 4, 9, 5, 9, 5, 10, 2,
];

// Generate axial coordinates for rings 0..maxRing
function generateHexCoords(maxRing: number): { q: number; r: number }[] {
  const coords: { q: number; r: number }[] = [];

  // Center
  coords.push({ q: 0, r: 0 });

  // Each ring outward
  for (let ring = 1; ring <= maxRing; ring++) {
    // Start at (ring, 0) and walk the 6 directions
    let q = ring;
    let r = 0;
    // 6 directions to walk along ring edges
    const dirs = [
      { dq: -1, dr: 1 },  // SE
      { dq: 0, dr: 1 },   // This is wrong, let me use proper cube coords
    ];
    // Actually, let me use the standard ring traversal for axial coords
    // Start at cube (ring, -ring, 0), walk 6 sides
    const cubeDirections = [
      { dq: 0, dr: 1 },   // +r
      { dq: -1, dr: 1 },  // -q +r
      { dq: -1, dr: 0 },  // -q
      { dq: 0, dr: -1 },  // -r
      { dq: 1, dr: -1 },  // +q -r
      { dq: 1, dr: 0 },   // +q
    ];

    q = ring;
    r = -ring; // Start at top-right, but we want s=0 → (ring, 0) for axial start
    // Actually standard: start at (ring, -ring) in axial, s=0
    q = 0;
    r = -ring;

    // Proper ring traversal: start at (0, -ring), go in 6 directions
    // Direction order for clockwise from top:
    const ringDirs = [
      { dq: 1, dr: 0 },    // right
      { dq: 0, dr: 1 },    // down-right
      { dq: -1, dr: 1 },   // down-left
      { dq: -1, dr: 0 },   // left
      { dq: 0, dr: -1 },   // up-left
      { dq: 1, dr: -1 },   // up-right
    ];

    q = 0;
    r = -ring;
    for (let side = 0; side < 6; side++) {
      for (let step = 0; step < ring; step++) {
        coords.push({ q, r });
        q += ringDirs[side].dq;
        r += ringDirs[side].dr;
      }
    }
  }

  return coords;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ============================================================
// EDGE & NEIGHBOR SYSTEM
// ============================================================
// For pointy-top hexagons, corners are at angles (60*i - 30)°:
//   corner 0: -30° (top-right)
//   corner 1:  30° (right)
//   corner 2:  90° (bottom-right)
//   corner 3: 150° (bottom-left)
//   corner 4: 210° (left)
//   corner 5: 270° (top)
//
// Edge i connects corner[i] to corner[(i+1)%6].
// Each edge faces a specific axial neighbor:
//   edge 0 (corner 0→1, right side)     → neighbor (q+1, r)
//   edge 1 (corner 1→2, bottom-right)   → neighbor (q,   r+1)
//   edge 2 (corner 2→3, bottom-left)    → neighbor (q-1, r+1)
//   edge 3 (corner 3→4, left side)      → neighbor (q-1, r)
//   edge 4 (corner 4→5, top-left)       → neighbor (q,   r-1)
//   edge 5 (corner 5→0, top-right)      → neighbor (q+1, r-1)

const EDGE_NEIGHBOR_OFFSETS: { dq: number; dr: number }[] = [
  { dq: 1,  dr: 0  },  // edge 0 → East
  { dq: 0,  dr: 1  },  // edge 1 → SE
  { dq: -1, dr: 1  },  // edge 2 → SW
  { dq: -1, dr: 0  },  // edge 3 → West
  { dq: 0,  dr: -1 },  // edge 4 → NW
  { dq: 1,  dr: -1 },  // edge 5 → NE
];

interface OceanEdge {
  hexQ: number;
  hexR: number;
  edgeDir: number;
}

/**
 * Find all edges of land hexes that face the ocean (no land neighbor on that side).
 * Returns them ordered clockwise around the perimeter.
 */
function findOceanEdgesOrdered(hexes: { q: number; r: number }[]): OceanEdge[] {
  const landSet = new Set(hexes.map(h => `${h.q},${h.r}`));

  // Collect all ocean edges
  const allOceanEdges: OceanEdge[] = [];
  for (const hex of hexes) {
    for (let edge = 0; edge < 6; edge++) {
      const off = EDGE_NEIGHBOR_OFFSETS[edge];
      const nq = hex.q + off.dq;
      const nr = hex.r + off.dr;
      if (!landSet.has(`${nq},${nr}`)) {
        allOceanEdges.push({ hexQ: hex.q, hexR: hex.r, edgeDir: edge });
      }
    }
  }

  // Order clockwise: compute angle from board center for each edge's outward midpoint
  // Edge midpoint direction = average of corner[edgeDir] and corner[(edgeDir+1)%6] angles
  const edgeWithAngle = allOceanEdges.map(e => {
    // Approximate pixel position of hex center (for sorting only)
    const sqrt3 = Math.sqrt(3);
    const cx = sqrt3 * e.hexQ + (sqrt3 / 2) * e.hexR;
    const cy = (3 / 2) * e.hexR;
    // Outward direction of this edge
    const angleA = (Math.PI / 180) * (60 * e.edgeDir - 30);
    const angleB = (Math.PI / 180) * (60 * ((e.edgeDir + 1) % 6) - 30);
    const midX = cx + (Math.cos(angleA) + Math.cos(angleB)) / 2;
    const midY = cy + (Math.sin(angleA) + Math.sin(angleB)) / 2;
    // Angle from center for clockwise sorting (atan2, adjusted so 0 = top)
    const angle = Math.atan2(midX, -midY); // this gives clockwise from top
    return { ...e, angle };
  });

  edgeWithAngle.sort((a, b) => a.angle - b.angle);
  return edgeWithAngle.map(({ hexQ, hexR, edgeDir }) => ({ hexQ, hexR, edgeDir }));
}

/**
 * Generate ports by distributing them evenly around the ocean perimeter.
 */
function generatePorts(hexes: { q: number; r: number }[]): Port[] {
  const oceanEdges = findOceanEdgesOrdered(hexes);
  const portTypes: PortType[] = ['3:1', 'wool', 'ore', '3:1', 'wheat', 'brick', '3:1', 'wood', '3:1'];
  const numPorts = portTypes.length;

  // Distribute evenly: pick every ~(total/numPorts) edge
  const step = oceanEdges.length / numPorts;
  const ports: Port[] = [];
  for (let i = 0; i < numPorts; i++) {
    const idx = Math.floor(i * step) % oceanEdges.length;
    const edge = oceanEdges[idx];
    ports.push({
      hexQ: edge.hexQ,
      hexR: edge.hexR,
      edgeDir: edge.edgeDir,
      type: portTypes[i],
    });
  }

  return ports;
}

export function generateBoard(maxPlayers: number): BoardData {
  const isExpanded = maxPlayers > 4;
  const maxRing = isExpanded ? 3 : 2;
  const coords = generateHexCoords(maxRing);
  const terrains = shuffle(isExpanded ? EXPANDED_TERRAINS : STANDARD_TERRAINS);
  const numbers = [...(isExpanded ? EXPANDED_NUMBERS : STANDARD_NUMBERS)];

  const hexCount = Math.min(coords.length, terrains.length);

  let numberIdx = 0;
  let robberPos = { q: 0, r: 0 };

  const hexes: HexTile[] = [];
  for (let i = 0; i < hexCount; i++) {
    const terrain = terrains[i];
    const isDesert = terrain === 'desert';
    const num = isDesert ? null : numbers[numberIdx++] ?? null;

    const hex: HexTile = {
      q: coords[i].q,
      r: coords[i].r,
      terrain,
      number: num,
      hasRobber: false,
    };

    if (isDesert && robberPos.q === 0 && robberPos.r === 0) {
      hex.hasRobber = true;
      robberPos = { q: hex.q, r: hex.r };
    }

    hexes.push(hex);
  }

  const desertHex = hexes.find(h => h.terrain === 'desert');
  if (desertHex) {
    desertHex.hasRobber = true;
    robberPos = { q: desertHex.q, r: desertHex.r };
  }

  const ports = generatePorts(coords.slice(0, hexCount));

  return { hexes, ports, robberPos };
}

