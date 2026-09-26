/**
 * Drives drei's REAL <PerformanceMonitor> (useFrame stubbed, fake clock) with the props
 * SceneRoot passes, and checks what resolution the scene ends up at (regression for perf3d-1,
 * SCN-2: unrelated slow spells must not lock it low; SCN-3: displays that cannot reach 60 FPS
 * keep full resolution).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { createRng } from '@shared/rng';

let frameCb: (() => void) | null = null;
vi.mock('@react-three/fiber', () => ({
  useFrame: (cb: () => void) => {
    frameCb = cb;
  },
}));

import { PerformanceMonitor } from '@react-three/drei/core/PerformanceMonitor.js';
import { DPR_LOW, DPR_RANGE, createDprGovernor, dprBounds, type Dpr, type MonitorReading } from './dprGovernor';

/** Returns the time (ms) of the next frame, given the previous one and the current DPR. */
type FrameSource = (prev: number, dpr: Dpr) => number;
type Fps = number | ((dpr: Dpr) => number);

interface Run {
  changes: { t: number; dpr: Dpr }[];
  dpr: Dpr;
  locked: boolean;
  /** ms spent at low resolution. */
  lowMs: number;
}

function run(seconds: number, next: FrameSource): Run {
  let now = 0;
  const spy = vi.spyOn(performance, 'now').mockImplementation(() => now);
  const out: Run = { changes: [], dpr: DPR_RANGE, locked: false, lowMs: 0 };
  const gov = createDprGovernor({
    now: () => now,
    setDpr: (d) => {
      out.dpr = d;
      out.changes.push({ t: now, dpr: d });
    },
  });
  // Same props as SceneRoot.
  renderToString(createElement(PerformanceMonitor, { bounds: dprBounds, onDecline: gov.onDecline, onIncline: gov.onIncline }));
  while (now < seconds * 1000) {
    frameCb!();
    const t = next(now, out.dpr);
    if (out.dpr === DPR_LOW) out.lowMs += t - now;
    now = t;
  }
  spy.mockRestore();
  out.locked = gov.state.locked;
  return out;
}

const fpsAt = (fps: Fps, dpr: Dpr) => (typeof fps === 'number' ? fps : fps(dpr));

/** Evenly paced frames at `fps`, measured a random 0–3 ms into each rAF callback. */
function paced(fps: Fps, seed = 1): FrameSource {
  const rand = createRng(seed);
  let ideal = 0;
  return (_prev, dpr) => {
    ideal += 1000 / fpsAt(fps, dpr);
    return ideal + rand() * 3;
  };
}

/** A `hz` display delivering `fps` frames per second: the missing ones are skipped vsyncs. */
function vsynced(fps: Fps, hz = 60, seed = 2): FrameSource {
  const rand = createRng(seed);
  let ideal = 0;
  return (_prev, dpr) => {
    ideal += 1000 / fpsAt(fps, dpr);
    return (Math.floor((ideal * hz) / 1000 + 1e-6) * 1000) / hz + rand() * 3;
  };
}

/** The scene runs `gain` FPS faster at low resolution (resolution-bound). */
const helps = (fps: number, gain: number) => (dpr: Dpr) => (dpr === DPR_LOW ? fps + gain : fps);

const lowered = (r: Run) => r.changes.filter((c) => c.dpr === DPR_LOW);

afterEach(() => {
  vi.restoreAllMocks();
});

