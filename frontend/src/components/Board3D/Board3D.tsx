import { useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import {
  BoxGeometry, CylinderGeometry, MeshStandardMaterial, PCFSoftShadowMap, SphereGeometry, SpriteMaterial, Vector3,
  type Group,
} from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RESOURCE_INFO, hexCornerPixel, type BoardData, type GameView, type Port } from '../Board/boardTypes';
import { setHexProjector } from '../Board/hexAnchor';
import Dice3D from './Dice3D';
import { Building, Road, Robber } from './Pieces3D';
import Tile from './Terrain3D';
import { TILE_TOP, hexKeyPosition, hexPosition, vertexPosition, type Vec3 } from './layout';
import { portTexture, waterTexture, woodTexture } from './textures';
import './Board3D.css';

interface Board3DProps {
  board: BoardData;
  game: GameView;
  rolling: boolean;
  highlightVertices: string[];
  highlightEdges: string[];
  highlightHexes: string[];
  onVertexClick: (vertexKey: string) => void;
  onEdgeClick: (edgeKey: string) => void;
  onHexClick: (hexKey: string) => void;
}

const SEA = '#0d4f73';
const CAMERA: Vec3 = [0, 9.6, 8.4];

const WOOD = new MeshStandardMaterial({ map: woodTexture(), roughness: 0.8 });
const SHALLOWS = new MeshStandardMaterial({ color: '#6fd0e6', transparent: true, opacity: 0.4, roughness: 0.3 });
const SHALLOWS_SHAPE = new CylinderGeometry(1.22, 1.22, 0.02, 6);
const SAIL = new MeshStandardMaterial({ color: '#f5efe0', roughness: 0.9 });
const PLANK = new BoxGeometry(1, 0.03, 0.09);
const HULL = new BoxGeometry(0.55, 0.14, 0.24);
const MAST = new CylinderGeometry(0.015, 0.015, 0.4, 6);
const SAIL_SHAPE = new BoxGeometry(0.26, 0.26, 0.015);

const SPOT = new MeshStandardMaterial({ color: '#ffe95c', emissive: '#ffd400', emissiveIntensity: 0.9, transparent: true, opacity: 0.9 });
const HEX_SPOT = new MeshStandardMaterial({ color: '#ffe95c', emissive: '#ffd400', emissiveIntensity: 0.5, transparent: true, opacity: 0.35 });
const VERTEX_SPOT = new SphereGeometry(0.13, 16, 12);
const EDGE_SPOT = new SphereGeometry(0.12, 16, 12);
const HEX_OVERLAY = new CylinderGeometry(0.86, 0.86, 0.03, 6);

// Drag to orbit, scroll or pinch to zoom; the camera can't go under the table
function CameraControls() {
  const { camera, gl, size } = useThree();
  const controls = useRef<OrbitControls | null>(null);

  useEffect(() => {
    // A narrow screen needs the camera further back to fit the whole island
    const fit = Math.max(1, 1.2 / (size.width / size.height));
    camera.position.set(CAMERA[0], CAMERA[1] * fit, CAMERA[2] * fit);
    const orbit = new OrbitControls(camera, gl.domElement);
    orbit.target.set(0, 0, 0.4);
    orbit.enablePan = false;
    orbit.enableDamping = true;
    orbit.minDistance = 6;
    orbit.maxDistance = 30;
    orbit.maxPolarAngle = Math.PI * 0.44;
    controls.current = orbit;
    return () => orbit.dispose();
    // the initial fit only; later resizes keep whatever view the player chose
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camera, gl]);

  useFrame(() => controls.current?.update());
  return null;
}

const WATER = waterTexture();
const SEA_MATERIAL = new MeshStandardMaterial({ map: WATER, roughness: 0.3, metalness: 0.15 });

// The waves drift slowly across the water
function Sea() {
  useFrame((_, delta) => {
    WATER.offset.x += delta * 0.012;
    WATER.offset.y += delta * 0.006;
  });
  return (
    <mesh rotation-x={-Math.PI / 2} material={SEA_MATERIAL} receiveShadow>
      <circleGeometry args={[70, 48]} />
    </mesh>
  );
}

// Lets the page know where a hex is on screen, for the cards that fly out of it
function HexProjector() {
  const { camera, gl } = useThree();
  useEffect(() => {
    const point = new Vector3();
    setHexProjector(hexKey => {
      point.set(...hexKeyPosition(hexKey, TILE_TOP + 0.3)).project(camera);
      const rect = gl.domElement.getBoundingClientRect();
      return { x: rect.left + ((point.x + 1) / 2) * rect.width, y: rect.top + ((1 - point.y) / 2) * rect.height };
    });
    return () => setHexProjector(null);
  }, [camera, gl]);
  return null;
}

