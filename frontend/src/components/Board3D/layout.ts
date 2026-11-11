import { axialToPixel, vertexKeyToPixel } from '../Board/boardTypes';

// World units: a hex has radius 1, the board lies on the XZ plane and tiles rise to TILE_TOP
export const TILE_TOP = 0.2;

export type Vec3 = [number, number, number];

export function hexPosition(q: number, r: number, y = 0): Vec3 {
  const { x, y: z } = axialToPixel(q, r, 1);
  return [x, y, z];
}

export function hexKeyPosition(hexKey: string, y = 0): Vec3 {
  const [q, r] = hexKey.split(',').map(Number);
  return hexPosition(q, r, y);
}

export function vertexPosition(vertexKey: string, y = TILE_TOP): Vec3 {
  const { x, y: z } = vertexKeyToPixel(vertexKey, 1);
  return [x, y, z];
}

// Repeatable pseudo-random numbers in [0, 1), so a hex's scenery is the same on every render
export function seededRandom(seed: number) {
  let s = (seed * 2654435761) >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
