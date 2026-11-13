import { CanvasTexture, ClampToEdgeWrapping, LinearSRGBColorSpace, NoColorSpace, RepeatWrapping, SRGBColorSpace } from 'three';
import { coastlinePoints, type HexTile } from '../Board/boardTypes';
import { seededRandom } from './layout';
import { fbm } from './noise';

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
  return canvasTexture(256, 256, ctx => {
    ctx.scale(2, 2);
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


// Seamless ripples for the sea's normal map: sine waves with whole wave counts across the tile
export function waterNormalTexture(size = 512) {
  const random = seededRandom(21);
  const waves = Array.from({ length: 28 }, () => {
    const kx = Math.round((random() - 0.5) * 18);
    const ky = Math.round((random() - 0.5) * 18) || 1;
    const k = Math.hypot(kx, ky);
    return { kx, ky, phase: random() * Math.PI * 2, amp: 1 / (0.6 + k * 0.35) };
  });
  const height = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let h = 0;
      for (const w of waves) h += w.amp * Math.sin(((w.kx * x + w.ky * y) / size) * Math.PI * 2 + w.phase);
      height[y * size + x] = h;
    }
  }
  const texture = canvasTexture(size, size, ctx => {
    const image = ctx.createImageData(size, size);
    const at = (x: number, y: number) => height[((y + size) % size) * size + ((x + size) % size)];
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const dx = (at(x + 1, y) - at(x - 1, y)) * 0.9;
        const dy = (at(x, y + 1) - at(x, y - 1)) * 0.9;
        const length = Math.hypot(dx, dy, 1);
        const i = (y * size + x) * 4;
        image.data[i] = ((-dx / length) * 0.5 + 0.5) * 255;
        image.data[i + 1] = ((-dy / length) * 0.5 + 0.5) * 255;
        image.data[i + 2] = ((1 / length) * 0.5 + 0.5) * 255;
        image.data[i + 3] = 255;
      }
    }
    ctx.putImageData(image, 0, 0);
  });
  texture.colorSpace = NoColorSpace;
  texture.wrapS = texture.wrapT = RepeatWrapping;
  return texture;
}

// World units the shore textures cover, centered on the island
export const SHORE_EXTENT = 20;

// Draws the island's outline on a canvas laid over the sea, softened with a shadow blur
// (works in every browser, unlike ctx.filter)
function coastStroke(ctx: Ctx, hexes: HexTile[], px: number, width: number, blur: number, color: string, fill = false) {
  const points = coastlinePoints(hexes, 1);
  const toPx = (v: number) => (v / SHORE_EXTENT + 0.5) * px;
  const far = px * 3;
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = blur;
  ctx.shadowOffsetX = far;
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineJoin = 'round';
  ctx.lineWidth = (width / SHORE_EXTENT) * px;
  ctx.beginPath();
  points.forEach((p, i) => (i === 0 ? ctx.moveTo(toPx(p.x) - far, toPx(p.y)) : ctx.lineTo(toPx(p.x) - far, toPx(p.y))));
  ctx.closePath();
  if (fill) ctx.fill();
  ctx.stroke();
  ctx.restore();
}

// Sea color around the island: deep blue far out, turquoise shallows and a pale band at the shore
export function shoreTexture(hexes: HexTile[], px = 1024) {
  const texture = canvasTexture(px, px, ctx => {
    ctx.fillStyle = '#0b3f5f';
    ctx.fillRect(0, 0, px, px);
    const scale = px / 1024;
    coastStroke(ctx, hexes, px, 3.6, 90 * scale, 'rgba(18, 104, 140, 0.9)', true);
    coastStroke(ctx, hexes, px, 2.2, 46 * scale, 'rgba(32, 150, 165, 0.85)', true);
    coastStroke(ctx, hexes, px, 1.1, 18 * scale, 'rgba(70, 196, 190, 0.85)');
    coastStroke(ctx, hexes, px, 0.55, 6 * scale, 'rgba(170, 232, 220, 0.9)');
    // patches of darker water (seaweed, depth) break the rings up
    const random = seededRandom(4);
    ctx.globalCompositeOperation = 'multiply';
    for (let i = 0; i < 90; i++) {
      const x = random() * px;
      const y = random() * px;
      const r = (10 + random() * 40) * scale;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `rgba(40, 90, 110, ${0.15 + random() * 0.15})`);
      g.addColorStop(1, 'rgba(255, 255, 255, 0)');
      ctx.fillStyle = g;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
    ctx.globalCompositeOperation = 'source-over';
  });
  texture.wrapS = texture.wrapT = ClampToEdgeWrapping;
  return texture;
}

// White surf hugging the coast, broken up so it doesn't read as a clean line
export function surfTexture(hexes: HexTile[], px = 1024) {
  const texture = canvasTexture(px, px, ctx => {
    const scale = px / 1024;
    coastStroke(ctx, hexes, px, 0.75, 10 * scale, 'rgba(255, 255, 255, 0.95)');
    coastStroke(ctx, hexes, px, 1.3, 20 * scale, 'rgba(255, 255, 255, 0.35)');
    // knock holes into the foam with noise
    const image = ctx.getImageData(0, 0, px, px);
    for (let y = 0; y < px; y++) {
      for (let x = 0; x < px; x++) {
        const i = (y * px + x) * 4 + 3;
        if (!image.data[i]) continue;
        const n = fbm(x / (14 * scale), y / (14 * scale), 3, 3);
        image.data[i] *= Math.min(1, Math.max(0, (n - 0.32) * 2.6));
      }
    }
    ctx.putImageData(image, 0, 0);
  });
  texture.wrapS = texture.wrapT = ClampToEdgeWrapping;
  return texture;
}

// Soft puff for clouds
export function cloudTexture() {
  return canvasTexture(256, 256, ctx => {
    const random = seededRandom(8);
    for (let i = 0; i < 16; i++) {
      const x = 60 + random() * 136;
      const y = 90 + random() * 70;
      const r = 30 + random() * 50;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, 'rgba(255, 255, 255, 0.55)');
      g.addColorStop(1, 'rgba(255, 255, 255, 0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 256, 256);
    }
  });
}

// Fine grain multiplied over the terrain colors, so close-ups aren't flat
export function detailTexture() {
  const texture = canvasTexture(SIZE, SIZE, ctx => {
    const image = ctx.createImageData(SIZE, SIZE);
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        // tileable: sample noise on a torus-like wrap by blending the four shifted copies
        const u = x / SIZE;
        const v = y / SIZE;
        const n = (fbm(x / 9, y / 9, 1, 4) * (1 - u) * (1 - v) + fbm((x - SIZE) / 9, y / 9, 1, 4) * u * (1 - v)
          + fbm(x / 9, (y - SIZE) / 9, 1, 4) * (1 - u) * v + fbm((x - SIZE) / 9, (y - SIZE) / 9, 1, 4) * u * v);
        const value = 222 + n * 33;
        const i = (y * SIZE + x) * 4;
        image.data[i] = image.data[i + 1] = image.data[i + 2] = value;
        image.data[i + 3] = 255;
      }
    }
    ctx.putImageData(image, 0, 0);
  });
  texture.wrapS = texture.wrapT = RepeatWrapping;
  texture.colorSpace = LinearSRGBColorSpace;
  return texture;
}
