import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import {
  BoxGeometry, Color, CylinderGeometry, Euler, InstancedMesh, Matrix4, MeshStandardMaterial, Quaternion, SphereGeometry,
  Vector3, type BufferGeometry,
} from 'three';
import type { HexTile, TerrainType } from '../Board/boardTypes';
import { TILE_TOP, hexPosition, prefersReducedMotion, seededRandom } from './layout';
import { hexSeed, scatter, terrainHeight } from './terrain';

// Life on the island: tiny farmers, miners, lumberjacks, brickmakers, a shepherd with his dog and
// sheep, tractors and mine carts, all working the land their hex produces. Every body part of every
// figure is an instance of a handful of shapes, so the whole crowd costs a few draw calls. They stop
// on the robber's hex and jump for joy when their hex produces.

// ---------------------------------------------------------------- shapes

type Part = 'ball' | 'box' | 'leg' | 'stick' | 'body' | 'hat' | 'wheel';

const PARTS: Record<Part, BufferGeometry> = {
  ball: new SphereGeometry(1, 10, 8),
  box: new BoxGeometry(1, 1, 1),
  leg: new BoxGeometry(1, 1, 1).translate(0, -0.5, 0),   // pivots at the hip
  stick: new BoxGeometry(1, 1, 1).translate(0, 0.5, 0),  // pivots at the hands
  body: new CylinderGeometry(0.8, 1, 1, 8),
  hat: new CylinderGeometry(0.25, 1, 1, 10),
  wheel: new CylinderGeometry(1, 1, 1, 12).rotateX(Math.PI / 2),
};
const MATERIAL = new MeshStandardMaterial({ roughness: 0.75 });

// ---------------------------------------------------------------- matrices

const tmpQ = new Quaternion();
const tmpE = new Euler();
const tmpP = new Vector3();
const tmpS = new Vector3();
const HIDDEN = new Matrix4().makeScale(0, 0, 0);

function compose(out: Matrix4, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) {
  tmpQ.setFromEuler(tmpE.set(rx, ry, rz));
  return out.compose(tmpP.set(x, y, z), tmpQ, tmpS.set(sx, sy, sz));
}

// Figures are modelled at about 1:10 of a hex; this makes them a bit larger so they read when zoomed in
const FIGURE_SCALE = 1.5;

const root = new Matrix4();
const frame = new Matrix4();
const local = new Matrix4();
const out = new Matrix4();

// Writes each part's matrix (and, on the first pass, its color) into the instanced meshes. Every
// figure emits the same parts in the same order every frame, so instance indices stay stable.
class Writer {
  meshes: Partial<Record<Part, InstancedMesh>> = {};
  counts: Record<Part, number> = { ball: 0, box: 0, leg: 0, stick: 0, body: 0, hat: 0, wheel: 0 };
  colorPass = false;

  reset() {
    for (const k of Object.keys(this.counts) as Part[]) this.counts[k] = 0;
  }

  // `parent` × `local` (or just `parent` when local is omitted)
  put(part: Part, parent: Matrix4, color: Color, child?: Matrix4) {
    const i = this.counts[part]++;
    const mesh = this.meshes[part];
    if (!mesh || i >= mesh.count) return;
    mesh.setMatrixAt(i, child ? out.multiplyMatrices(parent, child) : parent);
    if (this.colorPass) mesh.setColorAt(i, color);
  }

  // Keeps the slot (and gives it its color) for a part that only shows some of the time
  hide(part: Part, color: Color) {
    const i = this.counts[part]++;
    const mesh = this.meshes[part];
    if (!mesh || i >= mesh.count) return;
    mesh.setMatrixAt(i, HIDDEN);
    if (this.colorPass) mesh.setColorAt(i, color);
  }
}

// ---------------------------------------------------------------- figures

const C = (hex: string) => new Color(hex);
const SKIN = ['#f1c9a5', '#d9a77e', '#b07a52', '#8a5a3c', '#5e3d2b'].map(C);
const SHIRTS = ['#3f6fb5', '#b8433a', '#e0b13a', '#4f8a4a', '#f2efe6', '#7a4fa0', '#d9783a'].map(C);
const TROUSERS = ['#3a3d4f', '#3f5878', '#5b4a3a'].map(C);
const WOOD = C('#7a5230');
const METAL = C('#a6adb5');
const BRICK = C('#a5462a');

