// Shared board types (mirrors backend types)

export type TerrainType = 'forest' | 'pasture' | 'fields' | 'hills' | 'mountains' | 'desert';
export type ResourceType = 'wood' | 'wool' | 'wheat' | 'brick' | 'ore';
export type PortType = '3:1' | 'wood' | 'wool' | 'wheat' | 'brick' | 'ore';

export interface HexTile {
  q: number;
  r: number;
  terrain: TerrainType;
  number: number | null;
  hasRobber: boolean;
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
  robberPos: { q: number; r: number };
  vertices?: VertexData[];
  edges?: EdgeData[];
}

export interface GameStateSnapshot {
  phase: string;
  setupRound: number;
  setupStep: string;
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
  settlements: Record<string, string>;
  roads: Record<string, string>;
  // Available spots (only sent to the current player)
  availableSettlements?: string[];
  availableRoads?: string[];
}

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

// Compute pixel midpoint for an edge given its two vertex keys
export function edgeToPixel(v1Key: string, v2Key: string, size: number): { x: number; y: number } {
  const [q1s, r1s, d1] = v1Key.split(',');
  const [q2s, r2s, d2] = v2Key.split(',');
  const p1 = vertexToPixel(+q1s, +r1s, d1 as 'T' | 'B', size);
  const p2 = vertexToPixel(+q2s, +r2s, d2 as 'T' | 'B', size);
  return { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
}

