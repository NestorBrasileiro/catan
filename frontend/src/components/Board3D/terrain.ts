// Procedural relief for each hex: a triangulated hexagon whose interior rises into peaks, hills or dunes,
// colored per vertex by height and slope. The rim and the center stay at TILE_TOP, so roads and
// buildings on the corners and the number token in the middle always sit flat.
import { BufferAttribute, BufferGeometry, Color } from 'three';
import type { TerrainType } from '../Board/boardTypes';
import { TILE_TOP } from './layout';
import { fbm, noise2, ridged, smoothstep } from './noise';

export const TILE_RADIUS = 0.965;   // corner radius of a tile's top; the rest of the hex is the seam
export const TILE_FLOOR = 0.09;     // where the tile's side meets the island base

const COS30 = Math.cos(Math.PI / 6);

// Fixed per hex, so its relief and scenery look the same on every render and for every player
export function hexSeed(hex: { q: number; r: number }) {
  return (hex.q + 7) * 31 + (hex.r + 7) * 17;
}

// 1 on the border of a hexagon of corner radius 1 (pointy-top), 0 at its center
export function hexNorm(x: number, z: number) {
  return Math.max(
    Math.abs(x),
    Math.abs(x * 0.5 + z * COS30),
    Math.abs(-x * 0.5 + z * COS30),
  ) / COS30;
}

// Raise the ground between the flat center (token) and the flat rim (roads)
function reliefMask(x: number, z: number, rimStart = 0.7) {
  const r = Math.hypot(x, z) / TILE_RADIUS;
  const h = hexNorm(x, z) / TILE_RADIUS;
  return smoothstep(0.28, 0.46, r) * (1 - smoothstep(rimStart, 0.95, h));
}

function peaks(seed: number) {
  const start = noise2(seed, 1.7) * Math.PI * 2;
  return [0, 1, 2].map(i => {
    const angle = start + (i * Math.PI * 2) / 3 + (noise2(seed, i + 4.1) - 0.5) * 0.6;
    const radius = 0.56 + (noise2(seed, i + 9.3) - 0.5) * 0.1;
    return { x: Math.cos(angle) * radius, z: Math.sin(angle) * radius, h: 0.42 + noise2(seed, i + 2.2) * 0.3 };
  });
}

const peakCache = new Map<number, ReturnType<typeof peaks>>();

// Height above TILE_TOP at a point of the hex (local coordinates, corner radius 1)
export function terrainHeight(terrain: TerrainType, seed: number, x: number, z: number): number {
  switch (terrain) {
    case 'mountains': {
      let list = peakCache.get(seed);
      if (!list) peakCache.set(seed, list = peaks(seed));
      let h = 0;
      for (const p of list) {
        const d2 = (x - p.x) ** 2 + (z - p.z) ** 2;
        h = Math.max(h, p.h * Math.exp(-d2 / 0.06));
      }
      h += ridged(x * 3.2 + seed, z * 3.2, seed, 4) * 0.16 * Math.min(1, h * 4 + 0.2);
      return h * reliefMask(x, z, 0.74);
    }
    case 'hills': {
      const bumps = Math.exp(-((x - 0.45) ** 2 + (z + 0.2) ** 2) / 0.05) * 0.1
        + Math.exp(-((x + 0.35) ** 2 + (z - 0.4) ** 2) / 0.06) * 0.09;
      return (fbm(x * 2.4 + seed, z * 2.4, seed, 4) * 0.2 + bumps) * reliefMask(x, z);
    }
    case 'forest':
      return fbm(x * 2 + seed, z * 2, seed, 3) * 0.09 * reliefMask(x, z);
    case 'pasture':
      return fbm(x * 1.6 + seed, z * 1.6, seed, 3) * 0.08 * reliefMask(x, z);
    case 'fields':
      return fbm(x * 2 + seed, z * 2, seed, 2) * 0.025 * reliefMask(x, z);
    case 'desert': {
      const angle = noise2(seed, 0.5) * Math.PI;
      const along = x * Math.cos(angle) + z * Math.sin(angle);
      const wave = Math.sin(along * 8 + fbm(x * 2, z * 2, seed, 3) * 5) * 0.5 + 0.5;
      return wave * wave * 0.1 * reliefMask(x, z);
    }
  }
}