type Tool = 'scythe' | 'pickaxe' | 'axe' | 'staff' | 'none';

interface PersonLook {
  skin: Color;
  shirt: Color;
  trousers: Color;
  hat: Color;
  tool: Tool;
}

interface PersonPose {
  stride: number;   // leg swing, radians
  swing: number;    // tool angle: 0 = straight up, −π/2 = pointing ahead
  carrying: boolean;
  lift: number;     // jump height
}

const TOOL_HEAD: Record<Tool, [number, number, number, number] | null> = { // x offset, scale x, y, z
  scythe: [0.018, 0.04, 0.004, 0.003],
  pickaxe: [0, 0.034, 0.006, 0.006],
  axe: [0.006, 0.013, 0.015, 0.004],
  staff: null,
  none: null,
};

function drawPerson(w: Writer, look: PersonLook, pose: PersonPose) {
  const hip = 0.03 + pose.lift;
  w.put('leg', root, look.trousers, compose(local, 0, hip, 0.006, 0, 0, pose.stride, 0.011, 0.03, 0.011));
  w.put('leg', root, look.trousers, compose(local, 0, hip, -0.006, 0, 0, -pose.stride, 0.011, 0.03, 0.011));
  w.put('body', root, look.shirt, compose(local, 0, hip + 0.016, 0, 0, 0, 0, 0.0125, 0.033, 0.0125));
  w.put('ball', root, look.skin, compose(local, 0.001, hip + 0.042, 0, 0, 0, 0, 0.0105));
  w.put('hat', root, look.hat, compose(local, 0.001, hip + 0.054, 0, 0, 0, 0, 0.017, 0.01, 0.017));

  // the tool, held at the right shoulder
  if (look.tool === 'none') {
    w.hide('stick', WOOD);
    w.hide('box', METAL);
  } else {
    frame.multiplyMatrices(root, compose(local, 0.006, hip + 0.026, -0.014, 0, 0, pose.swing));
    const length = look.tool === 'staff' ? 0.085 : 0.055;
    w.put('stick', frame, WOOD, compose(local, 0, 0, 0, 0, 0, 0, 0.004, length, 0.004));
    const head = TOOL_HEAD[look.tool];
    if (head) w.put('box', frame, METAL, compose(local, head[0], length, 0, 0, 0, 0, head[1], head[2], head[3]));
    else w.hide('box', METAL);
  }
  if (pose.carrying) w.put('box', root, BRICK, compose(local, 0.017, hip + 0.022, 0, 0, 0, 0, 0.024, 0.014, 0.016));
  else w.hide('box', BRICK);
}

const TRACTOR = { paint: C('#c4342d'), dark: C('#2b2b2b'), cabin: C('#e8e2d0'), rim: C('#e2b33c') };

function drawTractor(w: Writer, spin: number) {
  w.put('box', root, TRACTOR.paint, compose(local, 0.006, 0.03, 0, 0, 0, 0, 0.06, 0.022, 0.03));
  w.put('box', root, TRACTOR.cabin, compose(local, -0.012, 0.056, 0, 0, 0, 0, 0.026, 0.028, 0.03));
  w.put('box', root, TRACTOR.dark, compose(local, 0.03, 0.05, 0.008, 0, 0, 0, 0.004, 0.02, 0.004)); // exhaust
  for (const side of [1, -1]) {
    w.put('wheel', root, TRACTOR.dark, compose(local, -0.016, 0.02, side * 0.021, 0, 0, -spin, 0.02, 0.02, 0.01));
    w.put('wheel', root, TRACTOR.dark, compose(local, 0.026, 0.012, side * 0.018, 0, 0, -spin * 1.7, 0.012, 0.012, 0.008));
  }
}

const CART = { body: C('#6b6e73'), ore: C('#3c3f45'), rail: C('#4a3b2c') };