describe('resolution governor on a healthy machine', () => {
  it('keeps full resolution for a minute at a steady 60, 120 and 144 FPS', () => {
    for (const fps of [60, 120, 144]) {
      const r = run(60, paced(fps));
      expect(lowered(r), `${fps} FPS`).toEqual([]);
      expect(r.dpr).toBe(DPR_RANGE);
    }
  });

  it('shrugs off an occasional dropped frame', () => {
    // 60 Hz with one frame dropped every ~0.6 s (≈ 58 FPS, GC hiccups).
    const r = run(60, vsynced(58.3));
    expect(lowered(r)).toEqual([]);
  });

  it('comes back to full resolution after a slow spell, every time', () => {
    const slow = (t: number) => (t > 10_000 && t < 16_000) || (t > 100_000 && t < 106_000);
    const rand = createRng(3);
    const r = run(180, (prev) => prev + 1000 / (slow(prev) ? 42 : 60) + (rand() - 0.5) * 0.5);
    expect(r.changes.map((c) => c.dpr)).toEqual([DPR_LOW, DPR_RANGE, DPR_LOW, DPR_RANGE]);
    expect(r.locked).toBe(false);
    expect(r.dpr).toBe(DPR_RANGE);
  });

  it('is not locked low by two slow spells 30 s apart (SCN-2)', () => {
    const spell = (t: number) => (t > 10_000 && t < 14_000) || (t > 40_000 && t < 44_000);
    // Whether or not the spells are resolution-bound (a heavy moment vs. another app).
    const sources: [string, FrameSource][] = [
      ['unrelated', (prev) => prev + 1000 / (spell(prev) ? 45 : 60)],
      ['resolution-bound', (prev, dpr) => prev + 1000 / (spell(prev) && dpr !== DPR_LOW ? 45 : 60)],
    ];
    for (const [name, src] of sources) {
      const r = run(300, src);
      expect(lowered(r).length, name).toBeGreaterThanOrEqual(1);
      expect(r.locked, name).toBe(false);
      expect(r.dpr, name).toBe(DPR_RANGE);
      expect(r.lowMs, name).toBeLessThan(12_000);
    }
  });

  it('keeps full resolution on 48/50 Hz displays and under a 30 FPS cap (SCN-3)', () => {
    const sources: [string, FrameSource][] = [
      ['50 Hz', vsynced(50, 50)],
      ['48 Hz', vsynced(48, 48)],
      ['30 FPS cap', vsynced(30, 60)],
      ['GPU-independent 50 FPS', paced(50)],
    ];
    for (const [name, src] of sources) {
      const r = run(600, src);
      expect(r.dpr, name).toBe(DPR_RANGE);
      expect(r.locked, name).toBe(false);
      // Lowering is tried (it cannot tell up front), found useless, and retried ever more rarely.
      expect(r.lowMs, name).toBeLessThan(0.03 * 600_000);
      const at = lowered(r).map((c) => c.t);
      expect(at.length, name).toBeLessThanOrEqual(5);
      for (let i = 2; i < at.length; i++) expect(at[i] - at[i - 1], name).toBeGreaterThan(1.5 * (at[i - 1] - at[i - 2]));
    }
  });
});

describe('resolution governor on a struggling machine', () => {
  it('lowers the resolution within ~3 s at 45–55 FPS when that helps, and stays low', () => {
    const sources = [45, 50, 55].flatMap((fps) => [paced(helps(fps, 6)), vsynced(helps(fps, 6))]);
    for (const src of sources) {
      const r = run(30, src);
      expect(lowered(r).length).toBeGreaterThanOrEqual(1);
      expect(lowered(r)[0].t).toBeLessThan(3200);
      expect(r.dpr).toBe(DPR_LOW);
    }
  });

  it('stops flip-flopping: settles low, retries after a while, backs off', () => {
    // Full resolution runs at 45 FPS, DPR 1 at a clean 60.
    const short = run(120, paced(helps(45, 15)));
    expect(short.changes.map((c) => c.dpr)).toEqual([DPR_LOW, DPR_RANGE, DPR_LOW]);
    expect(short.locked).toBe(true);
    expect(short.dpr).toBe(DPR_LOW);

    const long = run(900, paced(helps(45, 15)));
    const c = long.changes;
    expect(c.map((x) => x.dpr)).toEqual([DPR_LOW, DPR_RANGE, DPR_LOW, DPR_RANGE, DPR_LOW, DPR_RANGE, DPR_LOW]);
    // Each retry of full resolution fails within a few seconds, and the next one waits twice as long.
    const firstWait = c[3].t - c[2].t;
    const secondWait = c[5].t - c[4].t;
    expect(firstWait).toBeGreaterThanOrEqual(180_000);
    expect(firstWait).toBeLessThan(190_000);
    expect(secondWait).toBeGreaterThanOrEqual(360_000);
    expect(secondWait).toBeLessThan(370_000);
    expect(long.lowMs).toBeGreaterThan(0.95 * 900_000 - c[0].t);
  });
});

