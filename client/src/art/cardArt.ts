/**
 * Canvas-drawn card art, shared by the 3D scene (CanvasTexture) and the 2D HUD (<img src>).
 * CONTRACT FILE: the art module owner replaces the placeholder drawing but keeps these exports.
 * All results are cached per (character, lang).
 */
import type { Character } from '@shared/types';
import type { Lang } from '../store/useGame';
import { CHARACTER_COLORS, PALETTE } from './palette';

/** Card face aspect: 5:7. Canvas size used for textures. */
export const CARD_W = 500;
export const CARD_H = 700;

const faceCache = new Map<string, HTMLCanvasElement>();
let backCanvas: HTMLCanvasElement | null = null;
const urlCache = new Map<string, string>();

function makeCanvas(): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = CARD_W;
  c.height = CARD_H;
  return [c, c.getContext('2d')!];
}

/** Face of a character card (name printed in `lang`). */
export function getCardFaceCanvas(character: Character, lang: Lang): HTMLCanvasElement {
  const key = `${character}:${lang}`;
  const hit = faceCache.get(key);
  if (hit) return hit;
  const [c, g] = makeCanvas();
  const col = CHARACTER_COLORS[character];
  g.fillStyle = col.main;
  g.fillRect(0, 0, CARD_W, CARD_H);
  g.fillStyle = PALETTE.cream;
  g.font = 'bold 56px sans-serif';
  g.textAlign = 'center';
  g.fillText(character.toUpperCase(), CARD_W / 2, CARD_H / 2);
  faceCache.set(key, c);
  return c;
}

/** Shared card back. */
export function getCardBackCanvas(): HTMLCanvasElement {
  if (backCanvas) return backCanvas;
  const [c, g] = makeCanvas();
  g.fillStyle = PALETTE.coral;
  g.fillRect(0, 0, CARD_W, CARD_H);
  backCanvas = c;
  return c;
}

/** Data URL of a card face for <img>. */
export function getCardFaceUrl(character: Character, lang: Lang): string {
  const key = `face:${character}:${lang}`;
  let u = urlCache.get(key);
  if (!u) {
    u = getCardFaceCanvas(character, lang).toDataURL('image/png');
    urlCache.set(key, u);
  }
  return u;
}

/** Data URL of the card back for <img>. */
export function getCardBackUrl(): string {
  let u = urlCache.get('back');
  if (!u) {
    u = getCardBackCanvas().toDataURL('image/png');
    urlCache.set('back', u);
  }
  return u;
}

const iconCache = new Map<Character, HTMLCanvasElement>();

/** Round character emblem (128×128) — for chips on action buttons, log lines, bubbles. */
export function getCharacterIconCanvas(character: Character): HTMLCanvasElement {
  const hit = iconCache.get(character);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = CHARACTER_COLORS[character].main;
  g.beginPath();
  g.arc(64, 64, 58, 0, Math.PI * 2);
  g.fill();
  iconCache.set(character, c);
  return c;
}

export function getCharacterIconUrl(character: Character): string {
  const key = `icon:${character}`;
  let u = urlCache.get(key);
  if (!u) {
    u = getCharacterIconCanvas(character).toDataURL('image/png');
    urlCache.set(key, u);
  }
  return u;
}
