/**
 * Art invalidation. Canvas art is drawn once and cached; anything drawn before the web fonts
 * finished loading keeps a fallback font. `refreshArt()` (called by main.tsx when the fonts
 * arrive late) redraws those canvases IN PLACE — same canvas objects, so materials and
 * textures built on them stay valid — and tells subscribers:
 *  - the 3D scene re-uploads its CanvasTextures (scene/textures.ts);
 *  - HUD components showing data URLs (GameCard, the Home card fan) subscribe with
 *    `useArtVersion()` and re-render with the fresh URLs.
 */
import { useSyncExternalStore } from 'react';
import { redrawCardArt } from './cardArt';

let version = 0;
const listeners = new Set<() => void>();

export function refreshArt(): void {
  redrawCardArt();
  version++;
  for (const fn of [...listeners]) fn();
}

/** Subscribe to art refreshes; returns the unsubscribe function. */
export function onArtRefresh(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** Bumped by every refresh (use as a React key / memo dependency for data-URL images). */
export function artVersion(): number {
  return version;
}

export function useArtVersion(): number {
  return useSyncExternalStore(onArtRefresh, artVersion, artVersion);
}
