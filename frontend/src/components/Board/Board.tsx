import type { BoardData, GameStateSnapshot } from './boardTypes';
import { axialToPixel, buildCoastlinePath, hexCornerPixel, vertexToPixel, edgeToPixel } from './boardTypes';
import Hex from './Hex';
import './Board.css';

interface BoardProps {
  board: BoardData;
  gameState: GameStateSnapshot | null;
  myUserId: string | null;
  onVertexClick?: (vertexKey: string) => void;
  onEdgeClick?: (edgeKey: string) => void;
}

const HEX_SIZE = 52;

export default function Board({ board, gameState, myUserId, onVertexClick, onEdgeClick }: BoardProps) {
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
  const maxX = Math.max(...allXs) + padding;
  const maxY = Math.max(...allYs) + padding;
  const width = maxX - minX;
  const height = maxY - minY;

  // Determine clickable spots
  const isMyTurn = gameState?.currentPlayerId === myUserId;
  const isSetup = gameState?.phase === 'setup';
  const showVertices = isMyTurn && isSetup && gameState?.setupStep === 'settlement';
  const showEdges = isMyTurn && isSetup && gameState?.setupStep === 'road';

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

        {/* Built roads */}
        {gameState && board.edges && board.edges.map(edge => {
          const ownerId = gameState.roads[edge.key];
          if (!ownerId) return null;
          const player = gameState.players[ownerId];
          if (!player) return null;
          const [v1s, v2s] = edge.vertices;
          const [q1, r1, d1] = v1s.split(',');
          const [q2, r2, d2] = v2s.split(',');
          const p1 = vertexToPixel(+q1, +r1, d1 as 'T' | 'B', HEX_SIZE);
          const p2 = vertexToPixel(+q2, +r2, d2 as 'T' | 'B', HEX_SIZE);
          return (
            <line key={`road-${edge.key}`}
              x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y}
              stroke={player.color} strokeWidth={5} strokeLinecap="round" />
          );
        })}

        {/* Built settlements */}
        {gameState && board.vertices && board.vertices.map(v => {
          const ownerId = gameState.settlements[v.key];
          if (!ownerId) return null;
          const player = gameState.players[ownerId];
          if (!player) return null;
          const pos = vertexToPixel(v.q, v.r, v.dir, HEX_SIZE);
          return (
            <g key={`sett-${v.key}`}>
              <rect x={pos.x - 7} y={pos.y - 9} width={14} height={14} rx={2}
                fill={player.color} stroke="#fff" strokeWidth={1.5} />
              <polygon points={`${pos.x - 8},${pos.y - 9} ${pos.x},${pos.y - 17} ${pos.x + 8},${pos.y - 9}`}
                fill={player.color} stroke="#fff" strokeWidth={1.5} />
            </g>
          );
        })}

        {/* Clickable edge spots (only valid positions) */}
        {showEdges && gameState.availableRoads && gameState.availableRoads.map(edgeKey => {
          const edge = board.edges?.find(e => e.key === edgeKey);
          if (!edge) return null;
          const pos = edgeToPixel(edge.vertices[0], edge.vertices[1], HEX_SIZE);
          return (
            <circle key={`edge-spot-${edgeKey}`}
              cx={pos.x} cy={pos.y} r={6}
              fill="rgba(255,255,100,0.5)" stroke="#ff0" strokeWidth={1}
              className="clickable-spot"
              onClick={() => onEdgeClick?.(edgeKey)} />
          );
        })}

        {/* Clickable vertex spots (only valid positions) */}
        {showVertices && gameState.availableSettlements && gameState.availableSettlements.map(vKey => {
          const v = board.vertices?.find(vv => vv.key === vKey);
          if (!v) return null;
          const pos = vertexToPixel(v.q, v.r, v.dir, HEX_SIZE);
          return (
            <circle key={`v-spot-${vKey}`}
              cx={pos.x} cy={pos.y} r={7}
              fill="rgba(255,255,100,0.6)" stroke="#ff0" strokeWidth={1.5}
              className="clickable-spot"
              onClick={() => onVertexClick?.(vKey)} />
          );
        })}

        {/* Ports */}
        {board.ports.map((port, i) => {
          const cornerA = port.edgeDir;
          const cornerB = (port.edgeDir + 1) % 6;
          const a = hexCornerPixel(port.hexQ, port.hexR, cornerA, HEX_SIZE);
          const b = hexCornerPixel(port.hexQ, port.hexR, cornerB, HEX_SIZE);
          const midPX = (a.x + b.x) / 2;
          const midPY = (a.y + b.y) / 2;
          const { x: hexCx, y: hexCy } = axialToPixel(port.hexQ, port.hexR, HEX_SIZE);
          const dx = midPX - hexCx;
          const dy = midPY - hexCy;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const nx = dx / dist;
          const ny = dy / dist;
          const shipX = midPX + nx * HEX_SIZE * 0.7;
          const shipY = midPY + ny * HEX_SIZE * 0.7;
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
      </svg>
    </div>
  );
}

function portEmoji(type: string): string {
  const map: Record<string, string> = {
    wood: '🌲', wool: '🐑', wheat: '🌾', brick: '🧱', ore: '⛰️',
  };
  return map[type] || '?';
}