function drawCart(w: Writer, spin: number) {
  w.put('box', root, CART.body, compose(local, 0, 0.028, 0, 0, 0, 0, 0.042, 0.022, 0.028));
  w.put('ball', root, CART.ore, compose(local, 0, 0.04, 0, 0, 0, 0, 0.018, 0.009, 0.012));
  for (const x of [0.014, -0.014]) {
    for (const side of [1, -1]) {
      w.put('wheel', root, CART.ore, compose(local, x, 0.01, side * 0.016, 0, 0, -spin, 0.009, 0.009, 0.004));
    }
  }
}

function drawDog(w: Writer, coat: Color, stride: number) {
  w.put('box', root, coat, compose(local, 0, 0.022, 0, 0, 0, 0, 0.03, 0.013, 0.012));
  w.put('ball', root, coat, compose(local, 0.019, 0.032, 0, 0, 0, 0, 0.009, 0.008, 0.007));
  w.put('stick', root, coat, compose(local, -0.015, 0.026, 0, 0, 0, 0.9, 0.003, 0.014, 0.003));
  for (const [x, z, s] of [[0.01, 0.004, 1], [0.01, -0.004, -1], [-0.01, 0.004, -1], [-0.01, -0.004, 1]]) {
    w.put('leg', root, coat, compose(local, x, 0.017, z, 0, 0, stride * s, 0.004, 0.017, 0.004));
  }
}

const WOOL = C('#f2efe6');
const SHEEP_FACE = C('#2b2724');

function drawSheep(w: Writer, grazing: number, stride: number) {
  w.put('ball', root, WOOL, compose(local, 0, 0.045, 0, 0, 0, 0, 0.034, 0.025, 0.023));
  w.put('ball', root, SHEEP_FACE, compose(local, 0.032, 0.05 - grazing * 0.022, 0, 0, 0, -grazing * 0.5, 0.013, 0.012, 0.011));
  for (const [x, z, s] of [[0.016, 0.01, 1], [0.016, -0.01, -1], [-0.016, 0.01, -1], [-0.016, -0.01, 1]]) {
    w.put('leg', root, SHEEP_FACE, compose(local, x, 0.032, z, 0, 0, stride * s, 0.006, 0.03, 0.006));
  }
}

// ---------------------------------------------------------------- behaviour

type Kind = 'farmer' | 'miner' | 'lumberjack' | 'brickmaker' | 'shepherd' | 'wanderer' | 'tractor' | 'cart' | 'dog' | 'sheep';

interface Stop {
  x: number;
  z: number;
  pause: number; // seconds spent working here before moving on
}

interface Agent {
  kind: Kind;
  hexKey: string;
  terrain: TerrainType;
  seed: number;
  cx: number;
  cz: number;
  stops: Stop[];      // walked in a loop
  speed: number;      // world units per second
  offset: number;     // where in its cycle it starts
  look: PersonLook;
  coat: Color;
  rails?: [Stop, Stop];
}

interface Where {
  x: number;
  z: number;
  heading: number;   // direction of travel (or of the last leg while working)
  walking: boolean;
  workTime: number;  // seconds into the current pause
  leg: number;       // which leg of the loop
  distance: number;  // travelled in total, for wheels
}

const legLengths = new WeakMap<Agent, { lengths: number[]; cycle: number }>();

function locate(agent: Agent, t: number): Where {
  let cached = legLengths.get(agent);
  if (!cached) {
    const lengths = agent.stops.map((s, i) => {
      const next = agent.stops[(i + 1) % agent.stops.length];
      return Math.hypot(next.x - s.x, next.z - s.z);
    });
    const cycle = lengths.reduce((sum, l, i) => sum + l / agent.speed + agent.stops[(i + 1) % agent.stops.length].pause, 0);
    legLengths.set(agent, cached = { lengths, cycle: Math.max(cycle, 0.001) });
  }
  const { lengths, cycle } = cached;
  const loops = Math.floor((t + agent.offset) / cycle);
  let time = (t + agent.offset) - loops * cycle;
  let distance = loops * lengths.reduce((a, b) => a + b, 0);
  for (let i = 0; i < agent.stops.length; i++) {
    const from = agent.stops[i];
    const to = agent.stops[(i + 1) % agent.stops.length];
    const heading = Math.atan2(-(to.z - from.z), to.x - from.x);
    const walk = lengths[i] / agent.speed;
    if (time < walk) {
      const f = time / walk;
      return {
        x: from.x + (to.x - from.x) * f, z: from.z + (to.z - from.z) * f, heading, walking: true,
        workTime: 0, leg: i, distance: distance + lengths[i] * f,
      };
    }
    time -= walk;
    distance += lengths[i];
    if (time < to.pause) return { x: to.x, z: to.z, heading, walking: false, workTime: time, leg: i, distance };
    time -= to.pause;
  }
  const first = agent.stops[0];
  return { x: first.x, z: first.z, heading: 0, walking: false, workTime: 0, leg: 0, distance };
}

