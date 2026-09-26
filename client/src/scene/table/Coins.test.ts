/**
 * Coin pile harness: runs the real Coins module with React / R3F stubbed out, a fake
 * InstancedMesh and a fake clock (regressions for perf3d-2 and perf3d-5).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Matrix4, Vector3 } from 'three';

const positions: Vector3[] = [];
const fakeMesh = {
  count: 0,
  setMatrixAt: (i: number, m: Matrix4) => {
    positions[i] = new Vector3().setFromMatrixPosition(m);
  },
  instanceMatrix: { needsUpdate: false },
};
let frameCb: (() => void) | null = null;

vi.mock('@react-three/fiber', () => ({
  useFrame: (cb: () => void) => {
    frameCb = cb;
  },
}));
vi.mock('react', async (orig) => ({
  ...(await orig<typeof import('react')>()),
  useLayoutEffect: (fn: () => void) => fn(),
  useRef: () => ({ current: fakeMesh }),
}));
vi.mock('../materials', () => ({ coinMat: () => null }));

import { Coins, MAX_FLIGHTS, queueCoinFlight, resetCoinFlights, stackSlot, type CoinTableState } from './Coins';

let now = 0;
let st: CoinTableState;

function total(s: CoinTableState): number {
  return s.seats.reduce((n, x) => n + Math.min(50, x.coins), 0) + Math.min(50, s.treasury);
}

/** What socket.ts + the director do: store update, then the event (before React commits). */
function move(from: string, to: string, amount: number, commit = true) {
  queueCoinFlight(from, to, amount);
  const delta = (id: string) => (id === to ? amount : 0) - (id === from ? amount : 0);
  st = { treasury: st.treasury + delta('treasury'), seats: st.seats.map((s) => ({ ...s, coins: s.coins + delta(s.id) })) };
  if (commit) Coins({ state: st });
}

function frames(seconds: number) {
  const end = now + seconds * 1000;
  while (now < end) {
    now += 1000 / 60;
    frameCb!();
  }
}

beforeEach(() => {
  now = 1000;
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  resetCoinFlights();
  st = {
    seats: [
      { id: 'p1', angle: 0, isLocal: true, coins: 2 },
      { id: 'p2', angle: Math.PI, isLocal: false, coins: 5 },
      { id: 'p3', angle: 2.2, isLocal: false, coins: 2 },
    ],
    treasury: 41,
  };
  Coins({ state: st });
  frameCb!();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('coin piles never drift from the store', () => {
  it('draws exactly the store counts at rest', () => {
    expect(fakeMesh.count).toBe(total(st));
  });

  it('recovers when more coins move than can be animated before any frame runs', () => {
    // A throttled / occluded tab: events keep coming, frames do not.
    for (let i = 0; i < 16; i++) move(i % 2 ? 'p1' : 'treasury', i % 2 ? 'treasury' : 'p1', 3);
    for (let i = 0; i < 8; i++) move('p2', 'p3', 1), move('p3', 'p2', 1);
    frames(3);
    expect(fakeMesh.count).toBe(total(st));
    move('treasury', 'p1', 1);
    frames(1.5);
    expect(fakeMesh.count).toBe(total(st));
  });

  it('snaps instead of animating while the page is hidden', () => {
    vi.stubGlobal('document', { hidden: true });
    for (let i = 0; i < 30; i++) move(i % 2 ? 'p1' : 'treasury', i % 2 ? 'treasury' : 'p1', 3);
    move('p2', 'treasury', 4);
    frameCb!();
    // Nothing is in the air: the very first frame already shows the final piles.
    expect(fakeMesh.count).toBe(total(st));
    vi.stubGlobal('document', { hidden: false });
    move('treasury', 'p3', 2);
    frames(2);
    expect(fakeMesh.count).toBe(total(st));
  });

  it('caps the animated coins but still lands every coin', () => {
    st = { ...st, treasury: 50, seats: st.seats.map((s) => ({ ...s, coins: 0 })) };
    Coins({ state: st });
    move('treasury', 'p2', 45);
    frameCb!();
    // 40 coins are flying (in the air or waiting), 5 already sit on p2's pile.
    expect(fakeMesh.count).toBe(total(st));
    expect(MAX_FLIGHTS).toBe(40);
    frames(5);
    expect(fakeMesh.count).toBe(total(st));
  });
});

describe('coin take-off slots', () => {
  /** Positions of the last `n` instances (the flights, drawn after the piles). */
  function flightPositions(n: number): Vector3[] {
    return positions.slice(fakeMesh.count - n, fakeMesh.count);
  }

  it('leaving coins take off from the top of the stack they left, not beside it', () => {
    // p2 has 5 coins and pays 3: the state lands before React commits (socket.ts order).
    move('p2', 'treasury', 3, false);
    Coins({ state: st }); // the commit
    frameCb!(); // first frame after it: k = 0 is at its take-off point, the others wait there
    const got = flightPositions(3);
    const newCount = 2;
    for (let k = 0; k < 3; k++) {
      const want = stackSlot('p2', newCount + 3 - 1 - k, new Vector3());
      expect(got[k].distanceTo(want)).toBeLessThan(1e-6);
    }
  });

  it('two events from one pile in one batch take the old top slots in order', () => {
    move('p2', 'treasury', 2, false);
    move('p2', 'p3', 1, false);
    Coins({ state: st });
    frameCb!();
    const got = flightPositions(3);
    // Old stack 5 → 2 left: the first event took slots 4 and 3, the second slot 2.
    const want = [4, 3, 2].map((i) => stackSlot('p2', i, new Vector3()));
    for (let k = 0; k < 3; k++) expect(got[k].distanceTo(want[k])).toBeLessThan(1e-6);
  });

  it('the pile plus waiting coins look unchanged until the coins take off', () => {
    const before = positions.slice(0, fakeMesh.count).map((v) => v.clone());
    move('p2', 'treasury', 3, false);
    Coins({ state: st });
    frameCb!();
    const after = positions.slice(0, fakeMesh.count);
    expect(after.length).toBe(before.length);
    const key = (v: Vector3) => `${v.x.toFixed(4)},${v.y.toFixed(4)},${v.z.toFixed(4)}`;
    expect(new Set(after.map(key))).toEqual(new Set(before.map(key)));
  });
});
