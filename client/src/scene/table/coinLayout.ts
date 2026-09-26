/**
 * Where each coin of a pile sits (pure math, shared by the coin renderer and the layout tests).
 */
import type { Vector3 } from 'three';
import { LOCAL_CARD_RADIUS, SEAT_RADIUS, TABLE, TREASURY_POS, cameraSideHand, frameAt } from '../layout';

export const COIN_R = 0.058;
export const COIN_H = 0.017;

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

/** World position of the i-th coin of the treasury pile. */
export function treasuryCoinSlot(i: number, out: Vector3): Vector3 {
  const per = 8;
  const col = Math.floor(i / per) % HEX.length;
  const lvl = i % per;
  const [hx, hz] = HEX[col];
  const jitter = ((col * 7 + lvl * 3) % 5) * 0.002;
  return out.set(TREASURY_POS[0] + hx * COIN_R * 2.15 + jitter, TABLE.feltY + COIN_H * (lvl + 0.5), TREASURY_POS[1] + hz * COIN_R * 2.15);
}

const seatFrame = frameAt(0);

/**
 * Opponents' stacks: in front of their cards, towards the table centre, and on the hand that
 * faces the camera. Revealed cards stand up further out (cardPose.ts), so from the first-person
 * view no standing card — theirs or a neighbour's — ever hides a stack.
 */
const OPP_COIN_RADIUS = 0.72;
const OPP_COIN_SIDE = 0.36;

/**
 * World position of the i-th coin of a seat's stack: beside the player's cards (the local
 * player: on their right), columns of 5, rows of 3 columns growing towards the centre.
 */
export function seatCoinSlot(angle: number, isLocal: boolean, i: number, out: Vector3): Vector3 {
  frameAt(angle, SEAT_RADIUS, seatFrame);
  const per = 5;
  const col = Math.floor(i / per);
  const lvl = i % per;
  const cx = col % 3;
  const cr = Math.floor(col / 3);
  const radius = (isLocal ? LOCAL_CARD_RADIUS + 0.08 : OPP_COIN_RADIUS) - cr * COIN_R * 2.1 + (cx === 1 ? COIN_R : 0);
  const hand = isLocal ? 1 : cameraSideHand(angle);
  const right = ((isLocal ? 0.5 : OPP_COIN_SIDE) + cx * COIN_R * 1.9) * hand;
  return out.set(
    seatFrame.outX * radius + seatFrame.rightX * right,
    TABLE.feltY + COIN_H * (lvl + 0.5),
    seatFrame.outZ * radius + seatFrame.rightZ * right,
  );
}
