/**
 * Pure seating / table layout math for the tavern scene (no three.js, no React).
 *
 * World frame: table centre at the origin, y up. The local player always sits at relative
 * angle 0 on the +z side, looking towards -z. Relative angles grow clockwise when seen from
 * above, i.e. the next player in turn order sits to the local player's left.
 */

export const TABLE = {
  /** Height of the felt surface. */
  feltY: 0.79,
  /** Outer radius of the wooden rim. */
  radius: 1.66,
  feltRadius: 1.44,
} as const;

/** Distance from the table centre to an opponent's chair. */
export const SEAT_RADIUS = 2.12;
/** Distance from the table centre to an opponent's face-down cards. */
export const CARD_RADIUS = 1.02;
/** Distance from the table centre to the local player's own cards. */
export const LOCAL_CARD_RADIUS = 0.9;
export const CARD_W = 0.25;
export const CARD_H = 0.35;
/** Height of a character's eyes / nameplate anchor above the floor (local seat space). */
export const HEAD_Y = 1.46;
export const PLATE_Y = 1.98;

export const TREASURY_POS: readonly [number, number] = [-0.34, 0.06];
export const DECK_POS: readonly [number, number] = [0.32, -0.04];

const DEG = Math.PI / 180;

/** Relative angles (radians) for `count` opponents spread over the far arc of the table. */
export function opponentAngles(count: number): number[] {
  if (count <= 0) return [];
  if (count === 1) return [Math.PI];
  const span = [0, 0, 96, 124, 140, 150][Math.min(count, 5)] * DEG;
  const start = Math.PI - span / 2;
  const step = span / (count - 1);
  return Array.from({ length: count }, (_, i) => start + i * step);
}

/** Relative angle of layout slot `slot` (0 = local seat) for a table with `total` seats. */
export function slotAngle(slot: number, total: number): number {
  if (slot <= 0) return 0;
  const angles = opponentAngles(Math.max(1, total - 1));
  return angles[Math.min(slot, angles.length) - 1];
}

/** Home screen: evenly spread idle seats all around the table. */
export function homeAngle(slot: number, total: number): number {
  return Math.PI / 4 + (slot * 2 * Math.PI) / total;
}

export interface SeatFrame {
  /** Seat position on the floor. */
  x: number;
  z: number;
  /** Unit vector from the table centre towards the seat. */
  outX: number;
  outZ: number;
  /** Unit vector pointing to the seated player's right hand (they face the table centre). */
  rightX: number;
  rightZ: number;
  /** Rotation around y so a model facing +z looks at the table centre. */
  yaw: number;
}

export function frameAt(angle: number, radius: number = SEAT_RADIUS, out?: SeatFrame): SeatFrame {
  const f = out ?? { x: 0, z: 0, outX: 0, outZ: 0, rightX: 0, rightZ: 0, yaw: 0 };
  const ox = -Math.sin(angle);
  const oz = Math.cos(angle);
  f.outX = ox;
  f.outZ = oz;
  f.x = ox * radius;
  f.z = oz * radius;
  // Facing direction is -out; right = facing × up = (-fz, 0, fx) with f = -out.
  f.rightX = oz;
  f.rightZ = -ox;
  f.yaw = Math.atan2(-ox, -oz);
  return f;
}

/** First-person camera placement for the local seat, by number of seated players. */
export function seatCamera(total: number): { radius: number; height: number; lookY: number; lookIn: number } {
  const t = Math.min(1, Math.max(0, (total - 2) / 4));
  return {
    radius: 2.72 + 0.45 * t,
    height: 1.5 + 0.2 * t,
    lookY: TABLE.feltY,
    // Look a little past the centre so the far opponents sit in the middle of the frame.
    lookIn: 0.35,
  };
}
