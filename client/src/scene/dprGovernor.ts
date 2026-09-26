/**
 * Render-resolution governor for drei's <PerformanceMonitor> (pure logic, unit-tested with the
 * real monitor in dprGovernor.test.ts).
 *
 * drei samples the frame rate in 250 ms windows and, every 10 windows (a ~2.5 s "period"),
 * calls onDecline / onIncline with its api — `api.averages` holds that period's readings —
 * when more than 75 % of them are below / at-or-above `bounds`. Quirks:
 *  - it calls onIncline after EVERY good period, even when nothing can change, and counts those
 *    in `flipped` — its own `flipflops` / `onFallback` therefore fire on a perfectly smooth
 *    machine. We only act on real resolution changes, and ignore inclines at high DPR;
 *  - likewise it keeps calling onDecline every period while the scene stays slow at low DPR;
 *  - its FPS reading is biased high (it divides frames, fence posts included, by the elapsed
 *    time): a steady 60 FPS reads ~64, one dropped frame per window reads 60, 55 FPS ~59,
 *    50 FPS ~54, 45 FPS ~49.
 *
 * Policy:
 *  - a decline at full resolution lowers it; the next good period raises it again (a slow spell
 *    — start-up jank, a resize, another app — must not cost the session its sharpness);
 *  - a decline that comes QUICKLY after raising it again (within `quickMs`, ~3 periods) means
 *    full resolution cannot hold the frame rate: stay low for `lockMs`, then retry; each failed
 *    retry doubles the wait. A later decline is a fresh slow spell, not an oscillation;
 *  - if lowering the resolution did not raise the frame rate (drei still reports a decline at
 *    low DPR, not `minGain` better than the one that lowered it), resolution is not the
 *    bottleneck — a 48/50 Hz display, a 30 FPS power-saving cap, a busy CPU: restore it and
 *    ignore declines for `suppressMs` (doubling each time it happens again).
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
 * FPS is fine and keeps full resolution. Displays that cannot reach 60 (48/50 Hz, 30 FPS caps)
 * always read below: the governor notices that lowering DPR does not help them.
 */
export const FPS_BOUNDS: readonly [lower: number, upper: number] = [61, 62];

export function dprBounds(): [number, number] {
  return [FPS_BOUNDS[0], FPS_BOUNDS[1]];
}

/** The part of drei's PerformanceMonitorApi the governor reads. */
export interface MonitorReading {
  /** FPS readings of the period that triggered the callback (drei units). */
  readonly averages: readonly number[];
}

export interface DprGovernorOptions {
  setDpr(dpr: Dpr): void;
  /** ms clock (defaults to performance.now). */
  now?: () => number;
  /**
   * A decline this soon after a resolution change is its direct consequence: after raising it,
   * an oscillation (full resolution cannot hold); after lowering it, the check whether lowering
   * helped. About three of drei's periods.
   */
  quickMs?: number;
  /** First stay at low DPR after an oscillation; doubles on every failed retry. */
  lockMs?: number;
  /** First pause of declines after lowering did not help; doubles every time it recurs. */
  suppressMs?: number;
  /** Cap of both back-offs. */
  maxBackoffMs?: number;
  /** FPS gain (drei units) lowering the resolution must bring to count as helping. */
  minGain?: number;
}

export interface DprGovernorState {
  /** Full resolution (DPR_RANGE) in use. */
  readonly high: boolean;
  /** Settled on low DPR after an oscillation, until `lockedUntil`. */
  readonly locked: boolean;
  readonly lockedUntil: number;
  /** Declines ignored until then: lowering the resolution did not help. */
  readonly suppressedUntil: number;
}

export interface DprGovernor {
  onDecline(api?: MonitorReading): void;
  onIncline(api?: MonitorReading): void;
  readonly state: DprGovernorState;
}

const MINUTE = 60_000;

function meanFps(api: MonitorReading | undefined): number | null {
  if (!api || api.averages.length === 0) return null;
  let sum = 0;
  for (const v of api.averages) sum += v;
  return sum / api.averages.length;
}

export function createDprGovernor({
  setDpr,
  now = () => performance.now(),
  quickMs = 8_500,
  lockMs = 3 * MINUTE,
  suppressMs = MINUTE,
  maxBackoffMs = 30 * MINUTE,
  minGain = 3,
}: DprGovernorOptions): DprGovernor {
  const state = { high: true, locked: false, lockedUntil: 0, suppressedUntil: 0 };
  let lockSpan = lockMs;
  let suppressSpan = suppressMs;
  /** When full resolution was last restored by an incline (null: not since the last decline). */
  let raisedAt: number | null = null;
  /** The decline that lowered the resolution, until we know whether lowering helped. */
  let lowered: { at: number; fps: number } | null = null;

  const restoreHigh = (t: number) => {
    // Resolution is not the bottleneck: stay sharp and stop trying for a while.
    state.high = true;
    state.locked = false;
    state.suppressedUntil = t + suppressSpan;
    suppressSpan = Math.min(maxBackoffMs, suppressSpan * 2);
    raisedAt = null;
    lowered = null;
    setDpr(DPR_RANGE);
  };

  return {
    state,
    onDecline(api) {
      const t = now();
      const fps = meanFps(api);
      if (!state.high) {
        // Still slow at low DPR. Right after lowering, this tells whether lowering helped.
        if (lowered && fps !== null && t - lowered.at <= quickMs) {
          if (fps - lowered.fps < minGain) {
            restoreHigh(t);
            return;
          }
          suppressSpan = suppressMs;
        }
        lowered = null;
        return;
      }
      if (t < state.suppressedUntil) return;
      if (raisedAt !== null && t - raisedAt <= quickMs) {
        // Oscillating: full resolution cannot hold the frame rate. Settle low, retry later.
        state.locked = true;
        state.lockedUntil = t + lockSpan;
        lockSpan = Math.min(maxBackoffMs, lockSpan * 2);
      } else if (raisedAt !== null && t - raisedAt >= lockMs) {
        // Full resolution held for a good while since the last retry: forget the back-off.
        lockSpan = lockMs;
      }
      state.high = false;
      raisedAt = null;
      lowered = fps === null ? null : { at: t, fps };
      setDpr(DPR_LOW);
    },
    onIncline() {
      // drei reports a good period at full resolution too: nothing to do (and not a change).
      if (state.high) return;
      const t = now();
      if (state.locked) {
        if (t < state.lockedUntil) return;
        state.locked = false; // retry full resolution
      }
      state.high = true;
      raisedAt = t;
      lowered = null;
      setDpr(DPR_RANGE);
    },
  };
}
