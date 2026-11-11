import { useMemo, useRef, type ReactNode } from 'react';
import { useFrame } from '@react-three/fiber';
import { BoxGeometry, ConeGeometry, CylinderGeometry, ExtrudeGeometry, MeshStandardMaterial, Shape, SphereGeometry, type Group } from 'three';
import { TILE_TOP, hexKeyPosition, prefersReducedMotion, vertexPosition, type Vec3 } from './layout';

// House outlines seen from the front (x, height), extruded into wooden pieces
function houseGeometry(outline: [number, number][], depth: number) {
  const shape = new Shape();
  outline.forEach(([x, y], i) => (i === 0 ? shape.moveTo(x, y) : shape.lineTo(x, y)));
  shape.closePath();
  const geometry = new ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelSize: 0.012, bevelThickness: 0.012, bevelSegments: 1 });
  geometry.translate(0, 0, -depth / 2);
  return geometry;
}

const SETTLEMENT = houseGeometry([[-0.17, 0], [0.17, 0], [0.17, 0.21], [0, 0.38], [-0.17, 0.21]], 0.3);
const CITY = houseGeometry(
  [[-0.27, 0], [0.27, 0], [0.27, 0.25], [0.03, 0.25], [0.03, 0.39], [-0.12, 0.55], [-0.27, 0.39]], 0.34);
const ROAD = new BoxGeometry(0.62, 0.13, 0.17);

const ROBBER_PARTS = {
  base: new CylinderGeometry(0.15, 0.17, 0.06, 20),
  body: new ConeGeometry(0.14, 0.4, 20),
  head: new SphereGeometry(0.1, 16, 12),
  material: new MeshStandardMaterial({ color: '#3a3a3f', roughness: 0.5 }),
};

function usePlayerMaterial(color: string) {
  return useMemo(() => new MeshStandardMaterial({ color, roughness: 0.55 }), [color]);
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
  const middle: Vec3 = [(a[0] + b[0]) / 2, TILE_TOP + 0.065, (a[2] + b[2]) / 2];
  return (
    <Drop position={middle} rotationY={-Math.atan2(b[2] - a[2], b[0] - a[0])}>
      <mesh geometry={ROAD} material={material} castShadow />
    </Drop>
  );
}

export function Building({ vertexKey, type, color }: { vertexKey: string; type: 'settlement' | 'city'; color: string }) {
  const material = usePlayerMaterial(color);
  return (
    <Drop position={vertexPosition(vertexKey)}>
      <mesh geometry={type === 'city' ? CITY : SETTLEMENT} material={material} castShadow />
    </Drop>
  );
}

// The robber hops from hex to hex instead of teleporting
export function Robber({ hexKey }: { hexKey: string }) {
  const ref = useRef<Group>(null);
  const [x, , z] = hexKeyPosition(hexKey);
  const target = useMemo<Vec3>(() => [x - 0.5, TILE_TOP, z], [x, z]);

  useFrame((_, delta) => {
    const pawn = ref.current;
    if (!pawn) return;
    const dx = target[0] - pawn.position.x;
    const dz = target[2] - pawn.position.z;
    const distance = Math.hypot(dx, dz);
    const lift = pawn.position.y - TILE_TOP;
    if (distance < 0.002 && lift < 0.002) return;
    const step = prefersReducedMotion() ? 1 : 1 - Math.exp(-delta * 5);
    pawn.position.x += dx * step;
    pawn.position.z += dz * step;
    // rises while there is still ground to cover, settles as it arrives
    const height = Math.min(distance * (1 - step), 1) * 0.6;
    pawn.position.y += (TILE_TOP + height - pawn.position.y) * Math.min(1, delta * 10);
  });

  return (
    <group ref={ref} position={target}>
      <mesh geometry={ROBBER_PARTS.base} material={ROBBER_PARTS.material} position-y={0.03} castShadow />
      <mesh geometry={ROBBER_PARTS.body} material={ROBBER_PARTS.material} position-y={0.25} castShadow />
      <mesh geometry={ROBBER_PARTS.head} material={ROBBER_PARTS.material} position-y={0.47} castShadow />
    </group>
  );
}
