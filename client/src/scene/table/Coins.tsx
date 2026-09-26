/**
 * Every coin on the table — player stacks, the treasury pile and coins in flight — is ONE
 * InstancedMesh. Stacks lag behind the store while coins fly, so a 'coins' event visibly
 * moves coins from one pile to another in arcs.
 *
 * Invariants (so the piles can never drift from the store):
 * - a pile shows `store count − coins still flying to it`, and "flying to it" is counted from
 *   the queue itself — nothing is tracked separately;
 * - coins that are not animated (queue full, tab hidden) simply appear at their destination.
 */
import { useLayoutEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { CylinderGeometry, Euler, InstancedMesh, Matrix4, Quaternion, Vector3 } from 'three';
import type { CoinParty } from '@shared/types';
import { GeoBuilder } from '../geo';
import { coinMat } from '../materials';
import { TABLE } from '../layout';
import { nowSec } from '../reactions';
import { COIN_H, COIN_R, seatCoinSlot, treasuryCoinSlot } from './coinLayout';

const CAPACITY = 72;
/** Most coins animated at once; any more just land (a big burst is still readable). */
export const MAX_FLIGHTS = 40;
/** Coins drawn per pile at most (the treasury holds 50). */
const PILE_MAX = 50;
const FLIGHT_TIME = 0.62;
const STAGGER = 0.085;

/** Closed cylinder; rim vertices darker than the faces (one tiny mesh, ~56 triangles). */
const coinGeo = (() => {
  const g = new GeoBuilder().add(new CylinderGeometry(COIN_R, COIN_R, COIN_H, 14), '#FFC94D').build();
  const nrm = g.attributes.normal;
  const col = g.attributes.color;
  for (let i = 0; i < col.count; i++) {
    if (Math.abs(nrm.getY(i)) < 0.5) col.setXYZ(i, col.getX(i) * 0.72, col.getY(i) * 0.55, col.getZ(i) * 0.25);
  }
  return g;
})();

export interface CoinSeat {
  id: string;
  angle: number;
  isLocal: boolean;
  coins: number;
}

export interface CoinTableState {
  seats: CoinSeat[];
  treasury: number;
}

interface Flight {
  from: CoinParty;
  to: CoinParty;
  /** Coins queued together by one event share a group; `k` = order of take-off in it. */
  group: number;
  k: number;
  start: number;
  /**
   * Take-off position. Resolved lazily on the first frame that sees the flight: the director
   * queues flights right after the store update but before React commits it, so the source
   * pile's count is only current by then (see `resolveTakeOffs`).
   */
  origin: Vector3;
  resolved: boolean;
  spin: number;
}

// ── Module-level flight queue (fed by the event director) ──
const flights: Flight[] = [];
let groupSeq = 0;
let latest: CoinTableState = { seats: [], treasury: 0 };
let dirty = true;

function pageHidden(): boolean {
  return typeof document !== 'undefined' && document.hidden === true;
}

function storeCount(party: CoinParty): number {
  return party === 'treasury' ? latest.treasury : latest.seats.find((s) => s.id === party)?.coins ?? 0;
}

/** Coins still in the air (or waiting to take off) towards `party`. */
function incoming(party: CoinParty): number {
  let n = 0;
  for (const f of flights) if (f.to === party) n++;
  return n;
}

function displayCount(party: CoinParty): number {
  return Math.max(0, storeCount(party) - incoming(party));
}

export function queueCoinFlight(from: CoinParty, to: CoinParty, amount: number): void {
  // rAF is paused in a background tab: nothing would fly, so let the piles snap instead.
  if (amount <= 0 || pageHidden()) return;
  const known = (p: CoinParty) => p === 'treasury' || latest.seats.some((s) => s.id === p);
  if (!known(from) || !known(to)) return;
  const t0 = nowSec();
  const group = ++groupSeq;
  for (let k = 0; k < amount && flights.length < MAX_FLIGHTS; k++) {
    flights.push({ from, to, group, k, start: t0 + k * STAGGER, origin: new Vector3(), resolved: false, spin: (k % 2 ? 1 : -1) * (6 + k) });
  }
  dirty = true;
}

export function resetCoinFlights(): void {
  flights.length = 0;
  dirty = true;
}

/** World position of the i-th coin of a pile. */
export function stackSlot(party: CoinParty, i: number, out: Vector3): Vector3 {
  if (party === 'treasury') return treasuryCoinSlot(i, out);
  const seat = latest.seats.find((s) => s.id === party);
  if (!seat) return out.set(0, TABLE.feltY, 0);
  return seatCoinSlot(seat.angle, seat.isLocal, i, out);
}

const aboveDisplay = new Map<CoinParty, number>();

/**
 * Gives new flights their take-off slot: the coins that left a pile were the top of it, i.e.
 * right above what the pile displays now. Several new groups from one pile stack up in queue
 * order (the earliest event took the highest coins), so walk the queue from the newest group.
 */
function resolveTakeOffs(): void {
  aboveDisplay.clear();
  for (let i = flights.length - 1; i >= 0; ) {
    const f = flights[i];
    if (f.resolved) {
      i--;
      continue;
    }
    let j = i;
    while (j > 0 && flights[j - 1].group === f.group && !flights[j - 1].resolved) j--;
    const size = i - j + 1;
    const above = aboveDisplay.get(f.from) ?? 0;
    const base = displayCount(f.from) + above;
    for (let x = j; x <= i; x++) {
      const g = flights[x];
      stackSlot(g.from, Math.min(PILE_MAX - 1, base + (size - 1 - (g.k - flights[j].k))), g.origin);
      g.resolved = true;
    }
    aboveDisplay.set(f.from, above + size);
    i = j - 1;
  }
}

const m4 = new Matrix4();
const q = new Quaternion();
const e = new Euler();
const p = new Vector3();
const target = new Vector3();
const ONE = new Vector3(1, 1, 1);
let used = 0;

function put(m: InstancedMesh, pos: Vector3, rx: number, rz: number) {
  if (used >= CAPACITY) return;
  e.set(rx, (used * 1.7) % 6.28, rz);
  q.setFromEuler(e);
  m4.compose(pos, q, ONE);
  m.setMatrixAt(used++, m4);
}

function putPile(m: InstancedMesh, party: CoinParty) {
  const count = Math.min(displayCount(party), PILE_MAX);
  for (let i = 0; i < count; i++) put(m, stackSlot(party, i, p), 0, 0);
}

export function Coins({ state }: { state: CoinTableState }) {
  const mesh = useRef<InstancedMesh>(null);

  useLayoutEffect(() => {
    latest = state;
    dirty = true;
  }, [state]);

  useFrame(() => {
    const m = mesh.current;
    if (!m) return;
    if (!dirty && flights.length === 0) return;
    dirty = false;
    const now = nowSec();
    used = 0;

    resolveTakeOffs();
    // Land finished flights first so their coins join the destination stacks this frame.
    for (let i = flights.length - 1; i >= 0; i--) {
      if (now - flights[i].start >= FLIGHT_TIME) flights.splice(i, 1);
    }
    putPile(m, 'treasury');
    for (const s of latest.seats) putPile(m, s.id);
    for (const f of flights) {
      const k = (now - f.start) / FLIGHT_TIME;
      if (k <= 0) {
        put(m, f.origin, 0, 0);
        continue;
      }
      stackSlot(f.to, Math.min(PILE_MAX - 1, displayCount(f.to)), target);
      const s = k * k * (3 - 2 * k);
      p.lerpVectors(f.origin, target, s);
      p.y += Math.sin(k * Math.PI) * (0.32 + f.origin.distanceTo(target) * 0.12);
      put(m, p, f.spin * k, f.spin * k * 0.3);
    }
    m.count = used;
    m.instanceMatrix.needsUpdate = true;
  });

  return <instancedMesh ref={mesh} args={[coinGeo, coinMat(), CAPACITY]} frustumCulled={false} />;
}
