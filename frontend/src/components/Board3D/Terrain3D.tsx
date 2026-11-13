import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { CylinderGeometry, MeshPhysicalMaterial, MeshStandardMaterial, type Group } from 'three';
import type { HexTile } from '../Board/boardTypes';
import { TILE_TOP, hexPosition } from './layout';
import { buildTileGeometry, hexSeed } from './terrain';
import { detailTexture, tokenTexture } from './textures';

// One material for every tile: the colors live in the vertices, the texture only adds grain
const GROUND = new MeshStandardMaterial({ vertexColors: true, roughness: 0.93, metalness: 0 });
let groundReady = false;
function groundMaterial() {
  if (!groundReady) {
    const detail = detailTexture();
    detail.repeat.set(3, 3);
    GROUND.map = detail;
    groundReady = true;
  }
  return GROUND;
}

const TOKEN_SHAPE = new CylinderGeometry(0.3, 0.3, 0.05, 48);
const TOKEN_EDGE = new MeshPhysicalMaterial({ color: '#efe3c6', roughness: 0.55, clearcoat: 0.4, clearcoatRoughness: 0.4 });

// The number disc lies on the tile and turns to stay readable from wherever the camera is
function NumberToken({ number }: { number: number }) {
  const ref = useRef<Group>(null);
  const face = useMemo(
    () => new MeshPhysicalMaterial({ map: tokenTexture(number), roughness: 0.6, clearcoat: 0.35, clearcoatRoughness: 0.35 }),
    [number],
  );

  useFrame(({ camera }) => {
    const token = ref.current;
    if (!token) return;
    const world = token.parent!.position;
    token.rotation.y = Math.atan2(camera.position.x - world.x, camera.position.z - world.z) + Math.PI / 2;
  });

  return (
    <group ref={ref} position-y={TILE_TOP + 0.03}>
      <mesh geometry={TOKEN_SHAPE} material={[TOKEN_EDGE, face, TOKEN_EDGE]} castShadow receiveShadow />
    </group>
  );
}

export default function Tile({ hex, detail, showNumber }: { hex: HexTile; detail: number; showNumber: boolean }) {
  const geometry = useMemo(() => buildTileGeometry(hex.terrain, hexSeed(hex), detail), [hex, detail]);
  // a new quality preset rebuilds the relief: free the old one
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <group position={hexPosition(hex.q, hex.r)}>
      <mesh geometry={geometry} material={groundMaterial()} castShadow receiveShadow />
      {hex.number && showNumber && <NumberToken number={hex.number} />}
    </group>
  );
}
