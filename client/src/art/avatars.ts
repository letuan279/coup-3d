/**
 * 2D avatar portraits (canvas-drawn) for the lobby / HUD. CONTRACT FILE: the art owner replaces
 * the placeholder drawing but keeps the exports. Cached per avatar.
 */
import type { AvatarId } from '@shared/types';
import { AVATAR_COLORS, PALETTE } from './palette';

const cache = new Map<AvatarId, string>();

/** Square portrait (256×256) data URL. */
export function getAvatarUrl(avatar: AvatarId): string {
  const hit = cache.get(avatar);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  g.fillStyle = AVATAR_COLORS[avatar].body;
  g.beginPath();
  g.arc(128, 128, 110, 0, Math.PI * 2);
  g.fill();
  g.lineWidth = 10;
  g.strokeStyle = PALETTE.ink;
  g.stroke();
  const url = c.toDataURL('image/png');
  cache.set(avatar, url);
  return url;
}