// The work each trade does with its tool while standing still
function workSwing(kind: Kind, t: number): number {
  switch (kind) {
    case 'miner': return -0.9 + Math.sin(t * 6.5) * 1.3;      // pickaxe: overhead to the ground
    case 'lumberjack': return -1.2 + Math.sin(t * 7) * 0.8;   // axe: chops at a trunk
    case 'farmer': return -1.9 + Math.sin(t * 4) * 0.35;      // scythe: low sweeps
    case 'shepherd':
    case 'wanderer': return -0.25;
    default: return 0;
  }
}

function drawAgent(w: Writer, agent: Agent, t: number, frozen: boolean, cheer: number) {
  const at = frozen ? { ...locate(agent, 0), walking: false, workTime: 0 } : locate(agent, t);
  const y = TILE_TOP + terrainHeight(agent.terrain, agent.seed, at.x, at.z);
  const lift = cheer > 0 ? Math.abs(Math.sin(cheer * 9)) * 0.03 : 0;

  // working figures turn to face what they work on: the hex's middle for miners and lumberjacks
  let heading = at.heading;
  if (!at.walking && (agent.kind === 'miner' || agent.kind === 'lumberjack')) heading = Math.atan2(at.z, -at.x);
  compose(root, agent.cx + at.x, y, agent.cz + at.z, 0, heading, 0, FIGURE_SCALE);

  const stride = at.walking ? Math.sin(at.distance * (agent.kind === 'dog' ? 160 : 90)) * 0.6 : 0;
  switch (agent.kind) {
    case 'tractor':
      drawTractor(w, at.distance / 0.02);
      return;
    case 'cart': {
      const [a, b] = agent.rails!;
      const angle = Math.atan2(-(b.z - a.z), b.x - a.x);
      const length = Math.hypot(b.x - a.x, b.z - a.z);
      const mid = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
      const railY = TILE_TOP + terrainHeight(agent.terrain, agent.seed, mid.x, mid.z);
      for (const side of [1, -1]) {
        compose(frame, agent.cx + mid.x, railY + 0.002, agent.cz + mid.z, 0, angle, 0);
        w.put('box', frame, CART.rail, compose(local, 0, 0, side * 0.014 * FIGURE_SCALE, 0, 0, 0, length + 0.06, 0.005, 0.005));
      }
      drawCart(w, at.distance / 0.009);
      return;
    }
    case 'dog':
      drawDog(w, agent.coat, stride);
      return;
    case 'sheep': {
      const grazing = at.walking ? 0 : Math.min(1, at.workTime * 2) * (0.7 + Math.sin(t * 2 + agent.offset) * 0.3);
      drawSheep(w, grazing, stride);
      return;
    }
    default: {
      let swing = workSwing(agent.kind, t + agent.offset);
      if (at.walking && agent.kind !== 'farmer') swing = agent.look.tool === 'staff' ? -0.25 : 0.25; // tool on the shoulder
      if (frozen) swing = 0.15;
      if (cheer > 0) swing = 0.5 + Math.sin(cheer * 9) * 0.3;
      // brickmakers carry a brick from the clay pit to the stack
      const carrying = agent.kind === 'brickmaker' && at.walking && at.leg === 0;
      drawPerson(w, agent.look, { stride, swing, carrying, lift });
    }
  }
}

// ---------------------------------------------------------------- who works where