const C = (hex: string) => new Color(hex);
const PALETTE = {
  forestFloor: C('#2c4f1f'), forestMoss: C('#41662b'), forestDirt: C('#4d3f26'),
  grass: C('#5f9a3c'), grassLight: C('#8ec456'), grassDark: C('#4a7f30'),
  wheat: [C('#d9ae36'), C('#e8c65a'), C('#c79528'), C('#98a843')],
  dirt: C('#9b7a4a'),
  clay: C('#b4532a'), clayLight: C('#cd7a45'), quarry: C('#83361b'), hillGrass: C('#7a8a42'),
  rock: C('#7c7e82'), rockDark: C('#55575c'), scree: C('#948d82'), snow: C('#f3f6fa'), alpine: C('#5d7640'),
  sand: C('#e2c78d'), sandDark: C('#cfae73'), sandLight: C('#efdcae'),
  soil: C('#5e4530'),
};

const scratch = new Color();

function groundColor(terrain: TerrainType, seed: number, x: number, z: number, h: number, flatness: number, out: Color) {
  const n = fbm(x * 4 + seed * 0.37, z * 4, seed + 5, 3);
  const fine = noise2(x * 22, z * 22, seed + 9);
  switch (terrain) {
    case 'forest':
      out.copy(PALETTE.forestFloor).lerp(PALETTE.forestMoss, smoothstep(0.35, 0.7, n));
      if (fine > 0.82) out.lerp(PALETTE.forestDirt, 0.5);
      return;
    case 'pasture':
      out.copy(PALETTE.grass).lerp(PALETTE.grassLight, smoothstep(0.4, 0.75, n));
      out.lerp(PALETTE.grassDark, smoothstep(0.55, 0.9, 1 - flatness) * 0.6 + (fine > 0.9 ? 0.3 : 0));
      return;
    case 'fields': {
      const angle = noise2(seed, 3.3) * Math.PI;
      const across = x * Math.cos(angle) + z * Math.sin(angle);
      const along = -x * Math.sin(angle) + z * Math.cos(angle);
      const parcel = Math.floor(across * 3.2 + noise2(along * 2, seed, 2) * 0.6 + 10);
      const pick = Math.floor(noise2(parcel, seed, 7) * PALETTE.wheat.length);
      out.copy(PALETTE.wheat[pick]);
      // furrows inside each parcel
      out.multiplyScalar(0.9 + Math.sin(along * 60) * 0.06 + fine * 0.06);
      const r = Math.hypot(x, z);
      if (r < 0.36) out.lerp(PALETTE.dirt, smoothstep(0.36, 0.3, r));
      return;
    }
    case 'hills':
      out.copy(PALETTE.hillGrass).lerp(PALETTE.clay, smoothstep(0.02, 0.1, h));
      out.lerp(PALETTE.clayLight, smoothstep(0.5, 0.8, n) * 0.6);
      out.lerp(PALETTE.quarry, smoothstep(0.75, 0.55, flatness));
      return;
    case 'mountains': {
      out.copy(PALETTE.alpine).lerp(PALETTE.rock, smoothstep(0.03, 0.12, h));
      out.lerp(PALETTE.scree, smoothstep(0.5, 0.8, n) * 0.5);
      out.lerp(PALETTE.rockDark, smoothstep(0.8, 0.45, flatness) * 0.7);
      const snowLine = 0.38 + (n - 0.5) * 0.08;
      out.lerp(PALETTE.snow, smoothstep(snowLine, snowLine + 0.07, h) * smoothstep(0.35, 0.6, flatness + 0.1));
      return;
    }
    case 'desert':
      out.copy(PALETTE.sandDark).lerp(PALETTE.sand, smoothstep(0.0, 0.06, h) * 0.7 + n * 0.3);
      out.lerp(PALETTE.sandLight, smoothstep(0.07, 0.1, h) * 0.6);
      return;
  }
}

