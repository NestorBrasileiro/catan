import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import {
  BoxGeometry, ConeGeometry, CylinderGeometry, MeshStandardMaterial, SphereGeometry, type Group,
} from 'three';
import type { HexTile, TerrainType } from '../Board/boardTypes';
import { TILE_TOP, hexPosition, seededRandom } from './layout';
import { groundTexture, sandTexture, tokenTexture } from './textures';

// Color of a tile's rim, under its textured top
const TILE_SIDES: Record<TerrainType, string> = {
  forest: '#2f6a2e',
  pasture: '#74b043',
  fields: '#c9a534',
  hills: '#a9542a',
  mountains: '#70757c',
  desert: '#cdb67c',
};

// Shared by every tile: a few shapes and flat-colored materials build all the scenery
const mat = (color: string, flat = false) => new MeshStandardMaterial({ color, roughness: 0.85, flatShading: flat });
const M = {
  sand: new MeshStandardMaterial({ map: sandTexture(), roughness: 0.95 }),
  trunk: mat('#6b4a2b'),
  leaves: mat('#1f5a2a', true),
  leavesLight: mat('#2f7a36', true),
  rock: mat('#7d838c', true),
  snow: mat('#f4f7fb', true),
  clay: mat('#a8502a'),
  brick: mat('#8f3a22'),
  wheat: mat('#b9801c'),
  hay: mat('#c9952c'),
  wool: mat('#fafafa'),
  sheepHead: mat('#2b2b2b'),
  cactus: mat('#4f8a4a'),
  dune: mat('#d6c08a'),
  token: mat('#fdf5e6'),
};
const G = {
  base: new CylinderGeometry(1, 1, 0.1, 6),
  tile: new CylinderGeometry(0.93, 0.93, TILE_TOP, 6),
  trunk: new CylinderGeometry(0.03, 0.04, 0.14, 6),
  cone: new ConeGeometry(1, 1, 7), // scaled per use
  sphere: new SphereGeometry(1, 12, 8),
  box: new BoxGeometry(1, 1, 1),
  stalk: new ConeGeometry(0.035, 0.24, 5),
  bale: new CylinderGeometry(0.09, 0.09, 0.16, 10),
  token: new CylinderGeometry(0.3, 0.3, 0.05, 28),
};

interface Spot {
  x: number;
  z: number;
  scale: number;
  turn: number;
}

// Places `count` things in a ring around the number token, a little irregular
function ring(seed: number, count: number, radius: number, jitter = 0.12): Spot[] {
  const random = seededRandom(seed);
  const start = random() * Math.PI * 2;
  return Array.from({ length: count }, (_, i) => {
    const angle = start + (i / count) * Math.PI * 2 + (random() - 0.5) * 0.5;
    const r = radius + (random() - 0.5) * jitter * 2;
    return { x: Math.cos(angle) * r, z: Math.sin(angle) * r, scale: 0.8 + random() * 0.45, turn: random() * Math.PI * 2 };
  });
}

function Tree({ x, z, scale }: Spot) {
  return (
    <group position={[x, TILE_TOP, z]} scale={scale * 0.85}>
      <mesh geometry={G.trunk} material={M.trunk} position-y={0.07} castShadow />
      <mesh geometry={G.cone} material={M.leaves} position-y={0.27} scale={[0.15, 0.3, 0.15]} castShadow />
      <mesh geometry={G.cone} material={M.leavesLight} position-y={0.43} scale={[0.1, 0.22, 0.1]} castShadow />
    </group>
  );
}

function Mountain({ x, z, scale, turn }: Spot) {
  const height = 0.62 * scale;
  const radius = 0.3 * scale;
  return (
    <group position={[x, TILE_TOP, z]} rotation-y={turn}>
      <mesh geometry={G.cone} material={M.rock} position-y={height / 2} scale={[radius, height, radius]} castShadow />
      <mesh geometry={G.cone} material={M.snow} position-y={height * 0.83}
        scale={[radius * 0.37, height * 0.36, radius * 0.37]} castShadow />
    </group>
  );
}

function Hill({ x, z, scale, turn }: Spot) {
  return (
    <group position={[x, TILE_TOP, z]} rotation-y={turn}>
      <mesh geometry={G.sphere} material={M.clay} scale={[0.22 * scale, 0.12 * scale, 0.2 * scale]} castShadow />
      <mesh geometry={G.box} material={M.brick} position={[0.16, 0.035, 0.12]} scale={[0.16, 0.07, 0.09]} castShadow />
      <mesh geometry={G.box} material={M.brick} position={[0.18, 0.105, 0.12]} scale={[0.1, 0.07, 0.09]} castShadow />
    </group>
  );
}

