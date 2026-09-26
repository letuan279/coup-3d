/**
 * Per-seat rejoin secrets (docs/SPEC.md §2 "Rejoin from another device"). A key proves
 * ownership of a human seat, so it comes from the OS CSPRNG (never the room's seeded rand) and
 * is only ever sent to that seat's own client (RoomView.rejoinKey).
 */
import { randomBytes, timingSafeEqual } from 'node:crypto';

/** 12 random bytes = 96 bits of entropy (SPEC requires ≥ 64). */
const REJOIN_KEY_BYTES = 12;
/** base64url length of REJOIN_KEY_BYTES (no padding). */
export const REJOIN_KEY_LENGTH = 16;

export function newRejoinKey(): string {
  return randomBytes(REJOIN_KEY_BYTES).toString('base64url');
}

/** Constant-time comparison (for equal lengths; the length itself is public). */
export function sameRejoinKey(expected: string, given: string): boolean {
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(given, 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}
