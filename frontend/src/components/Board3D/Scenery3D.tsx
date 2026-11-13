import { useLayoutEffect, useMemo, useRef } from 'react';
import {
  BufferGeometry, CapsuleGeometry, Color, ConeGeometry, CylinderGeometry, DodecahedronGeometry, Euler,
  IcosahedronGeometry, InstancedMesh, Matrix4, MeshStandardMaterial, Quaternion, SphereGeometry, Vector3,
  BoxGeometry,
} from 'three';
import type { HexTile, TerrainType } from '../Board/boardTypes';
import { TILE_TOP, hexPosition } from './layout';
import { hexSeed, scatter, terrainHeight } from './terrain';

// Every tree, rock, sheep and wheat tuft on the island, drawn as instances: one draw call per kind of
// shape, whatever the density

type PartName = 'trunk' | 'pine' | 'crown' | 'rock' | 'wool' | 'head' | 'tuft' | 'bale' | 'cactus' | 'brick' | 'bush';

const up = (g: BufferGeometry) => g.translate(0, 0.5, 0);
const PARTS: Record<PartName, { geometry: BufferGeometry; material: MeshStandardMaterial }> = {
  trunk: { geometry: up(new CylinderGeometry(0.16, 0.24, 1, 6)), material: new MeshStandardMaterial({ roughness: 0.9 }) },
  pine: { geometry: up(new ConeGeometry(1, 1, 9)), material: new MeshStandardMaterial({ roughness: 0.85 }) },
  crown: { geometry: new IcosahedronGeometry(1, 1), material: new MeshStandardMaterial({ roughness: 0.8, flatShading: true }) },
  rock: { geometry: new DodecahedronGeometry(1, 0), material: new MeshStandardMaterial({ roughness: 0.75, flatShading: true }) },
  wool: { geometry: new SphereGeometry(1, 12, 9), material: new MeshStandardMaterial({ roughness: 1 }) },
  head: { geometry: new SphereGeometry(1, 8, 6), material: new MeshStandardMaterial({ roughness: 0.7 }) },
  tuft: { geometry: up(new ConeGeometry(1, 1, 5)), material: new MeshStandardMaterial({ roughness: 0.8 }) },
  bale: { geometry: new CylinderGeometry(1, 1, 1, 14), material: new MeshStandardMaterial({ roughness: 0.95 }) },
  cactus: { geometry: up(new CapsuleGeometry(0.35, 1, 4, 8)), material: new MeshStandardMaterial({ roughness: 0.7 }) },
  brick: { geometry: up(new BoxGeometry(1, 1, 1)), material: new MeshStandardMaterial({ roughness: 0.85 }) },
  bush: { geometry: new IcosahedronGeometry(1, 0), material: new MeshStandardMaterial({ roughness: 0.9, flatShading: true }) },
};

interface Placement {
  matrix: Matrix4;
  color: Color;
}

type Placements = Record<PartName, Placement[]>;

const q = new Quaternion();
const euler = new Euler();
const tint = (hex: string, jitter: number, random: number) =>
  new Color(hex).offsetHSL((random - 0.5) * 0.04, (random - 0.5) * 0.1, (random - 0.5) * jitter);

function put(list: Placement[], x: number, y: number, z: number, sx: number, sy: number, sz: number, color: Color,
  rotY = 0, rotX = 0, rotZ = 0) {
  q.setFromEuler(euler.set(rotX, rotY, rotZ));
  list.push({ matrix: new Matrix4().compose(new Vector3(x, y, z), q.clone(), new Vector3(sx, sy, sz)), color });
}

