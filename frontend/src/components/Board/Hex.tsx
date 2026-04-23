import type { HexTile } from './boardTypes';
import { TERRAIN_COLORS, TERRAIN_LABELS, hexCorners } from './boardTypes';

interface HexProps {
  hex: HexTile;
  cx: number;
  cy: number;
  size: number;
}

export default function Hex({ hex, cx, cy, size }: HexProps) {
  const points = hexCorners(cx, cy, size);
  const color = TERRAIN_COLORS[hex.terrain];
  const label = TERRAIN_LABELS[hex.terrain];

  // Numbers 6 and 8 are red (most probable after 7)
  const isHot = hex.number === 6 || hex.number === 8;

  return (
    <g>
      {/* Hex shape */}
      <polygon
        points={points}
        fill={color}
        stroke="#3a2e1a"
        strokeWidth={2}
      />

      {/* Terrain icon */}
      <text
        x={cx}
        y={cy - (hex.number ? 8 : 0)}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={size * 0.4}
      >
        {label}
      </text>

      {/* Number token */}
      {hex.number && (
        <>
          <circle cx={cx} cy={cy + size * 0.25} r={size * 0.28} fill="#fdf5e6" stroke="#333" strokeWidth={1.5} />
          <text
            x={cx}
            y={cy + size * 0.26}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={size * 0.3}
            fontWeight="bold"
            fill={isHot ? '#c0392b' : '#222'}
          >
            {hex.number}
          </text>
          {/* Probability dots */}
          <text
            x={cx}
            y={cy + size * 0.44}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={size * 0.12}
            fill={isHot ? '#c0392b' : '#666'}
          >
            {probabilityDots(hex.number)}
          </text>
        </>
      )}

      {/* Robber */}
      {hex.hasRobber && (
        <text
          x={cx}
          y={cy - size * 0.35}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={size * 0.35}
        >
          🥷
        </text>
      )}
    </g>
  );
}

function probabilityDots(num: number): string {
  const counts: Record<number, number> = {
    2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 8: 5, 9: 4, 10: 3, 11: 2, 12: 1,
  };
  return '•'.repeat(counts[num] || 0);
}