function Sheep({ x, z, turn }: Spot) {
  return (
    <group position={[x, TILE_TOP + 0.09, z]} rotation-y={turn}>
      <mesh geometry={G.sphere} material={M.wool} scale={[0.13, 0.09, 0.09]} castShadow />
      <mesh geometry={G.sphere} material={M.sheepHead} position={[0.13, 0.03, 0]} scale={0.045} castShadow />
      {[-0.06, 0.06].map(lx => [-0.04, 0.04].map(lz => (
        <mesh key={`${lx},${lz}`} geometry={G.box} material={M.sheepHead} position={[lx, -0.07, lz]} scale={[0.02, 0.06, 0.02]} />
      )))}
    </group>
  );
}

function Cactus({ x, z, scale }: Spot) {
  return (
    <group position={[x, TILE_TOP, z]} scale={scale}>
      <mesh geometry={G.bale} material={M.cactus} position-y={0.14} scale={[0.45, 1.75, 0.45]} castShadow />
      <mesh geometry={G.bale} material={M.cactus} position={[0.07, 0.17, 0]} scale={[0.3, 0.6, 0.3]} castShadow />
    </group>
  );
}

function Scenery({ hex }: { hex: HexTile }) {
  const seed = (hex.q + 7) * 31 + (hex.r + 7) * 17;
  const spots = useMemo(() => ({
    forest: ring(seed, 7, 0.52, 0.08),
    mountains: ring(seed, 3, 0.56, 0.04),
    hills: ring(seed, 4, 0.58, 0.06),
    sheep: ring(seed, 4, 0.58),
    stalks: ring(seed, 16, 0.6, 0.16),
    bales: ring(seed + 1, 2, 0.55, 0.05),
    cacti: ring(seed, 3, 0.55),
    dunes: ring(seed + 1, 3, 0.5),
  }), [seed]);

  switch (hex.terrain) {
    case 'forest':
      return spots.forest.map((s, i) => <Tree key={i} {...s} />);
    case 'mountains':
      return spots.mountains.map((s, i) => <Mountain key={i} {...s} />);
    case 'hills':
      return spots.hills.map((s, i) => <Hill key={i} {...s} />);
    case 'pasture':
      return spots.sheep.map((s, i) => <Sheep key={i} {...s} />);
    case 'fields':
      return (
        <>
          {spots.stalks.map((s, i) => (
            <mesh key={i} geometry={G.stalk} material={M.wheat} position={[s.x, TILE_TOP + 0.12 * s.scale, s.z]}
              scale={s.scale} castShadow />
          ))}
          {spots.bales.map((s, i) => (
            <mesh key={i} geometry={G.bale} material={M.hay} position={[s.x, TILE_TOP + 0.09, s.z]}
              rotation={[Math.PI / 2, 0, s.turn]} castShadow />
          ))}
        </>
      );
    case 'desert':
      return (
        <>
          {spots.dunes.map((s, i) => (
            <mesh key={i} geometry={G.sphere} material={M.dune} position={[s.x, TILE_TOP, s.z]}
              scale={[0.3 * s.scale, 0.07, 0.2 * s.scale]} rotation-y={s.turn} />
          ))}
          {spots.cacti.map((s, i) => <Cactus key={i} {...s} />)}
        </>
      );
  }
}

// The number disc lies on the tile and turns to stay readable from wherever the camera is
function NumberToken({ number }: { number: number }) {
  const ref = useRef<Group>(null);
  const face = useMemo(() => new MeshStandardMaterial({ map: tokenTexture(number), roughness: 0.8 }), [number]);

  useFrame(({ camera }) => {
    const token = ref.current;
    if (!token) return;
    const world = token.parent!.position;
    token.rotation.y = Math.atan2(camera.position.x - world.x, camera.position.z - world.z) + Math.PI / 2;
  });

  return (
    <group ref={ref} position-y={TILE_TOP + 0.03}>
      <mesh geometry={G.token} material={[M.token, face, M.token]} castShadow />
    </group>
  );
}

export default function Tile({ hex }: { hex: HexTile }) {
  // side, top, bottom
  const ground = useMemo(() => {
    const side = mat(TILE_SIDES[hex.terrain]);
    return [side, new MeshStandardMaterial({ map: groundTexture(hex.terrain), roughness: 0.9 }), side];
  }, [hex.terrain]);
  return (
    <group position={hexPosition(hex.q, hex.r)}>
      <mesh geometry={G.base} material={M.sand} position-y={0.05} receiveShadow />
      <mesh geometry={G.tile} material={ground} position-y={TILE_TOP / 2} receiveShadow />
      <Scenery hex={hex} />
      {hex.number && <NumberToken number={hex.number} />}
    </group>
  );
}