// A tile: relief on top plus a short wall down to the island base
export function buildTileGeometry(terrain: TerrainType, seed: number, rings: number): BufferGeometry {
  const corners = Array.from({ length: 6 }, (_, i) => {
    const a = ((60 * i - 30) * Math.PI) / 180;
    return [Math.cos(a), Math.sin(a)] as const;
  });

  // Hexagonal rings of points, from the center outwards
  const points: [number, number][] = [[0, 0]];
  const ringStart: number[] = [0];
  for (let k = 1; k <= rings; k++) {
    ringStart.push(points.length);
    const radius = (k / rings) * TILE_RADIUS;
    for (let side = 0; side < 6; side++) {
      const [ax, az] = corners[side];
      const [bx, bz] = corners[(side + 1) % 6];
      for (let t = 0; t < k; t++) {
        const f = t / k;
        points.push([(ax + (bx - ax) * f) * radius, (az + (bz - az) * f) * radius]);
      }
    }
  }
  const index = (k: number, j: number) => (k === 0 ? 0 : ringStart[k] + (((j % (6 * k)) + 6 * k) % (6 * k)));

  const topCount = points.length;
  const rimCount = 6 * rings;
  const positions = new Float32Array((topCount + rimCount * 2) * 3);
  const uvs = new Float32Array((topCount + rimCount * 2) * 2);
  points.forEach(([x, z], i) => {
    positions.set([x, TILE_TOP + terrainHeight(terrain, seed, x, z), z], i * 3);
    uvs.set([x * 0.5 + 0.5 + seed * 0.13, z * 0.5 + 0.5], i * 2);
  });

  const indices: number[] = [];
  const tri = (a: number, b: number, c: number) => {
    // keep every face pointing up (or outwards on the wall)
    const ax = positions[a * 3], az = positions[a * 3 + 2];
    const bx = positions[b * 3], bz = positions[b * 3 + 2];
    const cx = positions[c * 3], cz = positions[c * 3 + 2];
    const up = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
    if (up >= 0) indices.push(a, b, c); else indices.push(a, c, b);
  };
  for (let k = 1; k <= rings; k++) {
    for (let side = 0; side < 6; side++) {
      for (let t = 0; t < k; t++) {
        const o0 = index(k, side * k + t);
        const o1 = index(k, side * k + t + 1);
        const i0 = index(k - 1, side * (k - 1) + t);
        tri(o0, o1, i0);
        if (t < k - 1) tri(i0, o1, index(k - 1, side * (k - 1) + t + 1));
      }
    }
  }

  // The wall: its own vertices so its edge stays sharp
  const wallTop = topCount;
  const wallBottom = topCount + rimCount;
  for (let j = 0; j < rimCount; j++) {
    const [x, z] = points[ringStart[rings] + j];
    positions.set([x, TILE_TOP, z], (wallTop + j) * 3);
    positions.set([x, TILE_FLOOR, z], (wallBottom + j) * 3);
    uvs.set([j / rimCount, 1], (wallTop + j) * 2);
    uvs.set([j / rimCount, 0], (wallBottom + j) * 2);
  }
  for (let j = 0; j < rimCount; j++) {
    const a = wallTop + j;
    const b = wallTop + ((j + 1) % rimCount);
    const c = wallBottom + j;
    const d = wallBottom + ((j + 1) % rimCount);
    // face outwards: the wall's normal must point away from the tile's center
    const ax = positions[a * 3], az = positions[a * 3 + 2];
    const bx = positions[b * 3], bz = positions[b * 3 + 2];
    // normal of (a, c, b) on a vertical wall is horizontal: (bz - az, -(bx - ax)) up to sign
    const nx = -(bz - az);
    const nz = bx - ax;
    const outwards = nx * (ax + bx) + nz * (az + bz) > 0;
    if (outwards) indices.push(a, c, b, b, c, d); else indices.push(a, b, c, b, d, c);
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  const normals = geometry.getAttribute('normal');
  const colors = new Float32Array(positions.length);
  for (let i = 0; i < topCount; i++) {
    const x = positions[i * 3];
    const z = positions[i * 3 + 2];
    groundColor(terrain, seed, x, z, positions[i * 3 + 1] - TILE_TOP, normals.getY(i), scratch);
    colors.set([scratch.r, scratch.g, scratch.b], i * 3);
  }
  for (let j = 0; j < rimCount * 2; j++) {
    const top = j < rimCount;
    scratch.copy(PALETTE.soil).multiplyScalar(top ? 1 : 0.55);
    colors.set([scratch.r, scratch.g, scratch.b], (wallTop + j) * 3);
  }
  geometry.setAttribute('color', new BufferAttribute(colors, 3));
  geometry.computeBoundingSphere();
  return geometry;
}

// Points spread over the raised part of a tile, for trees, rocks and animals
export function scatter(seed: number, count: number, minR: number, maxNorm: number, minGap: number) {
  let s = (seed * 9301 + 49297) % 233280;
  const random = () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
  const out: { x: number; z: number; r: number }[] = [];
  for (let tries = 0; out.length < count && tries < count * 40; tries++) {
    const x = (random() * 2 - 1) * TILE_RADIUS;
    const z = (random() * 2 - 1) * TILE_RADIUS;
    if (Math.hypot(x, z) < minR || hexNorm(x, z) > maxNorm) continue;
    if (out.some(p => (p.x - x) ** 2 + (p.z - z) ** 2 < minGap * minGap)) continue;
    out.push({ x, z, r: random() });
  }
  return out;
}
