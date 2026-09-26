/** Token bucket: `ratePerSecond` sustained, up to `burst` at once. */
export class RateLimiter {
  private tokens: number;
  private last: number;

  constructor(
    private readonly ratePerSecond: number,
    private readonly burst: number,
    private readonly now: () => number = Date.now,
  ) {
    this.tokens = burst;
    this.last = now();
  }

  /** Consume one token; false when the caller is over the limit. */
  take(): boolean {
    const t = this.now();
    const elapsed = Math.max(0, t - this.last);
    this.last = t;
    this.tokens = Math.min(this.burst, this.tokens + (elapsed / 1000) * this.ratePerSecond);
    if (this.tokens < 1) return false;
    this.tokens -= 1;
    return true;
  }
}
