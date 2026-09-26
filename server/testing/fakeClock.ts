/** Deterministic Clock for tests: time only moves when the test calls `advance`/`runUntil`. */
import type { Clock, Timer } from '../clock';

interface Scheduled {
  at: number;
  order: number;
  fn: () => void;
  cancelled: boolean;
}

export class FakeClock implements Clock {
  private t: number;
  private order = 0;
  private queue: Scheduled[] = [];

  constructor(start = 1_000_000) {
    this.t = start;
  }

  now(): number {
    return this.t;
  }

  setTimeout(fn: () => void, ms: number): Timer {
    const item: Scheduled = { at: this.t + Math.max(0, ms), order: this.order++, fn, cancelled: false };
    this.queue.push(item);
    return {
      cancel: () => {
        item.cancelled = true;
      },
    };
  }

  /** Number of live (not cancelled, not yet fired) timers. */
  get pending(): number {
    return this.queue.filter((q) => !q.cancelled).length;
  }

  /** Time of the next live timer, or null. */
  nextAt(): number | null {
    const next = this.pop(false);
    return next ? next.at : null;
  }

  /** Move time forward by `ms`, firing every timer that falls due (in order, including ones scheduled meanwhile). */
  advance(ms: number): void {
    const target = this.t + ms;
    for (;;) {
      const next = this.pop(false);
      if (!next || next.at > target) break;
      this.pop(true);
      this.t = Math.max(this.t, next.at);
      next.fn();
    }
    this.t = target;
  }

  /** Fire timers one by one until `done()` or `maxMs` of simulated time has passed. Returns done(). */
  runUntil(done: () => boolean, maxMs = 3_600_000): boolean {
    const limit = this.t + maxMs;
    while (!done()) {
      const next = this.pop(false);
      if (!next || next.at > limit) return done();
      this.advance(next.at - this.t);
    }
    return true;
  }

  private pop(remove: boolean): Scheduled | undefined {
    this.queue = this.queue.filter((q) => !q.cancelled);
    let best: Scheduled | undefined;
    for (const q of this.queue) if (!best || q.at < best.at || (q.at === best.at && q.order < best.order)) best = q;
    if (best && remove) this.queue = this.queue.filter((q) => q !== best);
    return best;
  }
}
