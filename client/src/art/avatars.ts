/**
 * 2D avatar portraits (canvas-drawn) for the lobby / HUD. CONTRACT FILE: keeps the exports.
 * Cached per avatar; drawing lives in ./animals.
 */
import type { AvatarId } from '@shared/types';
import { makeCanvas } from './draw';
import { AVATAR_SIZE, drawAvatar } from './animals';

export { AVATAR_BACKGROUNDS } from './animals';

const canvasCache = new Map<AvatarId, HTMLCanvasElement>();
const urlCache = new Map<AvatarId, string>();

/** Square portrait canvas (256×256, transparent outside the round disc). */
export function getAvatarCanvas(avatar: AvatarId): HTMLCanvasElement {
  const hit = canvasCache.get(avatar);
  if (hit) return hit;
  const [c, g] = makeCanvas(AVATAR_SIZE, AVATAR_SIZE);
  drawAvatar(g, avatar);
  canvasCache.set(avatar, c);
  return c;
}

/** Square portrait (256×256) data URL. */
export function getAvatarUrl(avatar: AvatarId): string {
  let u = urlCache.get(avatar);
  if (!u) {
    u = getAvatarCanvas(avatar).toDataURL('image/png');
    urlCache.set(avatar, u);
  }
  return u;
}
