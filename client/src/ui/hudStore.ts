/**
 * HUD-local state (menus, in-flight move, shake feedback). Kept out of the shared game store so
 * opening a menu never re-renders the 3D scene's subscribers.
 */
import { create } from 'zustand';

export interface HudState {
  /** A move was sent and has not been acknowledged yet. */
  moveInFlight: boolean;
  menuOpen: boolean;
  emoteOpen: boolean;
  leaveConfirm: boolean;
  /** GameOver overlay minimised to look at the table. */
  overMinimized: boolean;
  /** Bumped on a rejected move; the dock replays its shake animation. */
  shakeSeq: number;
  set(p: Partial<Omit<HudState, 'set'>>): void;
}

export const useHud = create<HudState>((set) => ({
  moveInFlight: false,
  menuOpen: false,
  emoteOpen: false,
  leaveConfirm: false,
  overMinimized: false,
  shakeSeq: 0,
  set(p) {
    set(p);
  },
}));
