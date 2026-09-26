/**
 * Every coin on the table — player stacks, the treasury pile and coins in flight — is ONE
 * InstancedMesh. Stacks lag behind the store while coins fly, so a 'coins' event visibly
 * moves coins from one pile to another in arcs.
 */
import { useLayoutEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { CylinderGeometry, Euler, InstancedMesh, Matrix4, Quaternion, Vector3 } from 'three';
import type { CoinParty } from '@shared/types';
import { GeoBuilder } from '../geo';
import { coinMat } from '../materials';
import { CARD_RADIUS, LOCAL_CARD_RADIUS, SEAT_RADIUS, TABLE, TREASURY_POS, frameAt } from '../layout';
import { nowSec } from '../reactions';

const CAPACITY = 72;
const COIN_R = 0.058;
const COIN_H = 0.017;
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
  to: CoinParty;
  start: number;
  from: Vector3;
  spin: number;
}

// ── Module-level flight queue (fed by the event director) ──
const flights: Flight[] = [];
const pendingIn = new Map<CoinParty, number>();
let latest: CoinTableState = { seats: [], treasury: 0 };
let dirty = true;

function displayCount(party: CoinParty): number {
  const actual = party === 'treasury' ? latest.treasury : latest.seats.find((s) => s.id === party)?.coins ?? 0;
  return Math.max(0, actual - (pendingIn.get(party) ?? 0));
}

export function queueCoinFlight(from: CoinParty, to: CoinParty, amount: number): void {
  const fromSeatKnown = from === 'treasury' || latest.seats.some((s) => s.id === from);
  const toSeatKnown = to === 'treasury' || latest.seats.some((s) => s.id === to);
  if (!fromSeatKnown || !toSeatKnown || amount <= 0) return;
  const t0 = nowSec();
  const base = displayCount(from);
  for (let k = 0; k < amount && flights.length < 40; k++) {
    const from3 = new Vector3();
    stackSlot(from, base + amount - 1 - k, from3);
    flights.push({ to, start: t0 + k * STAGGER, from: from3, spin: (k % 2 ? 1 : -1) * (6 + k) });
  }
  pendingIn.set(to, (pendingIn.get(to) ?? 0) + Math.min(amount, 40));
  dirty = true;
}

export function resetCoinFlights(): void {
  flights.length = 0;
  pendingIn.clear();
  dirty = true;
}

// ── Pile layouts ──

const HEX: [number, number][] = [
  [0, 0],
  [1, 0],
  [0.5, 0.87],
  [-0.5, 0.87],
  [-1, 0],
  [-0.5, -0.87],
  [0.5, -0.87],
  [1.5, 0.87],
];

const seatFrame = frameAt(0);

/** World position of the i-th coin of a pile. */
function stackSlot(party: CoinParty, i: number, out: Vector3): Vector3 {
  if (party === 'treasury') {
    const per = 8;
    const col = Math.floor(i / per) % HEX.length;
    const lvl = i % per;
    const [hx, hz] = HEX[col];
    const jitter = ((col * 7 + lvl * 3) % 5) * 0.002;
    return out.set(TREASURY_POS[0] + hx * COIN_R * 2.15 + jitter, TABLE.feltY + COIN_H * (lvl + 0.5), TREASURY_POS[1] + hz * COIN_R * 2.15);
  }
  const seat = latest.seats.find((s) => s.id === party);
  if (!seat) return out.set(0, TABLE.feltY, 0);
  frameAt(seat.angle, SEAT_RADIUS, seatFrame);
  const per = 5;
  const col = Math.floor(i / per);
  const lvl = i % per;
  const cx = col % 3;
  const cr = Math.floor(col / 3);
  const radius = (seat.isLocal ? LOCAL_CARD_RADIUS + 0.08 : CARD_RADIUS + 0.02) - cr * COIN_R * 2.1 + (cx === 1 ? COIN_R : 0);
  const right = (seat.isLocal ? 0.5 : 0.46) + cx * COIN_R * 1.9;
  return out.set(
    seatFrame.outX * radius + seatFrame.rightX * right,
    TABLE.feltY + COIN_H * (lvl + 0.5),
    seatFrame.outZ * radius + seatFrame.rightZ * right,
  );
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
  const count = Math.min(displayCount(party), 50);
  for (let i = 0; i < count; i++) put(m, stackSlot(party, i, p), 0, 0);
}

export function Coins({ state }: { state: CoinTableState }) {
  const mesh = useRef<InstancedMesh>(null);

  useLayoutEffect(() => {
    latest = state;
    // Drop pending counts that no longer make sense (e.g. after a resync).
    for (const [party, n] of pendingIn) {
      const actual = party === 'treasury' ? state.treasury : state.seats.find((s) => s.id === party)?.coins ?? 0;
      if (n > actual) pendingIn.set(party, actual);
    }
    dirty = true;
  }, [state]);

  useFrame(() => {
    const m = mesh.current;
    if (!m) return;
    if (!dirty && flights.length === 0) return;
    dirty = false;
    const now = nowSec();
    used = 0;

    // Land finished flights first so their coins join the destination stacks this frame.
    for (let i = flights.length - 1; i >= 0; i--) {
      const f = flights[i];
      if (now - f.start >= FLIGHT_TIME) {
        pendingIn.set(f.to, Math.max(0, (pendingIn.get(f.to) ?? 0) - 1));
        flights.splice(i, 1);
      }
    }
    putPile(m, 'treasury');
    for (const s of latest.seats) putPile(m, s.id);
    for (const f of flights) {
      const k = (now - f.start) / FLIGHT_TIME;
      if (k < 0) {
        put(m, f.from, 0, 0);
        continue;
      }
      stackSlot(f.to, displayCount(f.to), target);
      const s = k * k * (3 - 2 * k);
      p.lerpVectors(f.from, target, s);
      p.y += Math.sin(k * Math.PI) * (0.32 + f.from.distanceTo(target) * 0.12);
      put(m, p, f.spin * k, f.spin * k * 0.3);
    }
    m.count = used;
    m.instanceMatrix.needsUpdate = true;
  });

  return <instancedMesh ref={mesh} args={[coinGeo, coinMat(), CAPACITY]} frustumCulled={false} />;
}
