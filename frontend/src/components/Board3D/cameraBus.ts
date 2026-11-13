// Connects the map buttons in the page (zoom, compass, tilt) to the camera inside the 3D canvas

// Screen space covered by floating panels, in CSS pixels
export interface ViewPadding {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export type CameraCommand = 'zoomIn' | 'zoomOut' | 'north' | 'tilt' | 'recenter';

export interface CameraPose {
  heading: number; // radians, 0 = north (the board's default side)
  tilt: number;    // radians from straight down
}

let handler: ((command: CameraCommand) => void) | null = null;
let pose: CameraPose = { heading: 0, tilt: 0.7 };
const listeners = new Set<(pose: CameraPose) => void>();

export function setCameraHandler(fn: ((command: CameraCommand) => void) | null) {
  handler = fn;
}

export function sendCameraCommand(command: CameraCommand) {
  handler?.(command);
}

export function publishPose(next: CameraPose) {
  pose = next;
  listeners.forEach(fn => fn(pose));
}

export function onPose(fn: (pose: CameraPose) => void) {
  listeners.add(fn);
  fn(pose);
  return () => {
    listeners.delete(fn);
  };
}

// Frames per second and the preset 'auto' settled on, for the graphics panel
export interface RenderStats {
  fps: number;
  preset: string;
}
let stats: RenderStats = { fps: 0, preset: '' };
const statListeners = new Set<() => void>();

export function publishStats(change: Partial<RenderStats>) {
  stats = { ...stats, ...change };
  statListeners.forEach(fn => fn());
}

export function subscribeStats(fn: () => void) {
  statListeners.add(fn);
  return () => {
    statListeners.delete(fn);
  };
}

export function getStats() {
  return stats;
}
