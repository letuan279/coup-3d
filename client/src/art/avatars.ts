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

/**
 * Square portrait (256×256) image URL: the blob: URL from `warmAvatarUrl` when ready, else a
 * data URL encoded synchronously (a main-thread stall — see cardArt.ts).
 */
export function getAvatarUrl(avatar: AvatarId): string {
  let u = urlCache.get(avatar);
  if (!u) {
    u = getAvatarCanvas(avatar).toDataURL('image/png');
    urlCache.set(avatar, u);
  }
  return u;
}

const encoding = new Set<AvatarId>();

/** Encodes the portrait off the main thread (`toBlob`) so its first <img> costs nothing. */
export function warmAvatarUrl(avatar: AvatarId): Promise<void> {
  if (urlCache.has(avatar) || encoding.has(avatar)) return Promise.resolve();
  const c = getAvatarCanvas(avatar);
  if (typeof c.toBlob !== 'function' || typeof URL.createObjectURL !== 'function') {
    getAvatarUrl(avatar);
    return Promise.resolve();
  }
  encoding.add(avatar);
  return new Promise((resolve) => {
    c.toBlob((blob) => {
      encoding.delete(avatar);
      if (blob && !urlCache.has(avatar)) urlCache.set(avatar, URL.createObjectURL(blob));
      resolve();
    }, 'image/png');
  });
}
