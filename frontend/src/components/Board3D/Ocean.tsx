import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { MeshReflectorMaterial } from '@react-three/drei';
import {
  BufferAttribute, BufferGeometry, Color, MeshStandardMaterial, RepeatWrapping, Shape, ShapeGeometry,
  Vector2, type MeshBasicMaterial, type Texture,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { coastlinePoints, type HexTile } from '../Board/boardTypes';
import { prefersReducedMotion } from './layout';
import { TILE_FLOOR } from './terrain';
import { SHORE_EXTENT, sandTexture, shoreTexture, surfTexture, waterNormalTexture } from './textures';

const SEA_SIZE = 600;

let normals: Texture | null = null;
function waterNormals() {
  return (normals ??= waterNormalTexture());
}

// Lays a texture made for the SHORE_EXTENT square over the middle of the whole sea; outside it the
// texture's edge color (open sea) repeats
function centered(texture: Texture) {
  const repeat = SEA_SIZE / SHORE_EXTENT;
  texture.repeat.set(repeat, repeat);
  texture.offset.set(0.5 - repeat / 2, 0.5 - repeat / 2);
  return texture;
}

// The island's outline, pushed out from the center by `grow`
function ring(points: { x: number; y: number }[], grow: number) {
  return points.map(p => {
    const length = Math.hypot(p.x, p.y);
    const k = (length + grow) / length;
    return { x: p.x * k, z: p.y * k };
  });
}

// Sand under the tiles, sloping from the coast into the water as a beach
function beachGeometry(hexes: HexTile[]) {
  const outline = coastlinePoints(hexes, 1);
  const last = outline[outline.length - 1];
  if (outline.length > 1 && Math.hypot(last.x - outline[0].x, last.y - outline[0].y) < 1e-3) outline.pop();

  const levels = [
    { grow: 0.12, y: TILE_FLOOR, color: new Color('#e3cb94') },
    { grow: 0.32, y: 0.02, color: new Color('#cfb27a') },
    { grow: 0.55, y: -0.06, color: new Color('#a88f63') },
    { grow: 1.1, y: -0.5, color: new Color('#5d6f66') },
  ];
  const rings = levels.map(l => ring(outline, l.grow));

  const top = new Shape(rings[0].map(p => new Vector2(p.x, -p.z)));
  const cap = new ShapeGeometry(top);
  cap.rotateX(-Math.PI / 2);
  cap.translate(0, TILE_FLOOR, 0);
  cap.deleteAttribute('normal');
  const capColors = new Float32Array(cap.getAttribute('position').count * 3);
  for (let i = 0; i < capColors.length; i += 3) capColors.set([levels[0].color.r, levels[0].color.g, levels[0].color.b], i);
  cap.setAttribute('color', new BufferAttribute(capColors, 3));
  const capUv = cap.getAttribute('uv');
  for (let i = 0; i < capUv.count; i++) capUv.setXY(i, capUv.getX(i) * 0.35, capUv.getY(i) * 0.35);

  const n = outline.length;
  const positions: number[] = [];
  const colors: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  levels.forEach((level, li) => {
    rings[li].forEach(p => {
      positions.push(p.x, level.y, p.z);
      colors.push(level.color.r, level.color.g, level.color.b);
      uvs.push(p.x * 0.35, p.z * 0.35);
    });
  });
  for (let li = 0; li < levels.length - 1; li++) {
    for (let j = 0; j < n; j++) {
      const a = li * n + j;
      const b = li * n + ((j + 1) % n);
      const c = (li + 1) * n + j;
      const d = (li + 1) * n + ((j + 1) % n);
      // outwards and upwards: check against the radial direction of the edge
      const ax = positions[a * 3], az = positions[a * 3 + 2];
      const bx = positions[b * 3], bz = positions[b * 3 + 2];
      const nx = -(bz - az);
      const nz = bx - ax;
      if (nx * (ax + bx) + nz * (az + bz) > 0) indices.push(a, c, b, b, c, d); else indices.push(a, b, c, b, d, c);
    }
  }
  const slope = new BufferGeometry();
  slope.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  slope.setAttribute('color', new BufferAttribute(new Float32Array(colors), 3));
  slope.setAttribute('uv', new BufferAttribute(new Float32Array(uvs), 2));
  slope.setIndex(indices);

  const merged = mergeGeometries([cap.toNonIndexed(), slope.toNonIndexed()]);
  merged.computeVertexNormals();
  return merged;
}

let sand: Texture | null = null;
function sandMap() {
  if (!sand) {
    sand = sandTexture();
    sand.wrapS = sand.wrapT = RepeatWrapping;
  }
  return sand;
}

export function Beach({ hexes, signature }: { hexes: HexTile[]; signature: string }) {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const geometry = useMemo(() => beachGeometry(hexes), [signature]);
  const material = useMemo(() => new MeshStandardMaterial({ vertexColors: true, map: sandMap(), roughness: 0.95 }), []);
  return <mesh geometry={geometry} material={material} receiveShadow />;
}

function drift(texture: Texture, dx: number, dy: number) {
  texture.offset.x += dx;
  texture.offset.y += dy;
}

interface OceanProps {
  hexes: HexTile[];
  signature: string; // changes only when the island changes
  reflections: boolean;
}

// The sea: colored by depth around the coast, rippling normals that catch the sky and the sun, surf at
// the shore and, on Ultra, real mirror reflections of the island and the boats
export default function Ocean({ hexes, signature, reflections }: OceanProps) {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const shore = useMemo(() => centered(shoreTexture(hexes)), [signature]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const surf = useMemo(() => surfTexture(hexes), [signature]);
  const ripples = useMemo(() => {
    const big = waterNormals().clone();
    big.repeat.set(SEA_SIZE / 7, SEA_SIZE / 7);
    const small = waterNormals().clone();
    small.repeat.set(SEA_SIZE / 2.6, SEA_SIZE / 2.6);
    small.rotation = 0.9;
    return { big, small };
  }, []);
  const surfMaterial = useRef<MeshBasicMaterial>(null);

  useFrame(({ clock }, delta) => {
    if (prefersReducedMotion()) return;
    drift(ripples.big, delta * 0.006, delta * 0.0035);
    drift(ripples.small, -delta * 0.009, delta * 0.006);
    if (surfMaterial.current) surfMaterial.current.opacity = 0.55 + Math.sin(clock.elapsedTime * 0.9) * 0.25;
  });

  return (
    <>
      <mesh rotation-x={-Math.PI / 2} receiveShadow>
        <planeGeometry args={[SEA_SIZE, SEA_SIZE]} />
        {reflections ? (
          <MeshReflectorMaterial
            map={shore} normalMap={ripples.small} normalScale={[0.35, 0.35]}
            roughness={0.25} metalness={0.05} envMapIntensity={1}
            resolution={1024} blur={[320, 90]} mixBlur={0.7} mixStrength={2.4} mixContrast={1.1}
            mirror={0.75} depthScale={0.4} minDepthThreshold={0.6} maxDepthThreshold={1.2}
            distortion={0.35} distortionMap={ripples.big}
          />
        ) : (
          <meshPhysicalMaterial
            map={shore} normalMap={ripples.big} normalScale={[0.35, 0.35]}
            roughness={0.14} metalness={0} ior={1.333} specularIntensity={1}
            clearcoat={1} clearcoatRoughness={0.03} clearcoatNormalMap={ripples.small} clearcoatNormalScale={[0.5, 0.5]}
          />
        )}
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position-y={0.008} renderOrder={1}>
        <planeGeometry args={[SHORE_EXTENT, SHORE_EXTENT]} />
        <meshBasicMaterial ref={surfMaterial} map={surf} transparent depthWrite={false} opacity={0.6} toneMapped={false}
          color="#dff4f6" />
      </mesh>
    </>
  );
}