const HATS: Record<string, string> = {
  farmer: '#d9b45a', miner: '#f2c230', lumberjack: '#b3302b', brickmaker: '#8c8c8c', shepherd: '#6b4a2b', wanderer: '#efe7d6',
};
const TOOLS: Record<string, Tool> = {
  farmer: 'scythe', miner: 'pickaxe', lumberjack: 'axe', brickmaker: 'none', shepherd: 'staff', wanderer: 'staff',
};

function byAngle(points: { x: number; z: number }[]) {
  return [...points].sort((a, b) => Math.atan2(a.z, a.x) - Math.atan2(b.z, b.x));
}

function crewFor(hex: HexTile, crew: number): Agent[] {
  const seed = hexSeed(hex);
  const random = seededRandom(seed * 7 + 3);
  const [cx, , cz] = hexPosition(hex.q, hex.r);
  const pick = <T,>(list: T[]) => list[Math.floor(random() * list.length)];
  const height = (x: number, z: number) => terrainHeight(hex.terrain, seed, x, z);
  const base = { hexKey: `${hex.q},${hex.r}`, terrain: hex.terrain, seed, cx, cz };
  const person = (kind: Kind): PersonLook => ({
    skin: pick(SKIN), shirt: pick(SHIRTS), trousers: pick(TROUSERS), hat: C(HATS[kind]), tool: TOOLS[kind],
  });
  const agent = (kind: Kind, stops: Stop[], speed: number, extra: Partial<Agent> = {}): Agent => ({
    ...base, kind, stops, speed, offset: random() * 40, look: person(kind), coat: C('#7a5230'), ...extra,
  });
  // places to stand: off the number token, on gentle ground
  const spots = (n: number, salt: number, maxHeight = 1, minR = 0.42) =>
    scatter(seed + salt, n * 3, minR, 0.82, 0.12).filter(p => height(p.x, p.z) < maxHeight).slice(0, n);

  const agents: Agent[] = [];
  switch (hex.terrain) {
    case 'fields': {
      const angle = random() * Math.PI;
      const along = { x: Math.cos(angle), z: Math.sin(angle) };
      for (let i = 0; i <= crew; i++) {
        const off = (i % 2 ? -1 : 1) * (0.48 + i * 0.08);
        const row = (s: number) => ({ x: along.x * s - along.z * off, z: along.z * s + along.x * off });
        agents.push(agent('farmer', [{ ...row(-0.36), pause: 1.5 }, { ...row(0.36), pause: 1.5 }], 0.045));
      }
      if (crew > 0) {
        const loop = Array.from({ length: 18 }, (_, i) => {
          const a = (i / 18) * Math.PI * 2;
          return { x: Math.cos(a) * 0.62, z: Math.sin(a) * 0.62, pause: 0 };
        });
        agents.push(agent('tractor', random() > 0.5 ? loop : loop.reverse(), 0.07));
      }
      break;
    }
    case 'mountains': {
      const ground = spots(3 + crew * 2, 21, 0.1);
      for (let i = 0; i <= crew && ground.length >= 2; i++) {
        const a = ground[(i * 2) % ground.length];
        const b = ground[(i * 2 + 1) % ground.length];
        agents.push(agent('miner', [{ ...a, pause: 5 }, { ...b, pause: 5 }], 0.035));
      }
      if (crew > 0) {
        const a = ground[ground.length - 1] ?? { x: 0.5, z: 0 };
        const dir = Math.atan2(a.z, a.x) + Math.PI / 2;
        const half = 0.15;
        const rails: [Stop, Stop] = [
          { x: a.x + Math.cos(dir) * half, z: a.z + Math.sin(dir) * half, pause: 2.5 },
          { x: a.x - Math.cos(dir) * half, z: a.z - Math.sin(dir) * half, pause: 2.5 },
        ];
        agents.push(agent('cart', rails, 0.06, { rails }));
      }
      break;
    }
    case 'forest': {
      const trees = spots(2 + crew * 2, 31);
      for (let i = 0; i <= crew && trees.length >= 2; i++) {
        agents.push(agent('lumberjack', [{ ...trees[i * 2], pause: 6 }, { ...trees[i * 2 + 1], pause: 6 }], 0.04));
      }
      break;
    }
    case 'hills': {
      // from the clay pit to the brick stacks the scenery draws
      const stacks = scatter(seed + 4, 3, 0.4, 0.75, 0.25);
      const pits = spots(2, 41);
      for (let i = 0; i <= crew && stacks.length && pits.length; i++) {
        const stack = stacks[i % stacks.length];
        const pit = pits[i % pits.length];
        agents.push(agent('brickmaker', [{ x: stack.x + 0.05, z: stack.z, pause: 1.5 }, { ...pit, pause: 2 }], 0.04));
      }
      break;
    }
    case 'pasture': {
      const loop = byAngle(spots(4, 51)).map(p => ({ ...p, pause: 2.5 }));
      if (loop.length >= 2) agents.push(agent('shepherd', loop, 0.03));
      if (crew > 0) {
        const run = byAngle(spots(5, 52, 1, 0.5)).map(p => ({ ...p, pause: 0.8 }));
        if (run.length >= 2) agents.push(agent('dog', run, 0.12, { coat: C(pick(['#3a2c22', '#8a5a2b', '#1f1f1f'])) }));
      }
      for (let i = 0; i < 4 + crew * 2; i++) {
        const grass = spots(3, 60 + i * 3).map(p => ({ ...p, pause: 4 + random() * 6 }));
        if (grass.length >= 2) agents.push(agent('sheep', grass, 0.018));
      }
      break;
    }
    case 'desert': {
      const loop = byAngle(spots(4, 71)).map(p => ({ ...p, pause: 4 }));
      if (loop.length >= 2) agents.push(agent('wanderer', loop, 0.025));
      break;
    }
  }
  return agents;
}