function sceneryFor(hex: HexTile, density: number, out: Placements, sheep: boolean) {
  const seed = hexSeed(hex);
  const [cx, , cz] = hexPosition(hex.q, hex.r);
  const ground = (lx: number, lz: number) => TILE_TOP + terrainHeight(hex.terrain as TerrainType, seed, lx, lz);
  const count = (n: number) => Math.max(1, Math.round(n * density));

  const pine = (lx: number, lz: number, s: number, r: number) => {
    const y = ground(lx, lz);
    put(out.trunk, cx + lx, y, cz + lz, 0.12 * s, 0.1 * s, 0.12 * s, tint('#5a3d24', 0.08, r));
    put(out.pine, cx + lx, y + 0.06 * s, cz + lz, 0.12 * s, 0.26 * s, 0.12 * s, tint('#24512c', 0.12, r), r * 6);
    put(out.pine, cx + lx, y + 0.19 * s, cz + lz, 0.085 * s, 0.2 * s, 0.085 * s, tint('#2d6235', 0.12, 1 - r), r * 3);
  };
  const broadleaf = (lx: number, lz: number, s: number, r: number, color = '#4a8030') => {
    const y = ground(lx, lz);
    put(out.trunk, cx + lx, y, cz + lz, 0.12 * s, 0.16 * s, 0.12 * s, tint('#634329', 0.08, r));
    put(out.crown, cx + lx, y + 0.2 * s, cz + lz, 0.1 * s, 0.09 * s, 0.1 * s, tint(color, 0.14, r), r * 5);
  };
  const rock = (lx: number, lz: number, s: number, r: number, color = '#878580') => {
    put(out.rock, cx + lx, ground(lx, lz) + 0.01, cz + lz, 0.055 * s, 0.04 * s, 0.05 * s, tint(color, 0.12, r), r * 7, r * 2);
  };
  const bush = (lx: number, lz: number, s: number, r: number, color: string) => {
    put(out.bush, cx + lx, ground(lx, lz) + 0.02 * s, cz + lz, 0.05 * s, 0.035 * s, 0.05 * s, tint(color, 0.12, r), r * 4);
  };

  switch (hex.terrain) {
    case 'forest':
      for (const p of scatter(seed, count(34), 0.36, 0.84, 0.1)) {
        const s = 0.8 + p.r * 0.5;
        if (p.r < 0.72) pine(p.x, p.z, s, p.r); else broadleaf(p.x, p.z, s, p.r);
      }
      for (const p of scatter(seed + 3, count(10), 0.33, 0.86, 0.06)) bush(p.x, p.z, 0.8 + p.r * 0.5, p.r, '#3a6127');
      break;
    case 'mountains':
      for (const p of scatter(seed + 1, count(22), 0.34, 0.9, 0.06)) {
        const h = terrainHeight('mountains', seed, p.x, p.z);
        if (h < 0.3) rock(p.x, p.z, 0.7 + p.r * 0.9, p.r, h > 0.15 ? '#8e8b86' : '#76736d');
      }
      for (const p of scatter(seed + 2, count(9), 0.34, 0.86, 0.08)) {
        if (terrainHeight('mountains', seed, p.x, p.z) < 0.07) pine(p.x, p.z, 0.65 + p.r * 0.3, p.r);
      }
      break;
    case 'hills': {
      // brick stacks drying by the clay pits
      for (const p of scatter(seed + 4, 3, 0.4, 0.75, 0.25)) {
        const y = ground(p.x, p.z);
        const turn = p.r * Math.PI;
        for (let level = 0; level < 3; level++) {
          put(out.brick, cx + p.x, y + level * 0.035, cz + p.z, 0.13 - level * 0.025, 0.035, 0.07,
            tint('#a5462a', 0.1, (p.r + level * 0.3) % 1), turn);
        }
      }
      for (const p of scatter(seed + 5, count(12), 0.34, 0.86, 0.07)) bush(p.x, p.z, 0.7 + p.r * 0.6, p.r, '#617a33');
      for (const p of scatter(seed + 6, count(6), 0.34, 0.88, 0.07)) rock(p.x, p.z, 0.6 + p.r * 0.6, p.r, '#9a6248');
      break;
    }
    case 'pasture':
      // when the villagers layer is on, the sheep walk around with the shepherd instead
      for (const p of sheep ? scatter(seed + 7, 6, 0.38, 0.8, 0.14) : []) {
        const y = ground(p.x, p.z) + 0.05;
        const turn = p.r * Math.PI * 2;
        const hx = Math.cos(turn) * 0.065;
        const hz = -Math.sin(turn) * 0.065;
        put(out.wool, cx + p.x, y, cz + p.z, 0.07, 0.05, 0.048, tint('#f3f0e6', 0.06, p.r), turn);
        put(out.head, cx + p.x + hx, y + 0.02, cz + p.z + hz, 0.03, 0.028, 0.026, new Color('#2b2724'), turn);
      }
      for (const p of scatter(seed + 8, count(4), 0.4, 0.8, 0.2)) broadleaf(p.x, p.z, 0.85 + p.r * 0.3, p.r, '#558a33');
      for (const p of scatter(seed + 9, count(10), 0.34, 0.88, 0.07)) bush(p.x, p.z, 0.6 + p.r * 0.4, p.r, '#4f7f2c');
      break;
    case 'fields': {
      for (const p of scatter(seed + 10, count(150), 0.36, 0.88, 0.035)) {
        const y = ground(p.x, p.z);
        const s = 0.8 + p.r * 0.4;
        put(out.tuft, cx + p.x, y, cz + p.z, 0.028 * s, 0.13 * s, 0.028 * s, tint(p.r > 0.85 ? '#b7a237' : '#e0b445', 0.12, p.r));
      }
      for (const p of scatter(seed + 11, 3, 0.45, 0.78, 0.25)) {
        put(out.bale, cx + p.x, ground(p.x, p.z) + 0.045, cz + p.z, 0.045, 0.09, 0.045, tint('#d2a650', 0.08, p.r),
          p.r * Math.PI, 0, Math.PI / 2);
      }
      break;
    }
    case 'desert':
      for (const p of scatter(seed + 12, count(5), 0.4, 0.82, 0.18)) {
        const y = ground(p.x, p.z);
        const s = 0.8 + p.r * 0.5;
        put(out.cactus, cx + p.x, y, cz + p.z, 0.07 * s, 0.17 * s, 0.07 * s, tint('#4f7f43', 0.1, p.r));
        put(out.cactus, cx + p.x + 0.035 * s, y + 0.06 * s, cz + p.z, 0.04 * s, 0.07 * s, 0.04 * s, tint('#4f7f43', 0.1, p.r));
      }
      for (const p of scatter(seed + 13, count(9), 0.34, 0.88, 0.07)) rock(p.x, p.z, 0.6 + p.r * 0.7, p.r, '#b39a73');
      for (const p of scatter(seed + 14, count(6), 0.34, 0.88, 0.08)) bush(p.x, p.z, 0.6 + p.r * 0.4, p.r, '#8c7a48');
      break;
  }
}

function InstancedPart({ name, items }: { name: PartName; items: Placement[] }) {
  const ref = useRef<InstancedMesh>(null);
  const { geometry, material } = PARTS[name];
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    items.forEach((item, i) => {
      mesh.setMatrixAt(i, item.matrix);
      mesh.setColorAt(i, item.color);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [items]);
  return <instancedMesh key={items.length} ref={ref} args={[geometry, material, items.length]} castShadow receiveShadow />;
}

export default function Scenery({ hexes, density, sheep = true }: { hexes: HexTile[]; density: number; sheep?: boolean }) {
  const placements = useMemo(() => {
    const out = Object.fromEntries(Object.keys(PARTS).map(k => [k, []])) as unknown as Placements;
    hexes.forEach(hex => sceneryFor(hex, density, out, sheep));
    return out;
  }, [hexes, density, sheep]);

  return (
    <>
      {(Object.keys(placements) as PartName[]).filter(name => placements[name].length > 0).map(name => (
        <InstancedPart key={name} name={name} items={placements[name]} />
      ))}
    </>
  );
}