describe('createDprGovernor', () => {
  const reading = (fps: number): MonitorReading => ({ averages: Array(10).fill(fps) });

  function gov(opts: { quickMs?: number; lockMs?: number; suppressMs?: number } = {}) {
    const calls: Dpr[] = [];
    const clock = { t: 0 };
    const g = createDprGovernor({ setDpr: (d) => calls.push(d), now: () => clock.t, ...opts });
    return { g, calls, clock };
  }

  it('ignores inclines at full resolution and repeated declines at low resolution', () => {
    const { g, calls, clock } = gov();
    for (let i = 0; i < 10; i++) g.onIncline();
    expect(calls).toEqual([]);
    g.onDecline();
    g.onDecline();
    expect(calls).toEqual([DPR_LOW]);
    clock.t = 5000;
    g.onIncline();
    expect(calls).toEqual([DPR_LOW, DPR_RANGE]);
  });

  it('counts a decline as an oscillation only when it follows an incline quickly', () => {
    const { g, calls, clock } = gov({ quickMs: 8000, lockMs: 180_000 });
    g.onDecline();
    clock.t = 3000;
    g.onIncline();
    clock.t = 30_000; // a fresh slow spell, not an oscillation
    g.onDecline();
    expect(g.state.locked).toBe(false);
    clock.t = 33_000;
    g.onIncline();
    clock.t = 36_000; // 3 s after raising it: full resolution cannot hold
    g.onDecline();
    expect(g.state.locked).toBe(true);
    expect(g.state.lockedUntil).toBe(216_000);
    clock.t = 200_000;
    g.onIncline(); // still locked
    expect(calls).toEqual([DPR_LOW, DPR_RANGE, DPR_LOW, DPR_RANGE, DPR_LOW]);
    clock.t = 216_000;
    g.onIncline(); // the lock expires: retry
    expect(g.state.locked).toBe(false);
    expect(calls.at(-1)).toBe(DPR_RANGE);
    clock.t = 218_500;
    g.onDecline(); // fails again: twice as long
    expect(g.state.lockedUntil).toBe(218_500 + 360_000);
  });

  it('forgets the back-off once full resolution held for a good while', () => {
    const { g, clock } = gov({ quickMs: 8000, lockMs: 180_000 });
    g.onDecline();
    clock.t = 2000;
    g.onIncline();
    clock.t = 4000;
    g.onDecline(); // lock 1: 180 s
    clock.t = 184_000;
    g.onIncline(); // retry…
    clock.t = 186_000;
    g.onDecline(); // …fails: lock 2 is 360 s
    expect(g.state.lockedUntil).toBe(186_000 + 360_000);
    clock.t = 546_000;
    g.onIncline(); // retry holds for 10 minutes
    clock.t = 1_146_000;
    g.onDecline(); // a fresh spell
    clock.t = 1_148_000;
    g.onIncline();
    clock.t = 1_150_000;
    g.onDecline(); // oscillation again: back to the first lock length
    expect(g.state.lockedUntil).toBe(1_150_000 + 180_000);
  });

  it('restores full resolution when lowering did not help, and backs off (SCN-3)', () => {
    const { g, calls, clock } = gov({ suppressMs: 60_000 });
    g.onDecline(reading(54));
    expect(calls).toEqual([DPR_LOW]);
    clock.t = 2600;
    g.onDecline(reading(55)); // not better at low DPR: resolution is not the bottleneck
    expect(calls).toEqual([DPR_LOW, DPR_RANGE]);
    expect(g.state.high).toBe(true);
    expect(g.state.suppressedUntil).toBe(62_600);
    clock.t = 30_000;
    g.onDecline(reading(54)); // suppressed
    expect(calls.length).toBe(2);
    clock.t = 62_600;
    g.onDecline(reading(54)); // try again…
    clock.t = 65_200;
    g.onDecline(reading(53)); // …same story: twice as long
    expect(calls).toEqual([DPR_LOW, DPR_RANGE, DPR_LOW, DPR_RANGE]);
    expect(g.state.suppressedUntil).toBe(65_200 + 120_000);
  });

  it('keeps the low resolution when it helped, even if still under the target', () => {
    const { g, calls, clock } = gov();
    g.onDecline(reading(49));
    clock.t = 2600;
    g.onDecline(reading(55));
    clock.t = 5200;
    g.onDecline(reading(54)); // later readings are not compared any more
    clock.t = 60_000;
    g.onDecline(reading(40));
    expect(calls).toEqual([DPR_LOW]);
    expect(g.state.high).toBe(false);
  });

  it('a late slow period at low resolution is not taken for "lowering did not help"', () => {
    const { g, calls, clock } = gov({ quickMs: 8000 });
    g.onDecline(reading(49));
    clock.t = 20_000; // DPR 1 was fine for a while (no report in between), then a hiccup
    g.onDecline(reading(45));
    expect(calls).toEqual([DPR_LOW]);
  });
});
