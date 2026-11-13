import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Spherical, Vector3, type Camera, type PerspectiveCamera } from 'three';
import { MapControls } from 'three/examples/jsm/controls/MapControls.js';
import { publishPose, publishStats, setCameraHandler, type ViewPadding } from './cameraBus';
import { prefersReducedMotion } from './layout';

const TARGET = new Vector3(0, 0, 0.3);
const DEFAULT_TILT = 0.74;     // radians from straight down
const TOP_DOWN = 0.02;
const MIN_DISTANCE = 3.5;
const MAX_DISTANCE = 30;
const BASE_EXTENT = 4.6;       // the base island's radius, which the framing below was tuned for

interface Goal {
  theta: number;
  phi: number;
  radius: number;
  target: Vector3;
}

function angleDelta(from: number, to: number) {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

const scratch = { spherical: new Spherical(), offset: new Vector3() };

// One frame of camera motion: the transition towards a goal, the pan limit, and the compass
function stepCamera(map: MapControls, camera: Camera, goal: { current: Goal | null },
  lastPose: { current: { heading: number; tilt: number } }, delta: number, panLimit: number) {
  const { spherical: s, offset } = scratch;
  const g = goal.current;
  if (g) {
    s.setFromVector3(offset.copy(camera.position).sub(map.target));
    const k = 1 - Math.exp(-delta * 4.5);
    const dTheta = angleDelta(s.theta, g.theta);
    s.theta += dTheta * k;
    s.phi += (g.phi - s.phi) * k;
    s.radius += (g.radius - s.radius) * k;
    map.target.lerp(g.target, k);
    camera.position.copy(map.target).add(offset.setFromSpherical(s));
    if (Math.abs(dTheta) < 0.002 && Math.abs(g.phi - s.phi) < 0.002 && Math.abs(g.radius - s.radius) < 0.01
      && map.target.distanceTo(g.target) < 0.005) goal.current = null;
  }

  // keep the island in view: the point the camera orbits can't leave it
  const t = map.target;
  t.y = 0;
  const reach = Math.hypot(t.x, t.z);
  if (reach > panLimit) {
    const pull = (reach - panLimit) / reach;
    offset.set(t.x * pull, 0, t.z * pull);
    t.sub(offset);
    camera.position.sub(offset);
  }
  map.update(delta);

  const heading = map.getAzimuthalAngle();
  const tilt = map.getPolarAngle();
  if (Math.abs(heading - lastPose.current.heading) > 0.004 || Math.abs(tilt - lastPose.current.tilt) > 0.004) {
    lastPose.current = { heading, tilt };
    publishPose({ heading, tilt });
  }
}

const NO_PADDING: ViewPadding = { top: 0, right: 0, bottom: 0, left: 0 };
const HALF_FOV = Math.tan((38 / 2) * (Math.PI / 180));

// How far back the camera must sit for the whole island to fit in the part of the screen the panels
// leave free
function fitDistance(width: number, height: number, pad: ViewPadding, extent: number) {
  const scale = extent / BASE_EXTENT;
  const freeW = Math.max(0.35, (width - pad.left - pad.right) / width);
  const freeH = Math.max(0.35, (height - pad.top - pad.bottom) / height);
  const vertical = (9.4 * scale) / (2 * HALF_FOV * freeH);
  const horizontal = (11.8 * scale) / (2 * HALF_FOV * (width / height) * freeW);
  return Math.min(MAX_DISTANCE * 0.95, Math.max(9, vertical, horizontal));
}

// Shifts the picture's center into the free part of the screen, like a web map's padding: the island
// stays centered between the panels instead of behind them
function applyPadding(camera: PerspectiveCamera, width: number, height: number, now: { x: number; y: number },
  pad: ViewPadding, delta: number) {
  const x = (pad.right - pad.left) / 2;
  const y = (pad.bottom - pad.top) / 2;
  if (Math.abs(now.x - x) < 0.5 && Math.abs(now.y - y) < 0.5 && camera.view?.fullWidth === width
    && camera.view?.fullHeight === height) return;
  const k = 1 - Math.exp(-delta * 6);
  now.x += (x - now.x) * k;
  now.y += (y - now.y) * k;
  camera.setViewOffset(width, height, now.x, now.y, width, height);
}

interface CameraRigProps {
  interactive: boolean; // false for the lobby backdrop: the page above it takes the clicks
  autoRotate?: boolean;
  intro?: boolean;      // fly in from high above when the board first appears
  padding?: ViewPadding; // screen space the floating panels cover, in CSS pixels
  extent?: number;       // the island's radius around its center, in world units
}

// Mapbox-style navigation: drag to pan, right-drag (or Ctrl+drag) to rotate and tilt, scroll to zoom
// towards the cursor. The HUD's buttons drive it through cameraBus with smooth transitions.
export default function CameraRig({
  interactive, autoRotate = false, intro = false, padding = NO_PADDING, extent = BASE_EXTENT,
}: CameraRigProps) {
  const { camera, gl, size } = useThree();
  const controls = useRef<MapControls | null>(null);
  const goal = useRef<Goal | null>(null);
  const lastPose = useRef({ heading: NaN, tilt: NaN });
  const offsetNow = useRef({ x: 0, y: 0 });
  const view = useRef({ width: size.width, height: size.height, padding });
  useEffect(() => {
    view.current = { width: size.width, height: size.height, padding };
  }, [size.width, size.height, padding]);

  useEffect(() => {
    // The lobby's backdrop sits lower and further, so the horizon and the sky show behind the island
    const homeView = (): Goal => {
      const { width, height, padding: pad } = view.current;
      return autoRotate
        ? { theta: 0.5, phi: 1.02, radius: fitDistance(width, height, NO_PADDING, extent) * 1.05, target: new Vector3(0, 0, 1.2) }
        : { theta: 0, phi: DEFAULT_TILT, radius: fitDistance(width, height, pad, extent), target: TARGET.clone() };
    };
    const home = homeView();
    offsetNow.current = { x: (padding.right - padding.left) / 2, y: (padding.bottom - padding.top) / 2 };

    const map = new MapControls(camera, gl.domElement);
    map.enableDamping = true;
    map.dampingFactor = 0.08;
    map.screenSpacePanning = false;
    map.minDistance = MIN_DISTANCE;
    map.maxDistance = MAX_DISTANCE;
    map.minPolarAngle = 0;
    map.maxPolarAngle = 1.3;
    map.zoomToCursor = true;
    map.zoomSpeed = 1.2;
    map.rotateSpeed = 0.6;
    map.enabled = interactive;
    map.autoRotate = autoRotate;
    map.autoRotateSpeed = 0.35;
    map.target.copy(home.target);

    const start = intro && !prefersReducedMotion()
      ? { theta: -1.1, phi: 0.25, radius: MAX_DISTANCE * 0.95 }
      : home;
    camera.position.copy(map.target).add(new Vector3().setFromSpherical(new Spherical(start.radius, start.phi, start.theta)));
    camera.lookAt(map.target);
    map.update();
    if (start !== home) goal.current = home;

    // The player grabbing the map cancels any transition in progress
    map.addEventListener('start', () => { goal.current = null; });
    controls.current = map;

    const spherical = new Spherical();
    setCameraHandler(command => {
      spherical.setFromVector3(camera.position.clone().sub(map.target));
      const current: Goal = { theta: spherical.theta, phi: spherical.phi, radius: spherical.radius, target: map.target.clone() };
      switch (command) {
        case 'zoomIn':
          goal.current = { ...current, radius: Math.max(MIN_DISTANCE, current.radius * 0.66) };
          break;
        case 'zoomOut':
          goal.current = { ...current, radius: Math.min(MAX_DISTANCE, current.radius * 1.5) };
          break;
        case 'north':
          goal.current = { ...current, theta: 0 };
          break;
        case 'tilt':
          goal.current = { ...current, phi: current.phi > 0.2 ? TOP_DOWN : DEFAULT_TILT };
          break;
        case 'recenter':
          goal.current = homeView();
          break;
      }
    });

    return () => {
      setCameraHandler(null);
      map.dispose();
      controls.current = null;
    };
    // the initial fit only; later resizes keep whatever view the player chose
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camera, gl]);

  useEffect(() => {
    if (controls.current) {
      controls.current.enabled = interactive;
      controls.current.autoRotate = autoRotate;
    }
  }, [interactive, autoRotate]);

  useFrame((_, delta) => {
    const { width, height, padding: pad } = view.current;
    applyPadding(camera as PerspectiveCamera, width, height, offsetNow.current, pad, delta);
    if (controls.current) stepCamera(controls.current, camera, goal, lastPose, delta, extent + 1);
  });

  return null;
}

// Frames per second, for the graphics panel
export function FpsMeter() {
  const frames = useRef(0);
  const since = useRef(0);
  useFrame(() => {
    frames.current++;
    const now = performance.now();
    if (!since.current) since.current = now;
    if (now - since.current >= 500) {
      publishStats({ fps: Math.round((frames.current * 1000) / (now - since.current)) });
      frames.current = 0;
      since.current = now;
    }
  });
  return null;
}
