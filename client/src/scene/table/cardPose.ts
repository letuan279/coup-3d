/**
 * Resting poses of the influence cards on the felt, and the per-frame easing towards them
 * (pure math — no React, no WebGL — so the tests can check what the first-person camera
 * actually sees and that no animation dips a card through the felt).
 *
 * Card hierarchy in Cards.tsx: outer group (position = bottom-edge centre, rotation.y = yaw)
 * → flipper (rotation.z: 0 face up, π face down) → inner (rotation.x = -π/2 + prop) → a plane
 * whose origin is on its bottom edge. prop 0 = lying flat, top pointing along the yaw.
 */
import { damp, dampAngle } from 'maath/easing';
import { CARD_H, CARD_RADIUS, LOCAL_CARD_RADIUS, TABLE, VIEW_Z, type SeatFrame } from '../layout';

export interface CardPoseSpec {
  slot: number;
  isLocal: boolean;
  revealed: boolean;
}

export interface Pose {
  x: number;
  y: number;
  z: number;
  yaw: number;
  prop: number;
}

/** Own hidden cards lean towards the camera (radians). */
export const PROP = 0.62;
/** Own revealed cards lie flat, splayed outwards. */
const DEAD_TWIST = 0.38;
/**
 * Revealed opponent cards stand up (radians from flat) and turn to the local seat so the
 * character art stays readable from across the table — which characters are out is core
 * information for challenges.
 */
export const SHOWN_PROP = 1.0;
/** Distance of each revealed card from the pair's centre, across the line of sight. */
const SHOWN_SPREAD = 0.14;
/** Small outward fan so a pair of lost cards reads as "discarded", not as a live hand. */
const SHOWN_FAN = 0.08;
/**
 * Revealed cards sit further out than the hidden ones (still inside the felt), towards their
 * owner: the pairs of neighbouring seats then don't cover each other, nor the next seat's
 * coins, at a full 6-player table (coins sit on the inner side, see coinLayout.ts).
 */
const SHOWN_PUSH = 0.18;

/** Resting pose of a card (bottom-edge centre, yaw so the card's top points `up`). */
export function homePose(spec: CardPoseSpec, f: SeatFrame, out: Pose): Pose {
  if (spec.isLocal) {
    const x = spec.slot === 0 ? -0.165 : 0.165;
    out.x = x + (spec.revealed ? (spec.slot === 0 ? -0.05 : 0.05) : 0);
    out.z = LOCAL_CARD_RADIUS + CARD_H / 2 + (spec.revealed ? -0.04 : 0);
    out.y = TABLE.feltY + 0.003;
    out.yaw = spec.revealed ? (spec.slot === 0 ? DEAD_TWIST : -DEAD_TWIST) : 0;
    out.prop = spec.revealed ? 0 : PROP;
    return out;
  }
  const side = spec.slot === 0 ? -0.15 : 0.15;
  if (!spec.revealed) {
    const cx = f.outX * CARD_RADIUS + f.rightX * side;
    const cz = f.outZ * CARD_RADIUS + f.rightZ * side;
    out.x = cx - f.outX * (CARD_H / 2);
    out.z = cz - f.outZ * (CARD_H / 2);
    out.y = TABLE.feltY + 0.003 + spec.slot * 0.001;
    out.yaw = Math.atan2(-f.outX, -f.outZ);
    out.prop = 0;
    return out;
  }
  // Revealed: stand the card up facing the camera. Spread the pair across the line of sight
  // (keeping each card on the same screen side as when it lay face down), so neither card
  // hides the other even for the seats beside the camera.
  const r = CARD_RADIUS + SHOWN_PUSH;
  const px = f.outX * r;
  const pz = f.outZ * r;
  let vx = px;
  let vz = pz - VIEW_Z;
  const len = Math.hypot(vx, vz) || 1;
  vx /= len;
  vz /= len;
  // Screen-right direction on the floor for this line of sight.
  const sx = -vz;
  const sz = vx;
  const screenSide = Math.sign(side * (f.rightX * sx + f.rightZ * sz)) || Math.sign(side);
  const cx = px + sx * SHOWN_SPREAD * screenSide;
  const cz = pz + sz * SHOWN_SPREAD * screenSide;
  // Bottom edge towards the camera, footprint centred on (cx, cz).
  const back = (CARD_H / 2) * Math.cos(SHOWN_PROP);
  out.x = cx - vx * back;
  out.z = cz - vz * back;
  out.y = TABLE.feltY + 0.003;
  // Top edge points away from the camera (so the propped face looks at it), tops fanned apart.
  out.yaw = Math.atan2(-out.x, VIEW_Z - out.z) - SHOWN_FAN * screenSide;
  out.prop = SHOWN_PROP;
  return out;
}

/** Hop of a flipping card at the vertical point of its turn: clears a flat card's corners. */
const FLIP_HOP = 0.16;

/**
 * Stand-up (prop) a card may take at flipper angle `flip`: none until it has turned face up
 * past vertical. Standing it up while it is still face down would swing its top edge down
 * through the felt as the flip turns it over (SCN-4: revealed opponent cards stand up).
 */
export function propWhileFlipping(flip: number, prop: number): number {
  return Math.abs(flip) < Math.PI / 2 ? prop : 0;
}

/**
 * Lift of a turning card above its resting height: the hop, plus how far a card still propped
 * `prop` would sink its top edge below the pivot while past vertical (turning back face down
 * before it has settled flat — e.g. a resync straight into a new game).
 */
export function flipLift(flip: number, prop: number): number {
  return Math.abs(Math.sin(flip)) * FLIP_HOP + Math.max(0, -CARD_H * Math.sin(prop) * Math.cos(flip));
}

type Xyz = { x: number; y: number; z: number };
/** The animated parts of a card in Cards.tsx (three's Vector3 / Euler fit). */
export type CardRig = {
  outer: { position: Xyz; rotation: Xyz };
  flipper: { rotation: Xyz };
  inner: { rotation: Xyz };
};

/** One frame of a card easing towards its resting pose `home`: slide, turn, flip, stand up, hop. */
export function settleCard({ outer, flipper, inner }: CardRig, home: Pose, faceUp: boolean, dt: number): void {
  damp(outer.position, 'x', home.x, 0.22, dt);
  damp(outer.position, 'z', home.z, 0.22, dt);
  dampAngle(outer.rotation, 'y', home.yaw, 0.3, dt);
  damp(flipper.rotation, 'z', faceUp ? 0 : Math.PI, 0.22, dt);
  damp(inner.rotation, 'x', -Math.PI / 2 + propWhileFlipping(flipper.rotation.z, home.prop), 0.25, dt);
  outer.position.y = home.y + flipLift(flipper.rotation.z, inner.rotation.x + Math.PI / 2);
}
