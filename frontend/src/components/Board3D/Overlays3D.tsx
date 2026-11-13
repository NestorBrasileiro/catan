import { useEffect, useRef } from 'react';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import { CylinderGeometry, MeshStandardMaterial, RingGeometry, SphereGeometry, type Group } from 'three';
import type { HexTile, TerrainType } from '../Board/boardTypes';
import { TILE_TOP, hexKeyPosition, hexPosition, vertexPosition } from './layout';

// ---- Places where the player can act: glowing, gently pulsing markers ----

const SPOT = new MeshStandardMaterial({
  color: '#fff3a0', emissive: '#ffd400', emissiveIntensity: 2.2, transparent: true, opacity: 0.95, toneMapped: false,
});
const HEX_SPOT = new MeshStandardMaterial({
  color: '#ffe95c', emissive: '#ffc400', emissiveIntensity: 1.2, transparent: true, opacity: 0.32, depthWrite: false,
});
const HEX_RING = new MeshStandardMaterial({ color: '#ffe066', emissive: '#ffcc00', emissiveIntensity: 2, toneMapped: false });
const VERTEX_SPOT = new SphereGeometry(0.12, 20, 14);
const EDGE_SPOT = new SphereGeometry(0.11, 20, 14);
const HEX_OVERLAY = new CylinderGeometry(0.9, 0.9, 1, 6);
const HEX_OUTLINE = new RingGeometry(0.84, 0.94, 6, 1);

// A drag that moves the camera shouldn't also count as a click on the spot under it
function clicked(event: ThreeEvent<MouseEvent>, action: () => void) {
  event.stopPropagation();
  if (event.delta <= 6) action();
}

const pointer = {
  onPointerOver: (e: ThreeEvent<PointerEvent>) => { e.stopPropagation(); document.body.style.cursor = 'pointer'; },
  onPointerOut: () => { document.body.style.cursor = ''; },
};

export interface SpotsProps {
  highlightVertices: string[];
  highlightEdges: string[];
  highlightHexes: string[];
  onVertexClick: (vertexKey: string) => void;
  onEdgeClick: (edgeKey: string) => void;
  onHexClick: (hexKey: string) => void;
}

export function Spots({ highlightVertices, highlightEdges, highlightHexes, onVertexClick, onEdgeClick, onHexClick }: SpotsProps) {
  const group = useRef<Group>(null);

  useFrame(({ clock }) => {
    const pulse = 1 + Math.sin(clock.elapsedTime * 5) * 0.14;
    group.current?.traverse(spot => { if (spot.userData.pulse) spot.scale.setScalar(pulse); });
  });
  useEffect(() => () => { document.body.style.cursor = ''; }, []);

  return (
    <group ref={group}>
      {highlightHexes.map(hexKey => {
        const [x, , z] = hexKeyPosition(hexKey);
        return (
          <group key={hexKey} position={[x, 0, z]}>
            <mesh geometry={HEX_OVERLAY} material={HEX_SPOT} position-y={TILE_TOP + 0.5}
              onClick={e => clicked(e, () => onHexClick(hexKey))} {...pointer} />
            <mesh geometry={HEX_OUTLINE} material={HEX_RING} position-y={TILE_TOP + 0.02} rotation-x={-Math.PI / 2}
              rotation-z={Math.PI / 6} />
          </group>
        );
      })}
      {highlightVertices.map(vertexKey => (
        <mesh key={vertexKey} geometry={VERTEX_SPOT} material={SPOT} position={vertexPosition(vertexKey, TILE_TOP + 0.12)}
          userData={{ pulse: true }} onClick={e => clicked(e, () => onVertexClick(vertexKey))} {...pointer} />
      ))}
      {highlightEdges.map(edgeKey => {
        const [a, b] = edgeKey.split('|').map(v => vertexPosition(v));
        return (
          <mesh key={edgeKey} geometry={EDGE_SPOT} material={SPOT}
            position={[(a[0] + b[0]) / 2, TILE_TOP + 0.16, (a[2] + b[2]) / 2]}
            userData={{ pulse: true }} onClick={e => clicked(e, () => onEdgeClick(edgeKey))} {...pointer} />
        );
      })}
    </group>
  );
}

// ---- Production map: translucent columns as tall as the odds of each hex's number ----

const PIPS: Record<number, number> = { 2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 8: 5, 9: 4, 10: 3, 11: 2, 12: 1 };
const HEAT = ['#fde68a', '#fcd34d', '#fb923c', '#f05a28', '#d61f45'];
const COLUMN = new CylinderGeometry(0.86, 0.86, 1, 6);
const heatMaterials = HEAT.map(color => new MeshStandardMaterial({
  color, emissive: color, emissiveIntensity: 0.45, transparent: true, opacity: 0.42, depthWrite: false, roughness: 0.4,
}));

export function Heatmap({ hexes, robberHex }: { hexes: HexTile[]; robberHex: string }) {
  return (
    <group>
      {hexes.filter(h => h.number).map(hex => {
        const pips = PIPS[hex.number!];
        const height = 0.25 + pips * 0.24;
        const [x, , z] = hexPosition(hex.q, hex.r);
        const blocked = `${hex.q},${hex.r}` === robberHex;
        return (
          <group key={`${hex.q},${hex.r}`} position={[x, TILE_TOP + height / 2, z]}>
            <mesh geometry={COLUMN} material={heatMaterials[pips - 1]} scale={[1, height, 1]} renderOrder={3} />
            <Html center position={[0, height / 2 + 0.15, 0]} zIndexRange={[20, 0]} pointerEvents="none">
              <div className={`map-pin heat ${blocked ? 'blocked' : ''}`}>
                <strong>{hex.number}</strong>
                <span>{'•'.repeat(pips)}</span>
                <small>{Math.round((pips / 36) * 100)}%</small>
              </div>
            </Html>
          </group>
        );
      })}
    </group>
  );
}

// ---- Labels: the resource each hex produces, like place names on a map ----

const TERRAIN_NAME: Record<TerrainType, { emoji: string; name: string }> = {
  forest: { emoji: '🌲', name: 'Madeira' },
  hills: { emoji: '🧱', name: 'Tijolo' },
  pasture: { emoji: '🐑', name: 'Ovelha' },
  fields: { emoji: '🌾', name: 'Trigo' },
  mountains: { emoji: '⛰️', name: 'Minério' },
  desert: { emoji: '🏜️', name: 'Deserto' },
};

export function Labels({ hexes }: { hexes: HexTile[] }) {
  return (
    <group>
      {hexes.map(hex => {
        const [x, , z] = hexPosition(hex.q, hex.r);
        const info = TERRAIN_NAME[hex.terrain];
        return (
          <Html key={`${hex.q},${hex.r}`} center position={[x, TILE_TOP + 0.95, z]} zIndexRange={[19, 0]} pointerEvents="none">
            <div className="map-pin label"><span aria-hidden>{info.emoji}</span>{info.name}</div>
          </Html>
        );
      })}
    </group>
  );
}
