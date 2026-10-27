// Sound effects synthesized with the Web Audio API, so there are no audio files to ship or license.
// Browsers only allow audio after the player interacts with the page: the audio context starts on
// the first click or key press, and sounds requested before that are skipped.

export type SoundName = 'dice' | 'card' | 'build' | 'turn' | 'robber' | 'offer' | 'victory' | 'defeat';

const MUTE_KEY = 'catan.muted';
const MASTER_VOLUME = 0.45;
const PENTATONIC = [0, 2, 4, 7, 9]; // semitones: cards landing in a row climb a pleasant scale

let ctx: AudioContext | null = null;
let out: GainNode | null = null;
let noiseBuffer: AudioBuffer | null = null;
let muted = readMuted();

function readMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}

export function isMuted(): boolean {
  return muted;
}

export function setMuted(value: boolean) {
  muted = value;
  try {
    localStorage.setItem(MUTE_KEY, value ? '1' : '0');
  } catch { /* storage blocked: the choice lasts until the page closes */ }
}

// Also resumes a context the browser suspended (e.g. iOS after switching apps)
function unlock() {
  if (!ctx) {
    ctx = new AudioContext();
    out = ctx.createGain();
    out.gain.value = MASTER_VOLUME;
    out.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
}

for (const event of ['pointerdown', 'keydown']) {
  window.addEventListener(event, unlock, { capture: true, passive: true });
}

// `step` varies a sound in a sequence, e.g. the pitch of each card landing
export function playSound(name: SoundName, step = 0) {
  if (muted || !ctx || !out || ctx.state !== 'running') return;
  SOUNDS[name](ctx, out, ctx.currentTime + 0.01, step);
}

interface Tone {
  freq: number;
  at: number;
  length: number;
  volume?: number;
  wave?: OscillatorType;
  slideTo?: number; // pitch at the end, for knocks and slides
}

function tone(c: AudioContext, dest: AudioNode, { freq, at, length, volume = 0.3, wave = 'sine', slideTo }: Tone) {
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = wave;
  osc.frequency.setValueAtTime(freq, at);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, at + length);
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(volume, at + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + length);
  osc.connect(gain).connect(dest);
  osc.start(at);
  osc.stop(at + length + 0.05);
}

interface Noise {
  at: number;
  length: number;
  volume: number;
  band: number; // center of the band-pass filter: higher sounds clickier, lower sounds woodier
}

function noise(c: AudioContext, dest: AudioNode, { at, length, volume, band }: Noise) {
  if (!noiseBuffer) {
    noiseBuffer = c.createBuffer(1, c.sampleRate, c.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  const src = c.createBufferSource();
  src.buffer = noiseBuffer;
  const filter = c.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = band;
  filter.Q.value = 2;
  const gain = c.createGain();
  gain.gain.setValueAtTime(volume, at);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + length);
  src.connect(filter).connect(gain).connect(dest);
  src.start(at, Math.random() * 0.5);
  src.stop(at + length + 0.05);
}

type Synth = (c: AudioContext, out: AudioNode, t: number, step: number) => void;

const SOUNDS: Record<SoundName, Synth> = {
  // Two dice clattering on a wooden table, then landing; lasts about as long as the dice animation
  dice: (c, out, t) => {
    let at = t;
    for (let i = 0; i < 8; i++) {
      noise(c, out, { at, length: 0.035, volume: 0.3 - i * 0.02, band: 2500 + Math.random() * 1500 });
      tone(c, out, { freq: 1200 + Math.random() * 900, at, length: 0.03, volume: 0.04, wave: 'triangle' });
      at += 0.04 + i * 0.01 + Math.random() * 0.015;
    }
    for (const land of [at + 0.03, at + 0.12]) {
      noise(c, out, { at: land, length: 0.06, volume: 0.35, band: 900 });
      tone(c, out, { freq: 190, slideTo: 110, at: land, length: 0.09, volume: 0.25 });
    }
  },
  card: (c, out, t, step) => {
    const freq = 880 * 2 ** (PENTATONIC[step % PENTATONIC.length] / 12);
    tone(c, out, { freq, at: t, length: 0.18, volume: 0.16, wave: 'triangle' });
    tone(c, out, { freq: freq * 2, at: t, length: 0.12, volume: 0.05 });
  },
  // A wooden piece set down on the board
  build: (c, out, t) => {
    tone(c, out, { freq: 160, slideTo: 80, at: t, length: 0.14, volume: 0.4 });
    noise(c, out, { at: t, length: 0.03, volume: 0.2, band: 1800 });
  },
  turn: (c, out, t) => {
    for (const [freq, delay] of [[784, 0], [1047, 0.15]]) {
      tone(c, out, { freq, at: t + delay, length: 0.6, volume: 0.2 });
      tone(c, out, { freq: freq * 2.01, at: t + delay, length: 0.3, volume: 0.04 });
    }
  },
  robber: (c, out, t) => {
    tone(c, out, { freq: 233, at: t, length: 0.25, volume: 0.22, wave: 'triangle' });
    tone(c, out, { freq: 220, at: t + 0.22, length: 0.25, volume: 0.22, wave: 'triangle' });
    tone(c, out, { freq: 208, slideTo: 150, at: t + 0.44, length: 0.6, volume: 0.22, wave: 'triangle' });
  },
  offer: (c, out, t) => {
    tone(c, out, { freq: 1047, at: t, length: 0.25, volume: 0.14 });
    tone(c, out, { freq: 1319, at: t + 0.1, length: 0.35, volume: 0.14 });
  },
  victory: (c, out, t) => {
    [523, 659, 784, 1047].forEach((freq, i) => {
      const last = i === 3;
      tone(c, out, { freq, at: t + i * 0.12, length: last ? 0.9 : 0.2, volume: 0.2, wave: 'triangle' });
      tone(c, out, { freq: freq * 2, at: t + i * 0.12, length: last ? 0.6 : 0.15, volume: 0.05 });
    });
  },
  defeat: (c, out, t) => {
    [392, 330, 262].forEach((freq, i) => {
      tone(c, out, { freq, at: t + i * 0.22, length: i === 2 ? 0.8 : 0.25, volume: 0.18, wave: 'triangle' });
    });
  },
};
