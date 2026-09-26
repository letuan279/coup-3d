/**
 * WebAudio-synthesised sound effects (no audio files). The AudioContext is only created on the
 * first user gesture (`unlockAudio`) so browsers never warn about autoplay; before that, and
 * while `ui.muted` is on, every call is a cheap no-op.
 */
import { useGame } from '../store/useGame';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noiseBuffer: AudioBuffer | null = null;

type AudioCtor = typeof AudioContext;

function createContext(): AudioContext | null {
  const w = window as unknown as { AudioContext?: AudioCtor; webkitAudioContext?: AudioCtor };
  const Ctor = w.AudioContext ?? w.webkitAudioContext;
  if (!Ctor) return null;
  try {
    const c = new Ctor();
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    master = c.createGain();
    master.gain.value = 0.5;
    master.connect(comp).connect(c.destination);
    return c;
  } catch {
    return null;
  }
}

/** Call from a user gesture (pointerdown / keydown). Idempotent. */
export function unlockAudio(): void {
  if (!ctx) ctx = createContext();
  if (ctx && ctx.state === 'suspended') void ctx.resume().catch(() => undefined);
}

/** Returns a running context, or null when muted / locked / unsupported. */
function live(): AudioContext | null {
  if (!ctx || !master || ctx.state !== 'running') return null;
  if (useGame.getState().ui.muted) return null;
  return ctx;
}

function getNoise(c: AudioContext): AudioBuffer {
  if (noiseBuffer) return noiseBuffer;
  const len = Math.floor(c.sampleRate * 1.0);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  noiseBuffer = buf;
  return buf;
}

interface ToneOpts {
  freq: number;
  /** Glide target frequency (exponential). */
  to?: number;
  type?: OscillatorType;
  dur: number;
  gain?: number;
  delay?: number;
  attack?: number;
  detune?: number;
}

function tone(c: AudioContext, o: ToneOpts): void {
  const t0 = c.currentTime + (o.delay ?? 0);
  const osc = c.createOscillator();
  osc.type = o.type ?? 'sine';
  osc.frequency.setValueAtTime(o.freq, t0);
  if (o.detune) osc.detune.setValueAtTime(o.detune, t0);
  if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, t0 + o.dur);
  const g = c.createGain();
  const peak = o.gain ?? 0.25;
  const attack = o.attack ?? 0.005;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(peak, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
  osc.connect(g).connect(master!);
  osc.start(t0);
  osc.stop(t0 + o.dur + 0.03);
}

interface NoiseOpts {
  dur: number;
  gain?: number;
  delay?: number;
  filter?: BiquadFilterType;
  freq?: number;
  to?: number;
  q?: number;
  attack?: number;
}