// A small boat moored off the coast, tied to the two corners that can use the port
function PortBoat({ port }: { port: Port }) {
  const boat = useRef<Group>(null);
  const a = hexCornerPixel(port.hexQ, port.hexR, port.edgeDir, 1);
  const b = hexCornerPixel(port.hexQ, port.hexR, (port.edgeDir + 1) % 6, 1);
  const [cx, , cz] = hexPosition(port.hexQ, port.hexR);
  const midX = (a.x + b.x) / 2;
  const midZ = (a.y + b.y) / 2;
  const out = Math.hypot(midX - cx, midZ - cz);
  const x = midX + ((midX - cx) / out) * 0.8;
  const z = midZ + ((midZ - cz) / out) * 0.8;
  const phase = port.hexQ * 2 + port.hexR;

  const label = port.type === '3:1' ? '3:1' : `2:1 ${RESOURCE_INFO[port.type].emoji}`;
  const sign = useMemo(() => new SpriteMaterial({ map: portTexture(label) }), [label]);

  useFrame(({ clock }) => {
    if (!boat.current) return;
    boat.current.position.y = 0.05 + Math.sin(clock.elapsedTime * 1.5 + phase) * 0.02;
    boat.current.rotation.z = Math.sin(clock.elapsedTime * 1.1 + phase) * 0.05;
  });

  return (
    <>
      {[a, b].map((corner, i) => {
        const length = Math.hypot(corner.x - x, corner.y - z);
        return (
          <mesh key={i} geometry={PLANK} material={WOOD} scale={[length, 1, 1]}
            position={[(corner.x + x) / 2, 0.11, (corner.y + z) / 2]}
            rotation-y={-Math.atan2(corner.y - z, corner.x - x)} castShadow />
        );
      })}
      <group position={[x, 0, z]} rotation-y={-Math.atan2(b.y - a.y, b.x - a.x)}>
        <group ref={boat}>
          <mesh geometry={HULL} material={WOOD} castShadow />
          <mesh geometry={MAST} material={WOOD} position-y={0.25} castShadow />
          <mesh geometry={SAIL_SHAPE} material={SAIL} position={[0.01, 0.28, 0]} castShadow />
        </group>
      </group>
      <sprite material={sign} position={[x, 0.85, z]} scale={[0.95, 0.42, 1]} />
    </>
  );
}

// A drag that orbits the camera shouldn't also count as a click on the spot under it
function clicked(event: ThreeEvent<MouseEvent>, action: () => void) {
  event.stopPropagation();
  if (event.delta <= 5) action();
}

const pointer = {
  onPointerOver: () => { document.body.style.cursor = 'pointer'; },
  onPointerOut: () => { document.body.style.cursor = ''; },
};

// Glowing, gently pulsing markers on the places where the player can act
function Spots({ highlightVertices, highlightEdges, highlightHexes, onVertexClick, onEdgeClick, onHexClick }: Pick<Board3DProps,
  'highlightVertices' | 'highlightEdges' | 'highlightHexes' | 'onVertexClick' | 'onEdgeClick' | 'onHexClick'>) {
  const group = useRef<Group>(null);

  useFrame(({ clock }) => {
    const pulse = 1 + Math.sin(clock.elapsedTime * 5) * 0.14;
    group.current?.children.forEach(spot => { if (spot.userData.pulse) spot.scale.setScalar(pulse); });
  });
  useEffect(() => () => { document.body.style.cursor = ''; }, []);

  return (
    <group ref={group}>
      {highlightHexes.map(hexKey => (
        <mesh key={hexKey} geometry={HEX_OVERLAY} material={HEX_SPOT} position={hexKeyPosition(hexKey, TILE_TOP + 0.03)}
          onClick={e => clicked(e, () => onHexClick(hexKey))} {...pointer} />
      ))}
      {highlightVertices.map(vertexKey => (
        <mesh key={vertexKey} geometry={VERTEX_SPOT} material={SPOT} position={vertexPosition(vertexKey, TILE_TOP + 0.1)}
          userData={{ pulse: true }} onClick={e => clicked(e, () => onVertexClick(vertexKey))} {...pointer} />
      ))}
      {highlightEdges.map(edgeKey => {
        const [a, b] = edgeKey.split('|').map(v => vertexPosition(v));
        return (
          <mesh key={edgeKey} geometry={EDGE_SPOT} material={SPOT}
            position={[(a[0] + b[0]) / 2, TILE_TOP + 0.22, (a[2] + b[2]) / 2]}
            userData={{ pulse: true }} onClick={e => clicked(e, () => onEdgeClick(edgeKey))} {...pointer} />
        );
      })}
    </group>
  );
}

export default function Board3D({ board, game, rolling, ...spots }: Board3DProps) {
  const colorOf = (userId: string) => game.players[userId]?.color ?? '#888';

  return (
    <div className="board3d">
      <Canvas shadows={{ type: PCFSoftShadowMap }} dpr={[1, 2]} camera={{ position: CAMERA, fov: 40 }}>
        <color attach="background" args={[SEA]} />
        <fog attach="fog" args={[SEA, 24, 60]} />
        <hemisphereLight args={['#dff1ff', '#35604a', 1.1]} />
        <directionalLight position={[6, 12, 5]} intensity={2.4} castShadow
          shadow-mapSize={[2048, 2048]} shadow-camera-left={-9} shadow-camera-right={9}
          shadow-camera-top={9} shadow-camera-bottom={-9} shadow-bias={-0.0004} />
        <CameraControls />
        <HexProjector />

        <Sea />
        {board.hexes.map(hex => (
          <mesh key={`${hex.q},${hex.r}`} geometry={SHALLOWS_SHAPE} material={SHALLOWS} position={hexPosition(hex.q, hex.r, 0.012)} />
        ))}

        {board.hexes.map(hex => <Tile key={`${hex.q},${hex.r}`} hex={hex} />)}
        {board.ports.map((port, i) => <PortBoat key={i} port={port} />)}

        {Object.entries(game.roads).map(([edgeKey, owner]) => (
          <Road key={edgeKey} edgeKey={edgeKey} color={colorOf(owner)} />
        ))}
        {Object.entries(game.buildings).map(([vertexKey, building]) => (
          <Building key={`${vertexKey}-${building.type}`} vertexKey={vertexKey} type={building.type} color={colorOf(building.owner)} />
        ))}
        <Robber hexKey={game.robberHex} />
        <Dice3D dice={game.dice} rolling={rolling} />
        <Spots {...spots} />
      </Canvas>
      <p className="board3d-hint">Arraste para girar · role para aproximar</p>
    </div>
  );
}
