import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { BoxGeometry, Euler, MeshStandardMaterial, Quaternion, type Mesh } from 'three';
import { prefersReducedMotion, type Vec3 } from './layout';
import { dieFaceTexture, woodTexture } from './textures';

const SIZE = 0.5;
const CUBE = new BoxGeometry(SIZE, SIZE, SIZE);
const TRAY = new BoxGeometry(1.7, 0.08, 1.1);
const TRAY_MATERIAL = new MeshStandardMaterial({ map: woodTexture(), color: '#b08a6a', roughness: 0.7 });
const DICE_POSITION: Vec3 = [-3.25, 0.06, 4.35]; // on the water, off the board's front-left coast

// Value on each side of the cube, in the order three.js lists them: +x, -x, +y, -y, +z, -z
const SIDES = [3, 4, 1, 6, 2, 5];
// Turn that brings each value to the top
const FACE_UP: Record<number, Euler> = {
  1: new Euler(0, 0, 0),
  6: new Euler(Math.PI, 0, 0),
  2: new Euler(-Math.PI / 2, 0, 0),
  5: new Euler(Math.PI / 2, 0, 0),
  3: new Euler(0, 0, Math.PI / 2),
  4: new Euler(0, 0, -Math.PI / 2),
};

interface DieProps {
  value: number;
  rolling: boolean;
  background: string;
  pip: string;
  x: number;
  spin: number; // makes the two dice tumble differently
}

function Die({ value, rolling, background, pip, x, spin }: DieProps) {
  const ref = useRef<Mesh>(null);
  const materials = useMemo(
    () => SIDES.map(side => new MeshStandardMaterial({ map: dieFaceTexture(side, background, pip), roughness: 0.4 })),
    [background, pip],
  );
  // Resting pose: the rolled value on top, the die slightly askew
  const rest = useMemo(
    () => new Quaternion().setFromEuler(new Euler(0, spin * 0.6, 0)).multiply(new Quaternion().setFromEuler(FACE_UP[value])),
    [value, spin],
  );
  const restY = 0.04 + SIZE / 2;

  useFrame(({ clock }, delta) => {
    const die = ref.current;
    if (!die) return;
    if (rolling && !prefersReducedMotion()) {
      die.rotation.x += delta * (11 + spin * 3);
      die.rotation.y += delta * 6;
      die.rotation.z += delta * (8 - spin * 2);
      die.position.y = restY + 0.35 + Math.abs(Math.sin(clock.elapsedTime * 9 + spin * 2)) * 0.9;
    } else {
      const ease = 1 - Math.exp(-delta * 16);
      die.quaternion.slerp(rest, ease);
      die.position.y += (restY - die.position.y) * ease;
    }
  });

  return <mesh ref={ref} geometry={CUBE} material={materials} position={[x, restY, 0]} castShadow />;
}

export default function Dice3D({ dice, rolling }: { dice: [number, number] | null; rolling: boolean }) {
  if (!dice && !rolling) return null; // nobody has rolled yet
  const [a, b] = dice ?? [1, 1];
  return (
    <group position={DICE_POSITION}>
      <mesh geometry={TRAY} material={TRAY_MATERIAL} receiveShadow castShadow />
      <Die value={a} rolling={rolling} background="#c8102e" pip="#ffffff" x={-0.36} spin={1} />
      <Die value={b} rolling={rolling} background="#f2c230" pip="#2b2b2b" x={0.36} spin={-0.7} />
    </group>
  );
}
