/**
 * Drives drei's REAL <PerformanceMonitor> (useFrame stubbed, fake clock) with the props
 * SceneRoot passes, and checks what resolution the scene ends up at (regression for perf3d-1).
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
import { DPR_LOW, DPR_RANGE, createDprGovernor, dprBounds, type Dpr } from './dprGovernor';

/** Returns the time (ms) of the next frame, given the previous one and the current DPR. */
type FrameSource = (prev: number, dpr: Dpr) => number;

interface Run {
  changes: { t: number; dpr: Dpr }[];
  dpr: Dpr;
  locked: boolean;
}

function run(seconds: number, next: FrameSource): Run {
  let now = 0;
  const spy = vi.spyOn(performance, 'now').mockImplementation(() => now);
  const out: Run = { changes: [], dpr: DPR_RANGE, locked: false };
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
    now = next(now, out.dpr);
  }
  spy.mockRestore();
  out.locked = gov.state.locked;
  return out;
}

/** Evenly paced frames at `fps`, measured a random 0–3 ms into each rAF callback. */
function paced(fps: number | ((dpr: Dpr) => number), seed = 1): FrameSource {
  const rand = createRng(seed);
  let ideal = 0;
  return (_prev, dpr) => {
    ideal += 1000 / (typeof fps === 'number' ? fps : fps(dpr));
    return ideal + rand() * 3;
  };
}

/** A 60 Hz display delivering `fps` frames per second: the missing ones are skipped vsyncs. */
function vsynced(fps: number, hz = 60, seed = 2): FrameSource {
  const rand = createRng(seed);
  let n = 0;
  return () => {
    n++;
    return (Math.floor((n * hz) / fps) * 1000) / hz + rand() * 3;
  };
}

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
});

describe('resolution governor on a struggling machine', () => {
  it('lowers the resolution within ~3 s at 45–55 FPS', () => {
    for (const src of [paced(45), paced(50), paced(55), vsynced(45), vsynced(50), vsynced(55)]) {
      const r = run(20, src);
      expect(lowered(r).length).toBe(1);
      expect(lowered(r)[0].t).toBeLessThan(3200);
      expect(r.dpr).toBe(DPR_LOW);
    }
  });

  it('stops flip-flopping after three real changes and stays low', () => {
    // Full resolution runs at 45 FPS, DPR 1 at a clean 60.
    const r = run(120, paced((dpr) => (dpr === DPR_LOW ? 60 : 45)));
    expect(r.changes.map((c) => c.dpr)).toEqual([DPR_LOW, DPR_RANGE, DPR_LOW]);
    expect(r.locked).toBe(true);
    expect(r.dpr).toBe(DPR_LOW);
  });
});

describe('createDprGovernor', () => {
  it('ignores inclines at full resolution and repeated declines at low resolution', () => {
    const calls: Dpr[] = [];
    let t = 0;
    const g = createDprGovernor({ setDpr: (d) => calls.push(d), now: () => t });
    for (let i = 0; i < 10; i++) g.onIncline();
    expect(calls).toEqual([]);
    g.onDecline();
    g.onDecline();
    expect(calls).toEqual([DPR_LOW]);
    t = 5000;
    g.onIncline();
    expect(calls).toEqual([DPR_LOW, DPR_RANGE]);
    expect(g.state.flips.length).toBe(2);
  });

  it('only counts changes inside the window towards settling low', () => {
    const calls: Dpr[] = [];
    let t = 0;
    const g = createDprGovernor({ setDpr: (d) => calls.push(d), now: () => t, flipWindowMs: 60_000 });
    g.onDecline();
    t = 3000;
    g.onIncline();
    t = 90_000; // long after: a fresh slow spell is not an oscillation
    g.onDecline();
    expect(g.state.locked).toBe(false);
    t = 93_000;
    g.onIncline();
    t = 96_000;
    g.onDecline(); // third change within 60 s → settle
    expect(g.state.locked).toBe(true);
    t = 200_000;
    g.onIncline();
    expect(calls).toEqual([DPR_LOW, DPR_RANGE, DPR_LOW, DPR_RANGE, DPR_LOW]);
  });
});
