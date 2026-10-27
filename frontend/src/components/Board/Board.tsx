import type { BoardData, GameView } from './boardTypes';
import { axialToPixel, buildCoastlinePath, hexCornerPixel, vertexKeyToPixel, edgeToPixel } from './boardTypes';
import Hex from './Hex';
import './Board.css';

interface BoardProps {
  board: BoardData;
  game: GameView;
  highlightVertices: string[];
  highlightEdges: string[];
  onVertexClick: (vertexKey: string) => void;
  onEdgeClick: (edgeKey: string) => void;
}

const HEX_SIZE = 52;
const OUTLINE = '#1d1d1d';

export default function Board({ board, game, highlightVertices, highlightEdges, onVertexClick, onEdgeClick }: BoardProps) {
  const hexPositions = board.hexes.map(hex => {
    const { x, y } = axialToPixel(hex.q, hex.r, HEX_SIZE);
    return { hex, x, y };
  });

  const coastPath = buildCoastlinePath(board.hexes, HEX_SIZE);

  const allXs = hexPositions.map(h => h.x);
  const allYs = hexPositions.map(h => h.y);
  const padding = HEX_SIZE * 2.5;
  const minX = Math.min(...allXs) - padding;
  const minY = Math.min(...allYs) - padding;
  const width = Math.max(...allXs) + padding - minX;
  const height = Math.max(...allYs) + padding - minY;

  const colorOf = (userId: string) => game.players[userId]?.color ?? '#888';
  const [robberQ, robberR] = game.robberHex.split(',').map(Number);
  const robberCenter = axialToPixel(robberQ, robberR, HEX_SIZE);

  return (
    <div className="board-container">
      <svg viewBox={`${minX} ${minY} ${width} ${height}`} className="board-svg">
        <defs>
          <radialGradient id="ocean-grad" cx="50%" cy="50%" r="60%">
            <stop offset="0%" stopColor="#1a7fb5" />
            <stop offset="100%" stopColor="#0d4f73" />
          </radialGradient>
          <pattern id="waves" x="0" y="0" width="40" height="20" patternUnits="userSpaceOnUse">
            <path d="M0 10 Q10 0 20 10 Q30 20 40 10" fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="1.5" />
          </pattern>
        </defs>

        {/* Ocean background */}
        <rect x={minX} y={minY} width={width} height={height} fill="url(#ocean-grad)" rx={20} />
        <rect x={minX} y={minY} width={width} height={height} fill="url(#waves)" rx={20} />

        {/* Sandy coastline */}
        {coastPath && (
          <>
            <path d={coastPath} fill="none" stroke="#b8923a" strokeWidth={10} strokeLinejoin="round" opacity={0.35} />
            <path d={coastPath} fill="none" stroke="#d4a843" strokeWidth={6} strokeLinejoin="round" opacity={0.5} />
            <path d={coastPath} fill="none" stroke="#e8c96a" strokeWidth={3} strokeLinejoin="round" opacity={0.7} />
          </>
        )}

        {/* Land hex tiles */}
        {hexPositions.map(({ hex, x, y }) => (
          <Hex key={`${hex.q},${hex.r}`} hex={hex} cx={x} cy={y} size={HEX_SIZE} />
        ))}

        {/* Ports */}
        {board.ports.map((port, i) => {
          const a = hexCornerPixel(port.hexQ, port.hexR, port.edgeDir, HEX_SIZE);
          const b = hexCornerPixel(port.hexQ, port.hexR, (port.edgeDir + 1) % 6, HEX_SIZE);
          const midPX = (a.x + b.x) / 2;
          const midPY = (a.y + b.y) / 2;
          const { x: hexCx, y: hexCy } = axialToPixel(port.hexQ, port.hexR, HEX_SIZE);
          const dx = midPX - hexCx;
          const dy = midPY - hexCy;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const shipX = midPX + (dx / dist) * HEX_SIZE * 0.7;
          const shipY = midPY + (dy / dist) * HEX_SIZE * 0.7;
          const label = port.type === '3:1' ? '3:1' : '2:1';
          const emoji = port.type !== '3:1' ? portEmoji(port.type) : '⚓';

          return (
            <g key={`port-${i}`}>
              <line x1={shipX} y1={shipY} x2={a.x} y2={a.y}
                stroke="#6b4c1e" strokeWidth={2.5} strokeLinecap="round" strokeDasharray="4 3" opacity={0.7} />
              <line x1={shipX} y1={shipY} x2={b.x} y2={b.y}
                stroke="#6b4c1e" strokeWidth={2.5} strokeLinecap="round" strokeDasharray="4 3" opacity={0.7} />
              <circle cx={a.x} cy={a.y} r={4} fill="#f5e6a3" stroke="#8b6914" strokeWidth={1.5} />
              <circle cx={b.x} cy={b.y} r={4} fill="#f5e6a3" stroke="#8b6914" strokeWidth={1.5} />
              <ellipse cx={shipX} cy={shipY} rx={HEX_SIZE * 0.32} ry={HEX_SIZE * 0.22}
                fill="#8B5E3C" stroke="#5C3A1E" strokeWidth={2} />
              <ellipse cx={shipX} cy={shipY - 2} rx={HEX_SIZE * 0.26} ry={HEX_SIZE * 0.14}
                fill="#C4975A" stroke="none" />
              <text x={shipX} y={shipY - 2} textAnchor="middle" dominantBaseline="central"
                fontSize={HEX_SIZE * 0.19} fontWeight="bold" fill="#fff">{label}</text>
              <text x={shipX} y={shipY + HEX_SIZE * 0.28} textAnchor="middle" dominantBaseline="central"
                fontSize={HEX_SIZE * 0.22}>{emoji}</text>
            </g>
          );
        })}

        {/* Roads: a dark outline under the player's color keeps light colors visible */}
        {Object.entries(game.roads).map(([edgeKey, owner]) => {
          const [v1, v2] = edgeKey.split('|');
          const p1 = vertexKeyToPixel(v1, HEX_SIZE);
          const p2 = vertexKeyToPixel(v2, HEX_SIZE);
          return (
            <g key={`road-${edgeKey}`}>
              <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke={OUTLINE} strokeWidth={8} strokeLinecap="round" />
              <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke={colorOf(owner)} strokeWidth={5} strokeLinecap="round" />
            </g>
          );
        })}

        {/* Settlements and cities */}
        {Object.entries(game.buildings).map(([vertexKey, building]) => {
          const { x, y } = vertexKeyToPixel(vertexKey, HEX_SIZE);
          const shape = building.type === 'city' ? CITY_SHAPE : SETTLEMENT_SHAPE;
          return (
            <polygon key={`building-${vertexKey}`}
              points={shape.map(([dx, dy]) => `${x + dx},${y + dy}`).join(' ')}
              fill={colorOf(building.owner)} stroke={OUTLINE} strokeWidth={1.8} strokeLinejoin="round" />
          );
        })}

        {/* Robber */}
        <g transform={`translate(${robberCenter.x - HEX_SIZE * 0.5},${robberCenter.y})`} pointerEvents="none">
          <ellipse cx={0} cy={12} rx={9} ry={3.5} fill="rgba(0,0,0,0.4)" />
          <path d="M-7,12 Q-7,-2 0,-4 Q7,-2 7,12 Z" fill="#3d3d3d" stroke="#ddd" strokeWidth={1} />
          <circle cx={0} cy={-8} r={5.5} fill="#3d3d3d" stroke="#ddd" strokeWidth={1} />
        </g>

        {/* Clickable spots (only valid positions) */}
        {highlightEdges.map(edgeKey => {
          const [v1, v2] = edgeKey.split('|');
          const pos = edgeToPixel(v1, v2, HEX_SIZE);
          return (
            <circle key={`edge-spot-${edgeKey}`}
              cx={pos.x} cy={pos.y} r={6}
              className="clickable-spot"
              onClick={() => onEdgeClick(edgeKey)} />
          );
        })}
        {highlightVertices.map(vertexKey => {
          const pos = vertexKeyToPixel(vertexKey, HEX_SIZE);
          return (
            <circle key={`v-spot-${vertexKey}`}
              cx={pos.x} cy={pos.y} r={8}
              className="clickable-spot"
              onClick={() => onVertexClick(vertexKey)} />
          );
        })}
      </svg>
    </div>
  );
}

// Polygons centered on the vertex
const SETTLEMENT_SHAPE = [[-7, 7], [7, 7], [7, -3], [0, -10], [-7, -3]];
const CITY_SHAPE = [[-11, 8], [11, 8], [11, -3], [1, -3], [1, -9], [-5, -15], [-11, -9]];

function portEmoji(type: string): string {
  const map: Record<string, string> = {
    wood: '🌲', wool: '🐑', wheat: '🌾', brick: '🧱', ore: '⛰️',
  };
  return map[type] || '?';
}
