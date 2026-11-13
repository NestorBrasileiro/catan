import { useEffect, useMemo, useState } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { AdaptiveDpr, PerformanceMonitor } from '@react-three/drei';
import { NeutralToneMapping, PCFShadowMap, Vector3 } from 'three';
import type { BoardData, GameView } from '../Board/boardTypes';
import { setHexProjector } from '../Board/hexAnchor';
import {
  QUALITY_ORDER, QUALITY_PROFILES, detectQuality, useGraphics, type QualityPreset,
} from '../../services/graphics';
import Atmosphere from './Atmosphere';
import CameraRig, { FpsMeter } from './CameraRig';
import { publishStats, type ViewPadding } from './cameraBus';
import Dice3D from './Dice3D';
import Effects from './Effects';
import Ocean, { Beach } from './Ocean';
import { Heatmap, Labels, Spots, type SpotsProps } from './Overlays3D';
import { Building, Road, Robber } from './Pieces3D';
import PortBoat from './Ports3D';
import Scenery from './Scenery3D';
import Tile from './Terrain3D';
import { TILE_TOP, hexKeyPosition } from './layout';
import './Board3D.css';

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

// In 'auto', start from a guess for this device, then step down when frames drop and back up when
// there's room, never above the guess
function useAutoQuality(enabled: boolean) {
  const ceiling = useMemo(() => detectQuality(), []);
  const [level, setLevel] = useState<QualityPreset>(ceiling);
  const step = (delta: number) => setLevel(current => {
    const next = Math.min(QUALITY_ORDER.indexOf(ceiling), Math.max(0, QUALITY_ORDER.indexOf(current) + delta));
    return QUALITY_ORDER[next];
  });
  const monitor = enabled
    ? <PerformanceMonitor flipflops={4} onDecline={() => step(-1)} onIncline={() => step(1)} onFallback={() => setLevel('low')} />
    : null;
  return { level, monitor };
}

type Board3DProps = Partial<SpotsProps> & {
  board: Pick<BoardData, 'hexes' | 'ports'>;
  game?: GameView;
  rolling?: boolean;
  backdrop?: boolean; // the lobby's slowly turning island: no input, no game pieces
  padding?: ViewPadding; // where the HUD covers the map, so the island frames between the panels
};

// The whole world: the island in the sea under a real sky. The canvas fills its container; the page's
// panels float above it like map controls.
export default function Board3D({ board, game, rolling = false, backdrop = false, padding, ...spots }: Board3DProps) {
  const settings = useGraphics();
  const auto = useAutoQuality(settings.quality === 'auto');
  const preset: QualityPreset = settings.quality === 'auto' ? auto.level : settings.quality;
  const profile = QUALITY_PROFILES[preset];
  const { layers } = settings;

  useEffect(() => {
    publishStats({ preset });
  }, [preset]);

  // Island-dependent textures and geometry only rebuild when the island itself changes
  const signature = useMemo(() => board.hexes.map(h => `${h.q},${h.r},${h.terrain}`).join(';'), [board.hexes]);
  const colorOf = (userId: string) => game?.players[userId]?.color ?? '#888';
  const robberOnToken = game ? board.hexes.some(h => `${h.q},${h.r}` === game.robberHex && h.number) : false;

  return (
    <div className={`board3d ${backdrop ? 'backdrop' : ''}`}>
      <Canvas
        shadows={{ type: PCFShadowMap }}
        dpr={profile.dpr}
        gl={{ antialias: !profile.postprocessing, powerPreference: 'high-performance', toneMapping: NeutralToneMapping }}
        camera={{ fov: 38, near: 0.1, far: 1500, position: [0, 10, 9] }}
      >
        {auto.monitor}
        {settings.quality === 'auto' && <AdaptiveDpr pixelated={false} />}
        <CameraRig interactive={!backdrop} autoRotate={backdrop} intro={!backdrop} padding={padding} />
        {settings.showFps && <FpsMeter />}
        {!backdrop && <HexProjector />}

        <Atmosphere time={settings.timeOfDay} profile={profile} clouds={layers.clouds} />
        <Ocean hexes={board.hexes} signature={signature} reflections={profile.reflections} night={settings.timeOfDay === 'night'} />
        <Beach hexes={board.hexes} signature={signature} />

        {board.hexes.map(hex => (
          <Tile key={`${hex.q},${hex.r}`} hex={hex} detail={profile.terrainDetail} showNumber={layers.numbers} />
        ))}
        {layers.scenery && <Scenery hexes={board.hexes} density={profile.sceneryDensity} />}
        {layers.ports && board.ports.map((port, i) => <PortBoat key={i} port={port} />)}

        {game && (
          <>
            {Object.entries(game.roads).map(([edgeKey, owner]) => (
              <Road key={edgeKey} edgeKey={edgeKey} color={colorOf(owner)} />
            ))}
            {Object.entries(game.buildings).map(([vertexKey, building]) => (
              <Building key={`${vertexKey}-${building.type}`} vertexKey={vertexKey} type={building.type} color={colorOf(building.owner)} />
            ))}
            <Robber hexKey={game.robberHex} onToken={robberOnToken && layers.numbers} />
            <Dice3D dice={game.dice} rolling={rolling} />
          </>
        )}
        {layers.heatmap && <Heatmap hexes={board.hexes} robberHex={game?.robberHex ?? ''} />}
        {layers.labels && <Labels hexes={board.hexes} />}
        {!backdrop && spots.onVertexClick && (
          <Spots
            highlightVertices={spots.highlightVertices ?? []}
            highlightEdges={spots.highlightEdges ?? []}
            highlightHexes={spots.highlightHexes ?? []}
            onVertexClick={spots.onVertexClick}
            onEdgeClick={spots.onEdgeClick!}
            onHexClick={spots.onHexClick!}
          />
        )}

        {profile.postprocessing && (
          <Effects preset={preset} profile={profile} time={settings.timeOfDay} cinematic={settings.cinematic} />
        )}
      </Canvas>
    </div>
  );
}
