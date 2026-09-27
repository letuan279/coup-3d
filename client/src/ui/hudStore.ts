/**
 * HUD-local state (menus, in-flight move, shake feedback). Kept out of the shared game store so
 * opening a menu never re-renders the 3D scene's subscribers.
 */
import { create } from 'zustand';

export interface HudState {
  /** A move was sent and has not been acknowledged yet. */
  moveInFlight: boolean;
  /** phaseSeq the in-flight move was sent for (the lock is dropped as soon as the phase changes). */
  moveSeq: number | null;
  menuOpen: boolean;
  emoteOpen: boolean;
  leaveConfirm: boolean;
  /** Host: "end the game and return to the lobby?" confirmation. */
  resetConfirm: boolean;
  /** GameOver overlay minimised to look at the table. */
  overMinimized: boolean;
  /** Bumped on a rejected move; the dock replays its shake animation. */
  shakeSeq: number;
  set(p: Partial<Omit<HudState, 'set'>>): void;
}

export const useHud = create<HudState>((set) => ({
  moveInFlight: false,
  moveSeq: null,
  menuOpen: false,
  emoteOpen: false,
  leaveConfirm: false,
  resetConfirm: false,
  overMinimized: false,
  shakeSeq: 0,
  set(p) {
    set(p);
  },
}));
