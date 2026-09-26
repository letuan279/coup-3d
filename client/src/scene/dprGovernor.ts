/**
 * Render-resolution governor for drei's <PerformanceMonitor> (pure logic, unit-tested with the
 * real monitor in dprGovernor.test.ts).
 *
 * drei samples the frame rate in 250 ms windows and, every 10 windows, calls onDecline /
 * onIncline when more than 75 % of them are below / at-or-above `bounds`. Two quirks:
 *  - it calls onIncline after EVERY good 2.5 s period, even when nothing can change, and counts
 *    those in `flipped` — its own `flipflops` / `onFallback` therefore fire on a perfectly
 *    smooth machine. We count only real resolution changes, and ignore inclines at high DPR;
 *  - its FPS reading is biased high (it divides frames, fence posts included, by the elapsed
 *    time): a steady 60 FPS reads ~64, one dropped frame per window reads 60, 55 FPS ~59,
 *    50 FPS ~54, 45 FPS ~49.
 */

export type Dpr = number | [number, number];

/** Normal resolution: the device pixel ratio, capped (SPEC §4.2). */
export const DPR_RANGE: [number, number] = [1, 1.75];
/** Reduced resolution when the scene cannot hold the frame rate. */
export const DPR_LOW = 1;

/**
 * FPS bounds in drei's (biased) units, aimed at the 60 FPS target whatever the display: below
 * 61 (≈ under 57–58 real FPS, or a frame dropped in most windows) lowers DPR; 62+ (a clean
 * 60 FPS) may raise it again. The gap is the hysteresis. A 120/144 Hz screen running at 70+
 * FPS is fine and keeps full resolution.
 */
export const FPS_BOUNDS: readonly [lower: number, upper: number] = [61, 62];

export function dprBounds(): [number, number] {
  return [FPS_BOUNDS[0], FPS_BOUNDS[1]];
}

export interface DprGovernorOptions {
  setDpr(dpr: Dpr): void;
  /** ms clock (defaults to performance.now). */
  now?: () => number;
  /**
   * Real resolution changes allowed within `flipWindowMs`; the change that reaches it (always
   * a decline: high → low → high → low) settles on low DPR for good — the machine cannot
   * hold the frame rate at full resolution but can at DPR 1.
   */
  maxFlips?: number;
  flipWindowMs?: number;
}

export interface DprGovernor {
  onDecline(): void;
  onIncline(): void;
  readonly state: { readonly high: boolean; readonly locked: boolean; readonly flips: readonly number[] };
}

export function createDprGovernor({
  setDpr,
  now = () => performance.now(),
  maxFlips = 3,
  flipWindowMs = 60_000,
}: DprGovernorOptions): DprGovernor {
  const state = { high: true, locked: false, flips: [] as number[] };
  /** Records a real change; returns how many happened within the window (this one included). */
  const record = (): number => {
    const t = now();
    state.flips = state.flips.filter((x) => t - x < flipWindowMs);
    state.flips.push(t);
    return state.flips.length;
  };
  return {
    state,
    onDecline() {
      if (!state.high) return;
      state.high = false;
      // Oscillating between the two resolutions: settle on the one that holds the frame rate.
      if (record() >= maxFlips) state.locked = true;
      setDpr(DPR_LOW);
    },
    onIncline() {
      // drei reports a good period at full resolution too: nothing to do (and not a flip).
      if (state.high || state.locked) return;
      state.high = true;
      record();
      setDpr(DPR_RANGE);
    },
  };
}