function noise(c: AudioContext, o: NoiseOpts): void {
  const t0 = c.currentTime + (o.delay ?? 0);
  const src = c.createBufferSource();
  src.buffer = getNoise(c);
  const f = c.createBiquadFilter();
  f.type = o.filter ?? 'bandpass';
  f.frequency.setValueAtTime(o.freq ?? 1000, t0);
  if (o.to) f.frequency.exponentialRampToValueAtTime(o.to, t0 + o.dur);
  f.Q.value = o.q ?? 1;
  const g = c.createGain();
  const peak = o.gain ?? 0.3;
  const attack = o.attack ?? 0.004;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(peak, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
  src.connect(f).connect(g).connect(master!);
  src.start(t0, Math.random() * 0.5);
  src.stop(t0 + o.dur + 0.03);
}

let lastClick = 0;

export const sfx = {
  /** Coin clinks; `count` clinks (capped) spaced slightly apart. */
  coin(count = 1, delay = 0): void {
    const c = live();
    if (!c) return;
    const n = Math.max(1, Math.min(4, count));
    for (let i = 0; i < n; i++) {
      const d = delay + i * 0.075;
      const base = 1850 + Math.random() * 250;
      tone(c, { freq: base, type: 'triangle', dur: 0.16, gain: 0.16, delay: d });
      tone(c, { freq: base * 1.52, type: 'sine', dur: 0.22, gain: 0.1, delay: d + 0.012 });
      noise(c, { dur: 0.04, gain: 0.06, freq: 6000, q: 2, delay: d });
    }
  },

  /** Card flip / slide: short filtered noise swish + tap. */
  flip(delay = 0): void {
    const c = live();
    if (!c) return;
    noise(c, { dur: 0.09, gain: 0.22, freq: 1800, to: 4200, q: 1.4, delay });
    tone(c, { freq: 320, to: 180, type: 'triangle', dur: 0.06, gain: 0.12, delay: delay + 0.05 });
  },

  /** Action declared. */
  whoosh(): void {
    const c = live();
    if (!c) return;
    noise(c, { dur: 0.32, gain: 0.2, freq: 380, to: 2600, q: 2.2, attack: 0.08 });
  },

  /** Dramatic sting when someone challenges. */
  challenge(): void {
    const c = live();
    if (!c) return;
    noise(c, { dur: 0.18, gain: 0.25, filter: 'highpass', freq: 1500 });
    tone(c, { freq: 622, type: 'sawtooth', dur: 0.5, gain: 0.08, detune: -8 });
    tone(c, { freq: 659, type: 'sawtooth', dur: 0.5, gain: 0.08, detune: 8 });
    tone(c, { freq: 988, to: 740, type: 'square', dur: 0.35, gain: 0.05, delay: 0.08 });
  },

  /** Heavy thud when someone blocks. */
  block(): void {
    const c = live();
    if (!c) return;
    tone(c, { freq: 150, to: 48, type: 'sine', dur: 0.32, gain: 0.55 });
    noise(c, { dur: 0.12, gain: 0.25, filter: 'lowpass', freq: 900 });
    tone(c, { freq: 440, type: 'triangle', dur: 0.12, gain: 0.08, delay: 0.02 });
  },

  /** An influence is lost (card turned face up). */
  lose(): void {
    const c = live();
    if (!c) return;
    noise(c, { dur: 0.1, gain: 0.2, freq: 2000, to: 3800, q: 1.2 });
    tone(c, { freq: 520, to: 190, type: 'triangle', dur: 0.55, gain: 0.2, delay: 0.06 });
  },

  /** A player is eliminated: sad descending "wah wah". */
  eliminated(): void {
    const c = live();
    if (!c) return;
    const notes = [392, 370, 349, 294];
    notes.forEach((f, i) => {
      const last = i === notes.length - 1;
      tone(c, { freq: f, to: last ? f * 0.94 : undefined, type: 'sawtooth', dur: last ? 0.7 : 0.26, gain: 0.07, delay: i * 0.27, attack: 0.03 });
      tone(c, { freq: f / 2, type: 'triangle', dur: last ? 0.7 : 0.26, gain: 0.12, delay: i * 0.27, attack: 0.03 });
    });
  },

  /** Countdown tick (last seconds of a decision). */
  tick(urgent = false): void {
    const c = live();
    if (!c) return;
    tone(c, { freq: urgent ? 1320 : 990, type: 'square', dur: 0.05, gain: 0.07 });
    noise(c, { dur: 0.03, gain: 0.05, filter: 'highpass', freq: 4000 });
  },

  /** It is the local player's turn. */
  yourTurn(): void {
    const c = live();
    if (!c) return;
    [784, 988, 1175, 1568].forEach((f, i) => {
      tone(c, { freq: f, type: 'sine', dur: 0.5, gain: 0.14, delay: i * 0.08 });
      tone(c, { freq: f * 2, type: 'sine', dur: 0.25, gain: 0.03, delay: i * 0.08 });
    });
  },

  /** Local player won. */
  win(): void {
    const c = live();
    if (!c) return;
    const seq: [number, number, number][] = [
      [523, 0, 0.16],
      [659, 0.14, 0.16],
      [784, 0.28, 0.16],
      [1047, 0.42, 0.6],
    ];
    for (const [f, d, dur] of seq) {
      tone(c, { freq: f, type: 'triangle', dur, gain: 0.2, delay: d });
      tone(c, { freq: f * 1.5, type: 'sine', dur, gain: 0.05, delay: d });
    }
    [523, 659, 784].forEach((f) => tone(c, { freq: f, type: 'triangle', dur: 0.9, gain: 0.08, delay: 0.42, attack: 0.04 }));
    noise(c, { dur: 0.5, gain: 0.08, filter: 'highpass', freq: 6000, delay: 0.42 });
  },

  /** Someone else won: short friendly jingle. */
  gameOver(): void {
    const c = live();
    if (!c) return;
    [659, 587, 523, 784].forEach((f, i) => tone(c, { freq: f, type: 'triangle', dur: i === 3 ? 0.5 : 0.18, gain: 0.16, delay: i * 0.15 }));
  },

  /** UI button press. Throttled. */
  click(): void {
    const c = live();
    if (!c) return;
    const now = performance.now();
    if (now - lastClick < 40) return;
    lastClick = now;
    tone(c, { freq: 700, to: 520, type: 'triangle', dur: 0.06, gain: 0.12 });
  },

  /** Rejected move / invalid input. */
  error(): void {
    const c = live();
    if (!c) return;
    tone(c, { freq: 196, type: 'square', dur: 0.1, gain: 0.08 });
    tone(c, { freq: 165, type: 'square', dur: 0.14, gain: 0.08, delay: 0.11 });
  },

  /** Emote pop. */
  pop(): void {
    const c = live();
    if (!c) return;
    tone(c, { freq: 420, to: 980, type: 'sine', dur: 0.12, gain: 0.18 });
  },
};

export type SfxName = keyof typeof sfx;
