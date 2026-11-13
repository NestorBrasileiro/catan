// Graphics settings shared by the 3D world and the HUD: a quality preset, the time of day and the map
// layers. Saved in the browser, so each player keeps their own choice; everything works without storage.
import { useSyncExternalStore } from 'react';

export type QualityPreset = 'low' | 'medium' | 'high' | 'ultra';
export type QualityChoice = QualityPreset | 'auto';
export type TimeOfDay = 'dawn' | 'day' | 'sunset' | 'night';
export type ViewMode = '3d' | '2d';

export interface MapLayers {
  numbers: boolean;   // number tokens on the hexes
  ports: boolean;     // boats and port signs
  scenery: boolean;   // trees, sheep, wheat, rocks…
  villagers: boolean; // tiny farmers, miners, lumberjacks and animals at work
  heatmap: boolean;   // how much each hex produces, by the odds of its number
  labels: boolean;    // floating resource labels over each hex
  clouds: boolean;    // clouds drifting over the island
}

export interface GraphicsSettings {
  quality: QualityChoice;
  timeOfDay: TimeOfDay;
  view: ViewMode;
  cinematic: boolean; // tilt-shift: the board looks like a miniature
  showFps: boolean;
  layers: MapLayers;
}

// What each preset turns on. 'auto' starts from a guess for this device and steps down if it struggles.
export interface QualityProfile {
  dpr: [number, number];
  shadows: number;          // shadow map size, 0 = off
  terrainDetail: number;    // rings of triangles in each hex's relief
  sceneryDensity: number;   // share of trees/stalks/rocks drawn
  postprocessing: boolean;
  ambientOcclusion: boolean;
  bloom: boolean;
  multisampling: number;
  reflections: boolean;     // real mirror reflections on the sea
  envResolution: number;
}

export const QUALITY_PROFILES: Record<QualityPreset, QualityProfile> = {
  low: {
    dpr: [0.75, 1], shadows: 0, terrainDetail: 8, sceneryDensity: 0.35,
    postprocessing: false, ambientOcclusion: false, bloom: false, multisampling: 0, reflections: false, envResolution: 64,
  },
  medium: {
    dpr: [1, 1.5], shadows: 1024, terrainDetail: 14, sceneryDensity: 0.65,
    postprocessing: true, ambientOcclusion: false, bloom: true, multisampling: 0, reflections: false, envResolution: 128,
  },
  high: {
    dpr: [1, 2], shadows: 2048, terrainDetail: 20, sceneryDensity: 1,
    postprocessing: true, ambientOcclusion: true, bloom: true, multisampling: 4, reflections: false, envResolution: 256,
  },
  ultra: {
    dpr: [1.5, 2], shadows: 4096, terrainDetail: 28, sceneryDensity: 1.35,
    postprocessing: true, ambientOcclusion: true, bloom: true, multisampling: 8, reflections: true, envResolution: 512,
  },
};

export const QUALITY_ORDER: QualityPreset[] = ['low', 'medium', 'high', 'ultra'];

export const QUALITY_LABELS: Record<QualityChoice, { label: string; hint: string }> = {
  auto: { label: 'Auto', hint: 'Escolhe pelo seu aparelho e reduz sozinho se o jogo ficar lento' },
  low: { label: 'Baixo', hint: 'Sem sombras nem efeitos. Para notebooks fracos e celulares' },
  medium: { label: 'Médio', hint: 'Sombras, brilho e relevo moderado' },
  high: { label: 'Alto', hint: 'Sombras suaves, oclusão de ambiente e antisserrilhado' },
  ultra: { label: 'Ultra', hint: 'Reflexos reais no mar, sombras 4K e vegetação densa' },
};

export const TIME_LABELS: Record<TimeOfDay, string> = {
  dawn: 'Amanhecer',
  day: 'Dia',
  sunset: 'Pôr do sol',
  night: 'Noite',
};

export const LAYER_LABELS: Record<keyof MapLayers, { label: string; hint: string }> = {
  numbers: { label: 'Números', hint: 'Fichas numeradas dos hexágonos' },
  heatmap: { label: 'Mapa de produção', hint: 'Quanto cada hexágono rende, pela chance do número' },
  labels: { label: 'Rótulos', hint: 'Nome do recurso sobre cada hexágono' },
  ports: { label: 'Portos', hint: 'Barcos e taxas de troca' },
  scenery: { label: 'Vegetação', hint: 'Árvores, trigo, rochas e arbustos' },
  villagers: { label: 'Vida no campo', hint: 'Fazendeiros, mineiros, lenhadores, tratores e animais trabalhando' },
  clouds: { label: 'Nuvens', hint: 'Nuvens passando sobre a ilha' },
};

const KEY = 'catan.graphics.v1';

const DEFAULTS: GraphicsSettings = {
  quality: 'auto',
  timeOfDay: 'day',
  view: '3d',
  cinematic: false,
  showFps: false,
  layers: { numbers: true, ports: true, scenery: true, villagers: true, heatmap: false, labels: false, clouds: true },
};

function load(): GraphicsSettings {
  try {
    const raw = localStorage.getItem(KEY);
    // the old 2D/3D switch lived on its own key
    const legacy2d = localStorage.getItem('catan.board2d') === '1';
    if (!raw) return { ...DEFAULTS, view: legacy2d ? '2d' : '3d' };
    const saved = JSON.parse(raw) as Partial<GraphicsSettings>;
    return { ...DEFAULTS, ...saved, layers: { ...DEFAULTS.layers, ...saved.layers } };
  } catch {
    return DEFAULTS;
  }
}

let settings = load();
const listeners = new Set<() => void>();

export function getGraphics() {
  return settings;
}

export function updateGraphics(change: Partial<Omit<GraphicsSettings, 'layers'>> & { layers?: Partial<MapLayers> }) {
  settings = { ...settings, ...change, layers: { ...settings.layers, ...change.layers } };
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch { /* not remembered after the page closes */ }
  listeners.forEach(fn => fn());
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function useGraphics(): GraphicsSettings {
  return useSyncExternalStore(subscribe, getGraphics, getGraphics);
}

// A first guess at what this device can handle, for 'auto'
export function detectQuality(): QualityPreset {
  const nav = navigator as Navigator & { deviceMemory?: number };
  const cores = nav.hardwareConcurrency ?? 4;
  const memory = nav.deviceMemory ?? 8;
  const touch = window.matchMedia('(pointer: coarse)').matches;
  if (touch || cores <= 4 || memory <= 4) return 'medium';
  if (cores >= 12 && memory >= 8) return 'ultra';
  return 'high';
}
