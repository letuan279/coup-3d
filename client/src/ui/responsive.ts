/**
 * Screen-size modes shared by the HUD (CSS via data attributes on .ui-root) and the 3D camera
 * framing (scene/framing.ts), so the camera always frames the part of the screen the HUD
 * actually leaves free.
 *
 * Game HUD:
 *  - desktop: the fixed zones at their design size (docs/SPEC.md §4.1);
 *  - scaled: same zones shrunk uniformly (small laptops, tablets);
 *  - short: phones held sideways — a flatter dock (smaller cards and buttons) so the zones
 *    need less shrinking and text stays readable;
 *  - portrait: narrow + tall (phones held upright): stacked layout — top bar, full-width phase
 *    banner, the table, then a full-width dock (hand row + command area).
 * The log is a drawer over the table (closed by default) when there is no room beside it.
 *
 * Lobby: desktop (panels either side of the table), side (one scrolling column on the right,
 * table on the left) or portrait (table strip on top, scrolling column below).
 */
import { useEffect } from 'react';

export type HudMode = 'desktop' | 'scaled' | 'short' | 'portrait';
export type LobbyMode = 'desktop' | 'side' | 'portrait';

export interface HudLayout {
  mode: HudMode;
  /** Uniform scale of the fixed HUD zones (1 in desktop / portrait). */
  scale: number;
  /** The game log opens as a drawer over the table instead of a panel beside it. */
  logOverlay: boolean;
}

/** Smallest screen the desktop HUD fits at full size. */
export const DESKTOP_MIN_W = 1100;
export const DESKTOP_MIN_H = 680;
/** Portrait layout: at most this wide (phones and tablets held upright) and clearly taller than wide. */
export const PORTRAIT_MAX_W = 900;
/** Below this height the log panel no longer fits beside the table. */
export const LOG_PANEL_MIN_H = 560;
/** At most this tall (and not portrait): the flat `short` layout. */
export const SHORT_MAX_H = 520;
/** Design size the `short` layout needs at scale 1. */
export const SHORT_DESIGN_W = 900;
export const SHORT_DESIGN_H = 470;
/** Dock height (design px) in the `short` layout — keep in sync with the CSS. */
export const SHORT_DOCK_H = 150;
const MIN_SCALE = 0.5;

/** Portrait-mode HUD metrics (px) — keep in sync with the `[data-hud='portrait']` CSS. */
export const PORTRAIT_HUD = {
  /** Top bar + phase banner. */
  top: 138,
  /** Dock height (hand row + command area), bottom gap included. */
  dock: 292,
} as const;

/** Lobby side column width (px) — keep in sync with `[data-lobby='side']` CSS. */
export const LOBBY_SIDE_W = 420;
/** Lobby portrait: height of the see-through strip showing the table, as a fraction of the screen. */
export const LOBBY_PORTRAIT_STRIP = 0.32;

export function isPortrait(width: number, height: number): boolean {
  return width <= PORTRAIT_MAX_W && height >= width * 1.15;
}

export function hudLayout(width: number, height: number): HudLayout {
  if (isPortrait(width, height)) return { mode: 'portrait', scale: 1, logOverlay: true };
  if (height <= SHORT_MAX_H) {
    const s = Math.min(1, (width - 16) / SHORT_DESIGN_W, height / SHORT_DESIGN_H);
    return { mode: 'short', scale: Math.max(MIN_SCALE, Math.floor(s * 100) / 100), logOverlay: true };
  }
  const s = Math.min(1, width / DESKTOP_MIN_W, height / DESKTOP_MIN_H);
  if (s >= 0.995) return { mode: 'desktop', scale: 1, logOverlay: false };
  // A screen taller than wide has no width to spare beside the table.
  return { mode: 'scaled', scale: Math.max(MIN_SCALE, Math.floor(s * 100) / 100), logOverlay: height < LOG_PANEL_MIN_H || width < height };
}

export function lobbyLayout(width: number, height: number): LobbyMode {
  if (isPortrait(width, height)) return 'portrait';
  return width >= 1180 && height >= 600 ? 'desktop' : 'side';
}

/** Current window size (the canvas and the HUD both fill the window). */
function viewport(): { width: number; height: number } {
  return { width: window.innerWidth, height: window.innerHeight };
}

/** Whether the log should start closed on this screen (it would cover the table). */
export function logStartsClosed(): boolean {
  if (typeof window === 'undefined') return false;
  const { width, height } = viewport();
  return hudLayout(width, height).logOverlay;
}

/**
 * Mirrors the layout modes onto <html> as `data-hud` / `data-lobby` / `data-log` and the
 * `--hud-scale` custom property, so the stylesheets (HUD and in-world labels alike) can switch
 * layouts without JS re-renders.
 */
export function useResponsiveAttributes(): void {
  useEffect(() => {
    const el = document.documentElement;
    const apply = () => {
      const { width, height } = viewport();
      const hud = hudLayout(width, height);
      el.dataset.hud = hud.mode;
      el.dataset.lobby = lobbyLayout(width, height);
      el.dataset.log = hud.logOverlay ? 'overlay' : 'panel';
      el.style.setProperty('--hud-scale', String(hud.scale));
    };
    apply();
    window.addEventListener('resize', apply);
    window.addEventListener('orientationchange', apply);
    return () => {
      window.removeEventListener('resize', apply);
      window.removeEventListener('orientationchange', apply);
    };
  }, []);
}

/** Touch-first device (no hover): keyboard hints are pointless there. */
export function isTouchOnly(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(hover: none)').matches;
}
