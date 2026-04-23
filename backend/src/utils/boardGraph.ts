// Board graph: vertices, edges, and adjacency computation
// Using canonical vertex representation: T(q,r) = top vertex, B(q,r) = bottom vertex
//
// For pointy-top hexes (angles = 60*i - 30):
//   corner 0 (-30°, upper-right) = B(q+1, r-1)
//   corner 1 ( 30°, right)       = T(q,   r+1)
//   corner 2 ( 90°, bottom)      = B(q,   r)     ← canonical B
//   corner 3 (150°, lower-left)  = T(q-1, r+1)
//   corner 4 (210°, upper-left)  = B(q,   r-1)
//   corner 5 (270°, top)         = T(q,   r)     ← canonical T
//
// Adjacency:
//   T(q,r) touches hexes: (q,r), (q,r-1), (q+1,r-1)
//   B(q,r) touches hexes: (q,r), (q-1,r+1), (q,r+1)
//
//   T(q,r) connects to vertices: B(q,r-1), B(q+1,r-1), B(q+1,r-2)
//   B(q,r) connects to vertices: T(q,r+1), T(q-1,r+1), T(q-1,r+2)

export interface Vertex {
  key: string;       // "q,r,T" or "q,r,B"
  q: number;
  r: number;
  dir: 'T' | 'B';
  adjacentHexKeys: string[];    // "q,r" of land hexes touching this vertex
  adjacentVertexKeys: string[]; // vertex keys connected by an edge
}

export interface Edge {
  key: string;         // "vKey1|vKey2" sorted
  vertices: [string, string];
}

export interface BoardGraph {
  vertices: Map<string, Vertex>;
  edges: Map<string, Edge>;
}

function vKey(q: number, r: number, dir: 'T' | 'B'): string {
  return `${q},${r},${dir}`;
}

function eKey(v1: string, v2: string): string {
  return v1 < v2 ? `${v1}|${v2}` : `${v2}|${v1}`;
}

// Map corner index (0-5) of hex (q,r) to canonical vertex key
function cornerToVertex(q: number, r: number, corner: number): string {
  switch (corner) {
    case 0: return vKey(q + 1, r - 1, 'B');
    case 1: return vKey(q, r + 1, 'T');
    case 2: return vKey(q, r, 'B');
    case 3: return vKey(q - 1, r + 1, 'T');
    case 4: return vKey(q, r - 1, 'B');
    case 5: return vKey(q, r, 'T');
    default: throw new Error(`Invalid corner: ${corner}`);
  }
}

// Get the 3 adjacent hex keys for a vertex
function vertexAdjacentHexes(q: number, r: number, dir: 'T' | 'B'): string[] {
  if (dir === 'T') {
    return [`${q},${r}`, `${q},${r - 1}`, `${q + 1},${r - 1}`];
  } else {
    return [`${q},${r}`, `${q - 1},${r + 1}`, `${q},${r + 1}`];
  }
}

// Get the 3 adjacent vertex keys for a vertex
function vertexNeighbors(q: number, r: number, dir: 'T' | 'B'): string[] {
  if (dir === 'T') {
    return [vKey(q, r - 1, 'B'), vKey(q + 1, r - 1, 'B'), vKey(q + 1, r - 2, 'B')];
  } else {
    return [vKey(q, r + 1, 'T'), vKey(q - 1, r + 1, 'T'), vKey(q - 1, r + 2, 'T')];
  }
}

export function buildBoardGraph(hexCoords: { q: number; r: number }[]): BoardGraph {
  const landSet = new Set(hexCoords.map(h => `${h.q},${h.r}`));
  const vertices = new Map<string, Vertex>();
  const edges = new Map<string, Edge>();

  // Enumerate all unique vertices from all hex corners
  for (const hex of hexCoords) {
    for (let c = 0; c < 6; c++) {
      const key = cornerToVertex(hex.q, hex.r, c);
      if (!vertices.has(key)) {
        const [qStr, rStr, dirStr] = key.split(',');
        const q = parseInt(qStr);
        const r = parseInt(rStr);
        const dir = dirStr as 'T' | 'B';

        // Only include hexes that are actually land
        const adjHexes = vertexAdjacentHexes(q, r, dir).filter(hk => landSet.has(hk));
        const adjVertices = vertexNeighbors(q, r, dir);

        vertices.set(key, {
          key, q, r, dir,
          adjacentHexKeys: adjHexes,
          adjacentVertexKeys: adjVertices,
        });
      }
    }
  }

  // Filter vertices: only keep those that touch at least 1 land hex
  for (const [key, v] of vertices) {
    if (v.adjacentHexKeys.length === 0) {
      vertices.delete(key);
    }
  }

  // Filter adjacentVertexKeys to only include vertices that exist in our set
  for (const v of vertices.values()) {
    v.adjacentVertexKeys = v.adjacentVertexKeys.filter(k => vertices.has(k));
  }

  // Build edges from vertex adjacencies
  for (const v of vertices.values()) {
    for (const neighborKey of v.adjacentVertexKeys) {
      const ek = eKey(v.key, neighborKey);
      if (!edges.has(ek)) {
        edges.set(ek, {
          key: ek,
          vertices: v.key < neighborKey ? [v.key, neighborKey] : [neighborKey, v.key],
        });
      }
    }
  }

  return { vertices, edges };
}

// Parse a vertex key back to components
export function parseVertexKey(key: string): { q: number; r: number; dir: 'T' | 'B' } {
  const parts = key.split(',');
  return { q: parseInt(parts[0]), r: parseInt(parts[1]), dir: parts[2] as 'T' | 'B' };
}

