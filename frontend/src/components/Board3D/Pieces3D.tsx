import { useMemo, useRef, type ReactNode } from 'react';
import { useFrame } from '@react-three/fiber';
import {
  BoxGeometry, ExtrudeGeometry, LatheGeometry, MeshPhysicalMaterial, Shape, Vector2, type Group,
} from 'three';
import { TILE_TOP, hexKeyPosition, prefersReducedMotion, vertexPosition, type Vec3 } from './layout';
import { WINDOW_LIGHT } from './materials';

// House outlines seen from the front (x, height), extruded into lacquered wooden pieces
function houseGeometry(outline: [number, number][], depth: number) {
  const shape = new Shape();
  outline.forEach(([x, y], i) => (i === 0 ? shape.moveTo(x, y) : shape.lineTo(x, y)));
  shape.closePath();
  const geometry = new ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelSize: 0.012, bevelThickness: 0.012, bevelSegments: 2 });
  geometry.translate(0, 0, -depth / 2);
  return geometry;
}

const SETTLEMENT = houseGeometry([[-0.17, 0], [0.17, 0], [0.17, 0.21], [0, 0.38], [-0.17, 0.21]], 0.3);
const CITY = houseGeometry(
  [[-0.27, 0], [0.27, 0], [0.27, 0.25], [0.03, 0.25], [0.03, 0.39], [-0.12, 0.55], [-0.27, 0.39]], 0.34);
const ROAD = new BoxGeometry(0.62, 0.11, 0.15);
const WINDOW = new BoxGeometry(0.055, 0.065, 0.012);


// Where the windows go on each house's front and back faces
const SETTLEMENT_WINDOWS: [number, number][] = [[0.075, 0.1], [-0.075, 0.1]];
const CITY_WINDOWS: [number, number][] = [[0.15, 0.12], [-0.12, 0.13], [-0.12, 0.33]];

const ROBBER = (() => {
  const profile = [
    [0, 0], [0.17, 0], [0.175, 0.03], [0.13, 0.065], [0.095, 0.12], [0.115, 0.2], [0.13, 0.29], [0.1, 0.37],
    [0.065, 0.41], [0.1, 0.45], [0.11, 0.51], [0.085, 0.57], [0.03, 0.6], [0, 0.605],
  ].map(([x, y]) => new Vector2(x, y));
  return new LatheGeometry(profile, 40);
})();
const ROBBER_MATERIAL = new MeshPhysicalMaterial({ color: '#2a2a30', roughness: 0.35, clearcoat: 0.8, clearcoatRoughness: 0.2 });

function usePlayerMaterial(color: string) {
  return useMemo(() => new MeshPhysicalMaterial({
    color, roughness: 0.42, clearcoat: 0.7, clearcoatRoughness: 0.25, sheen: 0.2, sheenColor: '#ffffff',
  }), [color]);
}

// A piece just placed drops onto the board with a small bounce
function Drop({ position, rotationY = 0, children }: { position: Vec3; rotationY?: number; children: ReactNode }) {
  const ref = useRef<Group>(null);
  const progress = useRef(prefersReducedMotion() ? 1 : 0);

  useFrame((_, delta) => {
    const group = ref.current;
    if (!group || progress.current >= 1) return;
    progress.current = Math.min(1, progress.current + delta / 0.5);
    const t = progress.current;
    // falls, then one small rebound
    const height = t < 0.7 ? 1 - (t / 0.7) ** 2 : 0.12 * Math.sin(((t - 0.7) / 0.3) * Math.PI);
    group.position.y = position[1] + height * 1.6;
  });

  return <group ref={ref} position={position} rotation-y={rotationY}>{children}</group>;
}

export function Road({ edgeKey, color }: { edgeKey: string; color: string }) {
  const material = usePlayerMaterial(color);
  const [a, b] = edgeKey.split('|').map(v => vertexPosition(v));
  const middle: Vec3 = [(a[0] + b[0]) / 2, TILE_TOP + 0.055, (a[2] + b[2]) / 2];
  return (
    <Drop position={middle} rotationY={-Math.atan2(b[2] - a[2], b[0] - a[0])}>
      <mesh geometry={ROAD} material={material} castShadow receiveShadow />
    </Drop>
  );
}

export function Building({ vertexKey, type, color }: { vertexKey: string; type: 'settlement' | 'city'; color: string }) {
  const material = usePlayerMaterial(color);
  const windows = type === 'city' ? CITY_WINDOWS : SETTLEMENT_WINDOWS;
  const depth = type === 'city' ? 0.34 : 0.3;
  return (
    <Drop position={vertexPosition(vertexKey)}>
      <mesh geometry={type === 'city' ? CITY : SETTLEMENT} material={material} castShadow receiveShadow />
      {[1, -1].map(side => windows.map(([x, y]) => (
        <mesh key={`${side}${x}${y}`} geometry={WINDOW} material={WINDOW_LIGHT} position={[x, y, side * (depth / 2 + 0.013)]} />
      )))}
    </Drop>
  );
}

// The robber stands on the number token of the hex it blocks, and hops from hex to hex
export function Robber({ hexKey, onToken }: { hexKey: string; onToken: boolean }) {
  const ref = useRef<Group>(null);
  const [x, , z] = hexKeyPosition(hexKey);
  const base = TILE_TOP + (onToken ? 0.055 : 0);
  const target = useMemo<Vec3>(() => [x, base, z], [x, base, z]);

  useFrame((_, delta) => {
    const pawn = ref.current;
    if (!pawn) return;
    const dx = target[0] - pawn.position.x;
    const dz = target[2] - pawn.position.z;
    const distance = Math.hypot(dx, dz);
    const lift = pawn.position.y - target[1];
    if (distance < 0.002 && Math.abs(lift) < 0.002) return;
    const step = prefersReducedMotion() ? 1 : 1 - Math.exp(-delta * 5);
    pawn.position.x += dx * step;
    pawn.position.z += dz * step;
    // rises while there is still ground to cover, settles as it arrives
    const height = Math.min(distance * (1 - step), 1) * 0.9;
    pawn.position.y += (target[1] + height - pawn.position.y) * Math.min(1, delta * 10);
  });

  return (
    <group ref={ref} position={target}>
      <mesh geometry={ROBBER} material={ROBBER_MATERIAL} castShadow receiveShadow />
    </group>
  );
}
