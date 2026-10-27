// Axial coordinate system for hexagonal grid
// Each hex is identified by (q, r), with s = -q - r (cube coordinates)

export type TerrainType = 'forest' | 'pasture' | 'fields' | 'hills' | 'mountains' | 'desert';
export type ResourceType = 'wood' | 'wool' | 'wheat' | 'brick' | 'ore';
export type PortType = '3:1' | ResourceType;

export const RESOURCES: ResourceType[] = ['wood', 'brick', 'wool', 'wheat', 'ore'];

export interface HexTile {
  q: number;
  r: number;
  terrain: TerrainType;
  number: number | null;   // null for desert
}

export interface Port {
  // Which border hex and which of its edges (0-5) faces the ocean
  hexQ: number;
  hexR: number;
  edgeDir: number;
  type: PortType;
}

export interface BoardData {
  hexes: HexTile[];
  ports: Port[];
}

export const TERRAIN_TO_RESOURCE: Record<TerrainType, ResourceType | null> = {
  forest: 'wood',
  pasture: 'wool',
  fields: 'wheat',
  hills: 'brick',
  mountains: 'ore',
  desert: null,
};

// Base game (3-4 players): 19 hexes
const TERRAINS: TerrainType[] = [
  'forest', 'forest', 'forest', 'forest',
  'pasture', 'pasture', 'pasture', 'pasture',
  'fields', 'fields', 'fields', 'fields',
  'hills', 'hills', 'hills',
  'mountains', 'mountains', 'mountains',
  'desert',
];

const NUMBER_TOKENS = [2, 3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11, 11, 12];

const PORT_TYPES: PortType[] = ['3:1', '3:1', '3:1', '3:1', 'wood', 'brick', 'wool', 'wheat', 'ore'];

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

export const EDGE_NEIGHBOR_OFFSETS: { dq: number; dr: number }[] = [
  { dq: 1,  dr: 0  },  // edge 0 → East
  { dq: 0,  dr: 1  },  // edge 1 → SE
  { dq: -1, dr: 1  },  // edge 2 → SW
  { dq: -1, dr: 0  },  // edge 3 → West
  { dq: 0,  dr: -1 },  // edge 4 → NW
  { dq: 1,  dr: -1 },  // edge 5 → NE
];

// Axial coordinates for rings 0..maxRing, center first, each ring walked clockwise from the top
function generateHexCoords(maxRing: number): { q: number; r: number }[] {
  const coords = [{ q: 0, r: 0 }];
  const ringDirs = [
    { dq: 1, dr: 0 },    // right
    { dq: 0, dr: 1 },    // down-right
    { dq: -1, dr: 1 },   // down-left
    { dq: -1, dr: 0 },   // left
    { dq: 0, dr: -1 },   // up-left
    { dq: 1, dr: -1 },   // up-right
  ];

  for (let ring = 1; ring <= maxRing; ring++) {
    let q = 0;
    let r = -ring;
    for (const dir of ringDirs) {
      for (let step = 0; step < ring; step++) {
        coords.push({ q, r });
        q += dir.dq;
        r += dir.dr;
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

// Official rule for variable setup: the red numbers (6 and 8) never touch each other
export function hasAdjacentRedNumbers(hexes: HexTile[]): boolean {
  const numberAt = new Map(hexes.map(h => [`${h.q},${h.r}`, h.number]));
  const isRed = (n: number | null | undefined) => n === 6 || n === 8;
  return hexes.some(h => isRed(h.number) &&
    EDGE_NEIGHBOR_OFFSETS.some(o => isRed(numberAt.get(`${h.q + o.dq},${h.r + o.dr}`))));
}

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

  const allOceanEdges: OceanEdge[] = [];
  for (const hex of hexes) {
    for (let edge = 0; edge < 6; edge++) {
      const off = EDGE_NEIGHBOR_OFFSETS[edge];
      if (!landSet.has(`${hex.q + off.dq},${hex.r + off.dr}`)) {
        allOceanEdges.push({ hexQ: hex.q, hexR: hex.r, edgeDir: edge });
      }
    }
  }

  // Order clockwise by the angle of each edge's midpoint from the board center
  const edgeWithAngle = allOceanEdges.map(e => {
    const sqrt3 = Math.sqrt(3);
    const cx = sqrt3 * e.hexQ + (sqrt3 / 2) * e.hexR;
    const cy = (3 / 2) * e.hexR;
    const angleA = (Math.PI / 180) * (60 * e.edgeDir - 30);
    const angleB = (Math.PI / 180) * (60 * ((e.edgeDir + 1) % 6) - 30);
    const midX = cx + (Math.cos(angleA) + Math.cos(angleB)) / 2;
    const midY = cy + (Math.sin(angleA) + Math.sin(angleB)) / 2;
    return { ...e, angle: Math.atan2(midX, -midY) }; // clockwise from top
  });

  edgeWithAngle.sort((a, b) => a.angle - b.angle);
  return edgeWithAngle.map(({ hexQ, hexR, edgeDir }) => ({ hexQ, hexR, edgeDir }));
}

/**
 * Spread the 9 ports evenly around the coast (gaps of 2-2-3 edges, like the official frame).
 */
function generatePorts(hexes: { q: number; r: number }[]): Port[] {
  const oceanEdges = findOceanEdgesOrdered(hexes);
  const types = shuffle(PORT_TYPES);
  const step = oceanEdges.length / types.length;

  return types.map((type, i) => {
    const edge = oceanEdges[Math.floor(i * step)];
    return { hexQ: edge.hexQ, hexR: edge.hexR, edgeDir: edge.edgeDir, type };
  });
}

export function generateBoard(): BoardData {
  const coords = generateHexCoords(2);

  let hexes: HexTile[];
  do {
    const terrains = shuffle(TERRAINS);
    const numbers = shuffle(NUMBER_TOKENS);
    let next = 0;
    hexes = coords.map((c, i) => ({
      q: c.q,
      r: c.r,
      terrain: terrains[i],
      number: terrains[i] === 'desert' ? null : numbers[next++],
    }));
  } while (hasAdjacentRedNumbers(hexes));

  return { hexes, ports: generatePorts(coords) };
}
