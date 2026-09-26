/**
 * Time source + scheduler, injected everywhere the server deals with time so tests can drive
 * timers deterministically (see server/testing/fakeClock.ts).
 */

export interface Timer {
  /** Idempotent. */
  cancel(): void;
}

export interface Clock {
  /** Epoch milliseconds. */
  now(): number;
  /** Run `fn` once after `ms` (clamped to ≥ 0). */
  setTimeout(fn: () => void, ms: number): Timer;
}

export const systemClock: Clock = {
  now: () => Date.now(),
  setTimeout(fn, ms) {
    const handle = setTimeout(fn, Math.max(0, ms));
    return { cancel: () => clearTimeout(handle) };
  },
};