// ---------------------------------------------------------------- component

interface VillagersProps {
  hexes: HexTile[];
  crew: number;                 // 0 = one worker per hex, 1 = a full crew with machines and a dog
  robberHex: string;
  production: { id: number; hexKeys: string[] } | null;
}

export default function Villagers({ hexes, crew, robberHex, production }: VillagersProps) {
  const agents = useMemo(() => hexes.flatMap(hex => crewFor(hex, crew)), [hexes, crew]);
  const meshes = useRef<Partial<Record<Part, InstancedMesh | null>>>({});
  const cheering = useRef(new Map<string, number>()); // hex → when its workers started cheering (seconds)

  // How many instances of each shape the crowd needs: one dry run of the drawing
  const counts = useMemo(() => {
    const w = new Writer();
    for (const agent of agents) drawAgent(w, agent, 0, false, 0);
    return { ...w.counts };
  }, [agents]);

  const writer = useMemo(() => new Writer(), []);

  useEffect(() => {
    if (!production) return;
    const now = performance.now() / 1000;
    for (const key of production.hexKeys) cheering.current.set(key, now);
  }, [production]);

  // Colors are written once, together with the first pose
  useLayoutEffect(() => {
    paint(writer, meshes.current, agents, robberHex, cheering.current, 0, true);
  }, [writer, agents, robberHex]);

  useFrame(({ clock }) => {
    if (prefersReducedMotion()) return;
    paint(writer, meshes.current, agents, robberHex, cheering.current, clock.elapsedTime, false);
  });

  return (
    <>
      {(Object.keys(PARTS) as Part[]).filter(part => counts[part] > 0).map(part => (
        <instancedMesh key={`${part}-${counts[part]}`} ref={mesh => { meshes.current[part] = mesh; }}
          args={[PARTS[part], MATERIAL, counts[part]]} castShadow receiveShadow frustumCulled={false} />
      ))}
    </>
  );
}

function paint(writer: Writer, meshes: Partial<Record<Part, InstancedMesh | null>>, agents: Agent[], robberHex: string,
  cheering: Map<string, number>, t: number, colors: boolean) {
  writer.meshes = meshes as Partial<Record<Part, InstancedMesh>>;
  writer.colorPass = colors;
  writer.reset();
  const now = performance.now() / 1000;
  for (const agent of agents) {
    const started = cheering.get(agent.hexKey);
    const cheer = started !== undefined && now - started < 1.8 ? now - started : 0;
    drawAgent(writer, agent, t, agent.hexKey === robberHex, cheer);
  }
  for (const mesh of Object.values(meshes)) {
    if (!mesh) continue;
    mesh.instanceMatrix.needsUpdate = true;
    if (colors && mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }
}
