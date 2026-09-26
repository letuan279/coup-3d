/**
 * Small deterministic RNG helpers (mulberry32). Pure functions over a numeric state so the
 * engine can store the state inside GameState and stay reproducible.
 */

/** Advance the state and return [nextState, float in [0,1)]. */
export function rngNext(state: number): [number, number] {
  let t = (state + 0x6d2b79f5) | 0;
  const next = t;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return [next, value];
}

/** Stateful convenience wrapper — handy for bots/server where storing state is not required. */
export function createRng(seed: number): () => number {
  let s = seed | 0;
  return () => {
    const [n, v] = rngNext(s);
    s = n;
    return v;
  };
}

/** Fisher–Yates shuffle driven by a `() => number` source. Returns a new array. */
export function shuffle<T>(items: readonly T[], rand: () => number): T[] {
  const a = items.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Stable 32-bit hash of a string (FNV-1a). Useful to derive per-bot personalities from ids. */
export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function randomSeed(): number {
  return (Math.random() * 0x7fffffff) | 0;
}
