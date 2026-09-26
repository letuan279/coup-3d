/**
 * Canvas-drawn card art, shared by the 3D scene (CanvasTexture) and the 2D HUD (<img src>).
 * CONTRACT FILE: keeps the exported names/signatures. Everything is drawn once and cached per
 * (character, lang); drawing lives in cardFace.ts / cardBack.ts / icons.ts.
 */
import type { Character } from '@shared/types';
import type { Lang } from '../store/useGame';
import { makeCanvas } from './draw';
import { drawCardFace, FACE_H, FACE_W } from './cardFace';
import { drawCardBack } from './cardBack';
import { drawEmblem, ICON_SIZE } from './icons';

export { CARD_RADIUS } from './cardFace';

/** Card face aspect: 5:7. Canvas size used for textures. */
export const CARD_W = FACE_W;
export const CARD_H = FACE_H;

const faceCache = new Map<string, HTMLCanvasElement>();
let backCanvas: HTMLCanvasElement | null = null;
const iconCache = new Map<Character, HTMLCanvasElement>();
const urlCache = new Map<string, string>();

function cachedUrl(key: string, canvas: () => HTMLCanvasElement): string {
  let u = urlCache.get(key);
  if (!u) {
    u = canvas().toDataURL('image/png');
    urlCache.set(key, u);
  }
  return u;
}

/** Face of a character card (name and ability printed in `lang`). */
export function getCardFaceCanvas(character: Character, lang: Lang): HTMLCanvasElement {
  const key = `${character}:${lang}`;
  const hit = faceCache.get(key);
  if (hit) return hit;
  const [c, g] = makeCanvas(CARD_W, CARD_H);
  drawCardFace(g, character, lang);
  faceCache.set(key, c);
  return c;
}

/** Shared card back. */
export function getCardBackCanvas(): HTMLCanvasElement {
  if (backCanvas) return backCanvas;
  const [c, g] = makeCanvas(CARD_W, CARD_H);
  drawCardBack(g);
  backCanvas = c;
  return c;
}

/** Data URL of a card face for <img>. */
export function getCardFaceUrl(character: Character, lang: Lang): string {
  return cachedUrl(`face:${character}:${lang}`, () => getCardFaceCanvas(character, lang));
}

/** Data URL of the card back for <img>. */
export function getCardBackUrl(): string {
  return cachedUrl('back', getCardBackCanvas);
}

/** Round character emblem (128×128) — for chips on action buttons, log lines, bubbles. */
export function getCharacterIconCanvas(character: Character): HTMLCanvasElement {
  const hit = iconCache.get(character);
  if (hit) return hit;
  const [c, g] = makeCanvas(ICON_SIZE, ICON_SIZE);
  drawEmblem(g, character, ICON_SIZE / 2, ICON_SIZE / 2, 57);
  iconCache.set(character, c);
  return c;
}

export function getCharacterIconUrl(character: Character): string {
  return cachedUrl(`icon:${character}`, () => getCharacterIconCanvas(character));
}
