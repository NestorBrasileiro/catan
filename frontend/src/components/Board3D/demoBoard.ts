import type { BoardData, HexTile, Port, PortType, TerrainType } from '../Board/boardTypes';

// A random island for the lobby's backdrop: the base game's 19 hexes, numbers and 9 ports.
// Only decoration; real boards come from the server.

const TERRAINS: TerrainType[] = [
  'forest', 'forest', 'forest', 'forest', 'pasture', 'pasture', 'pasture', 'pasture',
  'fields', 'fields', 'fields', 'fields', 'hills', 'hills', 'hills', 'mountains', 'mountains', 'mountains', 'desert',
];
const NUMBERS = [2, 3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11, 11, 12];
const PORTS: PortType[] = ['3:1', 'wood', '3:1', 'brick', 'wool', '3:1', 'wheat', 'ore', '3:1'];
const NEIGHBORS = [[1, 0], [0, 1], [-1, 1], [-1, 0], [0, -1], [1, -1]];

function shuffle<T>(items: T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function demoBoard(): Pick<BoardData, 'hexes' | 'ports'> {
  const coords: [number, number][] = [];
  for (let q = -2; q <= 2; q++) {
    for (let r = -2; r <= 2; r++) if (Math.abs(q + r) <= 2) coords.push([q, r]);
  }
  const terrains = shuffle(TERRAINS);
  const numbers = shuffle(NUMBERS);
  const hexes: HexTile[] = coords.map(([q, r], i) => ({
    q, r, terrain: terrains[i], number: terrains[i] === 'desert' ? null : numbers.pop()!,
  }));

  // Edges facing the sea, in order around the island, then every third or so gets a port
  const land = new Set(coords.map(([q, r]) => `${q},${r}`));
  const coast: { q: number; r: number; dir: number; angle: number }[] = [];
  for (const [q, r] of coords) {
    NEIGHBORS.forEach(([dq, dr], dir) => {
      if (land.has(`${q + dq},${r + dr}`)) return;
      const x = Math.sqrt(3) * (q + dq / 2) + (Math.sqrt(3) / 2) * (r + dr / 2);
      const y = 1.5 * (r + dr / 2);
      coast.push({ q, r, dir, angle: Math.atan2(y, x) });
    });
  }
  coast.sort((a, b) => a.angle - b.angle);
  const ports: Port[] = shuffle(PORTS).map((type, i) => {
    const edge = coast[Math.floor((i * coast.length) / PORTS.length)];
    return { hexQ: edge.q, hexR: edge.r, edgeDir: edge.dir, type };
  });

  return { hexes, ports };
}
