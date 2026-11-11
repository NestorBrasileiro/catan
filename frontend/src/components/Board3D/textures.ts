import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from 'three';
import type { TerrainType } from '../Board/boardTypes';
import { seededRandom } from './layout';

function canvasTexture(width: number, height: number, draw: (ctx: CanvasRenderingContext2D) => void) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  draw(canvas.getContext('2d')!);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

const DOTS: Record<number, number> = { 2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 8: 5, 9: 4, 10: 3, 11: 2, 12: 1 };

// Face of a number token: the number and its probability dots; 6 and 8 in red
export function tokenTexture(number: number) {
  return canvasTexture(128, 128, ctx => {
    const color = number === 6 || number === 8 ? '#c0392b' : '#222';
    ctx.fillStyle = '#fdf5e6';
    ctx.fillRect(0, 0, 128, 128);
    ctx.strokeStyle = '#b89b6a';
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.arc(64, 64, 59, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 58px system-ui, sans-serif';
    ctx.fillText(String(number), 64, 58);
    const dots = DOTS[number] ?? 0;
    for (let i = 0; i < dots; i++) {
      ctx.beginPath();
      ctx.arc(64 + (i - (dots - 1) / 2) * 13, 100, 4.5, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

// Floating sign over a port: "3:1", or "2:1" with the resource
export function portTexture(label: string) {
  return canvasTexture(256, 112, ctx => {
    ctx.fillStyle = 'rgba(60, 36, 14, 0.92)';
    ctx.beginPath();
    ctx.roundRect(4, 4, 248, 104, 26);
    ctx.fill();
    ctx.strokeStyle = '#e8c96a';
    ctx.lineWidth = 6;
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 58px system-ui, sans-serif';
    ctx.fillText(label, 128, 60);
  });
}

// Cells of a 3×3 grid that hold a pip, for faces 1 to 6
const PIPS = [[4], [2, 6], [2, 4, 6], [0, 2, 6, 8], [0, 2, 4, 6, 8], [0, 2, 3, 5, 6, 8]];

export function dieFaceTexture(value: number, background: string, pip: string) {
  return canvasTexture(128, 128, ctx => {
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, 128, 128);
    ctx.fillStyle = pip;
    for (const cell of PIPS[value - 1]) {
      ctx.beginPath();
      ctx.arc(28 + (cell % 3) * 36, 28 + Math.floor(cell / 3) * 36, 12, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

type Ctx = CanvasRenderingContext2D;
const SIZE = 256;

// Soft irregular patches of color, the base of every ground texture
function blotches(ctx: Ctx, random: () => number, colors: string[], count: number, radius: number, alpha: number) {
  ctx.globalAlpha = alpha;
  for (let i = 0; i < count; i++) {
    ctx.fillStyle = colors[Math.floor(random() * colors.length)];
    ctx.beginPath();
    ctx.ellipse(random() * SIZE, random() * SIZE, radius * (0.5 + random()), radius * (0.5 + random()), random() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function strokes(ctx: Ctx, random: () => number, color: string, count: number, length: number, width: number, alpha: number) {
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  for (let i = 0; i < count; i++) {
    const x = random() * SIZE;
    const y = random() * SIZE;
    const angle = random() * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(angle) * length, y + Math.sin(angle) * length);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

const GROUND: Record<TerrainType, (ctx: Ctx, random: () => number) => void> = {
  forest: (ctx, random) => {
    ctx.fillStyle = '#3f7d3a';
    ctx.fillRect(0, 0, SIZE, SIZE);
    blotches(ctx, random, ['#2f6a2e', '#4d8f45', '#356f33'], 70, 18, 0.5);
    strokes(ctx, random, '#255a26', 160, 5, 2, 0.5); // undergrowth
  },
  pasture: (ctx, random) => {
    ctx.fillStyle = '#8fce55';
    ctx.fillRect(0, 0, SIZE, SIZE);
    blotches(ctx, random, ['#a2dc66', '#7dbd48', '#98d45c'], 60, 20, 0.5);
    strokes(ctx, random, '#6aa83c', 220, 4, 1.5, 0.6); // grass blades
    blotches(ctx, random, ['#ffffff', '#ffe36e'], 26, 1.6, 0.9); // flowers
  },
  fields: (ctx, random) => {
    ctx.fillStyle = '#e9c64a';
    ctx.fillRect(0, 0, SIZE, SIZE);
    blotches(ctx, random, ['#f2d568', '#dcb53c'], 40, 22, 0.4);
    // plowed furrows
    ctx.strokeStyle = '#c79f2c';
    ctx.lineWidth = 3;
    ctx.globalAlpha = 0.55;
    for (let x = -SIZE; x < SIZE * 2; x += 14) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + SIZE * 0.5, SIZE);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  },
  hills: (ctx, random) => {
    ctx.fillStyle = '#c8703a';
    ctx.fillRect(0, 0, SIZE, SIZE);
    blotches(ctx, random, ['#b85f2e', '#d98548', '#a9542a'], 60, 20, 0.5);
    strokes(ctx, random, '#7e3a1a', 45, 16, 1.5, 0.45); // cracks in the clay
  },
  mountains: (ctx, random) => {
    ctx.fillStyle = '#8d9299';
    ctx.fillRect(0, 0, SIZE, SIZE);
    blotches(ctx, random, ['#7b8088', '#a1a6ad', '#6f747c'], 70, 16, 0.55);
    blotches(ctx, random, ['#5d6168', '#c3c7cc'], 300, 1.5, 0.7); // gravel
  },
  desert: (ctx, random) => {
    ctx.fillStyle = '#e6d3a0';
    ctx.fillRect(0, 0, SIZE, SIZE);
    blotches(ctx, random, ['#f0e0b4', '#d9c48c'], 40, 24, 0.5);
    // wind ripples
    ctx.strokeStyle = '#cdb67c';
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.6;
    for (let y = 8; y < SIZE; y += 16) {
      ctx.beginPath();
      for (let x = 0; x <= SIZE; x += 8) ctx.lineTo(x, y + Math.sin(x / 22 + y) * 4);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  },
};

const groundCache = new Map<TerrainType, CanvasTexture>();

export function groundTexture(terrain: TerrainType) {
  let texture = groundCache.get(terrain);
  if (!texture) {
    texture = canvasTexture(SIZE, SIZE, ctx => GROUND[terrain](ctx, seededRandom(terrain.length * 7 + terrain.charCodeAt(0))));
    groundCache.set(terrain, texture);
  }
  return texture;
}

export function sandTexture() {
  return canvasTexture(SIZE, SIZE, ctx => {
    const random = seededRandom(11);
    ctx.fillStyle = '#d9bd7a';
    ctx.fillRect(0, 0, SIZE, SIZE);
    blotches(ctx, random, ['#e6cf94', '#c9aa62'], 50, 14, 0.5);
    blotches(ctx, random, ['#b8975a', '#f3e2b0'], 500, 1.2, 0.7);
  });
}

// Wood grain along the horizontal, for boats, piers and the dice tray
export function woodTexture() {
  return canvasTexture(SIZE, SIZE, ctx => {
    const random = seededRandom(5);
    ctx.fillStyle = '#8b5e3c';
    ctx.fillRect(0, 0, SIZE, SIZE);
    for (let y = 0; y < SIZE; y += 3) {
      ctx.strokeStyle = random() > 0.5 ? '#6f4728' : '#a3744c';
      ctx.globalAlpha = 0.25 + random() * 0.35;
      ctx.lineWidth = 1 + random() * 2;
      ctx.beginPath();
      for (let x = 0; x <= SIZE; x += 16) ctx.lineTo(x, y + Math.sin(x / 40 + y) * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  });
}

// Sea surface that tiles seamlessly: darker and lighter patches with wave crests on top
export function waterTexture() {
  const texture = canvasTexture(SIZE, SIZE, ctx => {
    const random = seededRandom(3);
    ctx.fillStyle = '#1b78ad';
    ctx.fillRect(0, 0, SIZE, SIZE);
    // everything is drawn nine times, shifted by one tile, so the edges match
    const tiled = (draw: (dx: number, dy: number) => void) => {
      for (const dx of [-SIZE, 0, SIZE]) for (const dy of [-SIZE, 0, SIZE]) draw(dx, dy);
    };
    for (let i = 0; i < 26; i++) {
      const x = random() * SIZE;
      const y = random() * SIZE;
      const rx = 18 + random() * 30;
      const ry = 8 + random() * 12;
      ctx.fillStyle = random() > 0.5 ? '#2389c2' : '#156797';
      ctx.globalAlpha = 0.35;
      tiled((dx, dy) => {
        ctx.beginPath();
        ctx.ellipse(x + dx, y + dy, rx, ry, 0, 0, Math.PI * 2);
        ctx.fill();
      });
    }
    ctx.strokeStyle = '#d8f1ff';
    ctx.lineCap = 'round';
    for (let i = 0; i < 34; i++) {
      const x = random() * SIZE;
      const y = random() * SIZE;
      const length = 14 + random() * 26;
      ctx.lineWidth = 1.2 + random() * 1.4;
      ctx.globalAlpha = 0.25 + random() * 0.3;
      tiled((dx, dy) => {
        ctx.beginPath();
        ctx.moveTo(x + dx, y + dy);
        ctx.quadraticCurveTo(x + dx + length / 2, y + dy - 5, x + dx + length, y + dy);
        ctx.stroke();
      });
    }
    ctx.globalAlpha = 1;
  });
  texture.wrapS = texture.wrapT = RepeatWrapping;
  texture.repeat.set(28, 28);
  return texture;
}
