import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import {
  BoxGeometry, CylinderGeometry, ExtrudeGeometry, MeshStandardMaterial, Shape, SphereGeometry, SpriteMaterial, type Group,
} from 'three';
import { RESOURCE_INFO, hexCornerPixel, type Port } from '../Board/boardTypes';
import { hexPosition } from './layout';
import { portTexture, woodTexture } from './textures';

const WOOD = new MeshStandardMaterial({ map: woodTexture(), roughness: 0.75 });
const DARK_WOOD = new MeshStandardMaterial({ map: woodTexture(), color: '#7a5a42', roughness: 0.8 });
const SAIL = new MeshStandardMaterial({ color: '#f3ecdc', roughness: 0.95 });
const LANTERN = new MeshStandardMaterial({ color: '#ffe2a8', emissive: '#ffb347', emissiveIntensity: 2.5, toneMapped: false });
const PLANK = new BoxGeometry(1, 0.03, 0.12);
const POST = new CylinderGeometry(0.022, 0.026, 0.42, 8);
const MAST = new CylinderGeometry(0.014, 0.016, 0.46, 8);
const LAMP = new SphereGeometry(0.03, 12, 8);

// A rowing boat's hull: a pointed outline, extruded and bevelled
const HULL = (() => {
  const shape = new Shape();
  shape.moveTo(-0.3, 0);
  shape.quadraticCurveTo(-0.28, 0.12, 0, 0.12);
  shape.quadraticCurveTo(0.3, 0.12, 0.36, 0);
  shape.quadraticCurveTo(0.3, -0.12, 0, -0.12);
  shape.quadraticCurveTo(-0.28, -0.12, -0.3, 0);
  const geometry = new ExtrudeGeometry(shape, { depth: 0.09, bevelEnabled: true, bevelSize: 0.02, bevelThickness: 0.03, bevelSegments: 3 });
  geometry.rotateX(Math.PI / 2);
  geometry.translate(0, 0.05, 0);
  return geometry;
})();
const SAIL_SHAPE = (() => {
  const shape = new Shape();
  shape.moveTo(0, 0);
  shape.lineTo(0, 0.32);
  shape.quadraticCurveTo(0.12, 0.14, 0.24, 0.02);
  shape.lineTo(0, 0);
  return new ExtrudeGeometry(shape, { depth: 0.006, bevelEnabled: false });
})();

// A boat moored off the coast, with a pier to the two corners that can use the port
export default function PortBoat({ port }: { port: Port }) {
  const boat = useRef<Group>(null);
  const a = hexCornerPixel(port.hexQ, port.hexR, port.edgeDir, 1);
  const b = hexCornerPixel(port.hexQ, port.hexR, (port.edgeDir + 1) % 6, 1);
  const [cx, , cz] = hexPosition(port.hexQ, port.hexR);
  const midX = (a.x + b.x) / 2;
  const midZ = (a.y + b.y) / 2;
  const out = Math.hypot(midX - cx, midZ - cz);
  const ox = (midX - cx) / out;
  const oz = (midZ - cz) / out;
  const x = midX + ox * 0.85;
  const z = midZ + oz * 0.85;
  const phase = port.hexQ * 2 + port.hexR;

  const label = port.type === '3:1' ? '3:1' : `2:1 ${RESOURCE_INFO[port.type].emoji}`;
  const sign = useMemo(() => new SpriteMaterial({ map: portTexture(label), depthWrite: false }), [label]);

  useFrame(({ clock }) => {
    if (!boat.current) return;
    boat.current.position.y = Math.sin(clock.elapsedTime * 1.4 + phase) * 0.018;
    boat.current.rotation.x = Math.sin(clock.elapsedTime * 1.1 + phase) * 0.05;
    boat.current.rotation.z = Math.sin(clock.elapsedTime * 0.9 + phase * 2) * 0.03;
  });

  return (
    <>
      {[a, b].map((corner, i) => {
        // pier from the corner out to the boat, on posts
        const ex = x - ox * 0.25;
        const ez = z - oz * 0.25;
        const length = Math.hypot(corner.x - ex, corner.y - ez);
        const mx = (corner.x + ex) / 2;
        const mz = (corner.y + ez) / 2;
        return (
          <group key={i}>
            <mesh geometry={PLANK} material={WOOD} scale={[length, 1, 1]} position={[mx, 0.13, mz]}
              rotation-y={-Math.atan2(corner.y - ez, corner.x - ex)} castShadow receiveShadow />
            <mesh geometry={POST} material={DARK_WOOD} position={[ex, 0.0, ez]} castShadow />
            <mesh geometry={POST} material={DARK_WOOD} position={[mx, 0.0, mz]} castShadow />
          </group>
        );
      })}
      <group position={[x, 0, z]} rotation-y={-Math.atan2(b.y - a.y, b.x - a.x)}>
        <group ref={boat}>
          <mesh geometry={HULL} material={DARK_WOOD} castShadow receiveShadow />
          <mesh geometry={MAST} material={WOOD} position-y={0.3} castShadow />
          <mesh geometry={SAIL_SHAPE} material={SAIL} position={[0.012, 0.13, 0]} castShadow />
          <mesh geometry={LAMP} material={LANTERN} position={[-0.24, 0.13, 0]} />
        </group>
      </group>
      <sprite material={sign} position={[x, 0.78, z]} scale={[0.68, 0.3, 1]} renderOrder={2} />
    </>
  );
}
