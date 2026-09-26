/**
 * Global client store (zustand). CONTRACT FILE shared by the UI (client/src/ui) and the 3D
 * scene (client/src/scene).
 *
 * Rules of thumb:
 * - Server data (`room`, `game`) is only written by net/socket.ts.
 * - Components subscribe with narrow selectors: `useGame(s => s.game?.phase)`.
 * - Inside R3F `useFrame`, read with `useGame.getState()` — never subscribe per frame.
 */
import { create } from 'zustand';
import type { ActionType, AvatarId, GameView, RoomView } from '@shared/types';
import { AVATARS } from '@shared/types';

export type ConnStatus = 'connecting' | 'connected' | 'reconnecting';
export type Lang = 'vi' | 'en';
export type ToastTone = 'info' | 'error' | 'success';

export interface Toast {
  id: number;
  text: string;
  tone: ToastTone;
}

export interface Profile {
  name: string;
  avatar: AvatarId;
}

export interface UIState {
  lang: Lang;
  muted: boolean;
  /** A targeted action (coup / assassinate / steal) the local player picked and is choosing a target for. */
  targeting: ActionType | null;
  /** Player id under the mouse in the 3D scene (or hovered in the HUD) — used for highlights. */
  hoverPlayerId: string | null;
  showRules: boolean;
  showLog: boolean;
  toasts: Toast[];
}

export interface GameStore {
  conn: ConnStatus;
  room: RoomView | null;
  game: GameView | null;
  /** serverNow - Date.now() measured at the last game:state. Use `serverNow()` below. */
  clockOffset: number;
  profile: Profile;
  ui: UIState;

  // ── UI actions (local only) ──
  setLang(lang: Lang): void;
  toggleMute(): void;
  setShowRules(v: boolean): void;
  setShowLog(v: boolean): void;
  setHoverPlayer(id: string | null): void;
  /** Start choosing a target for a targeted action. */
  beginTargeting(action: ActionType): void;
  cancelTargeting(): void;
  toast(text: string, tone?: ToastTone): void;
  dismissToast(id: number): void;
  setProfile(p: Partial<Profile>): void;
}

const LS_PREFS = 'coup3d.prefs';
const LS_PROFILE = 'coup3d.profile';

function readJSON<T>(key: string): Partial<T> {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as Partial<T>) : {};
  } catch {
    return {};
  }
}

function writeJSON(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable — ignore */
  }
}

const prefs = readJSON<{ lang: Lang; muted: boolean }>(LS_PREFS);
const savedProfile = readJSON<Profile>(LS_PROFILE);

let toastSeq = 1;

export const useGame = create<GameStore>((set, get) => ({
  conn: 'connecting',
  room: null,
  game: null,
  clockOffset: 0,
  profile: {
    name: typeof savedProfile.name === 'string' ? savedProfile.name : '',
    avatar:
      savedProfile.avatar && AVATARS.includes(savedProfile.avatar)
        ? savedProfile.avatar
        : AVATARS[Math.floor(Math.random() * AVATARS.length)],
  },
  ui: {
    lang: prefs.lang === 'en' ? 'en' : 'vi',
    muted: prefs.muted === true,
    targeting: null,
    hoverPlayerId: null,
    showRules: false,
    showLog: true,
    toasts: [],
  },

  setLang(lang) {
    set((s) => ({ ui: { ...s.ui, lang } }));
    writeJSON(LS_PREFS, { lang, muted: get().ui.muted });
  },
  toggleMute() {
    const muted = !get().ui.muted;
    set((s) => ({ ui: { ...s.ui, muted } }));
    writeJSON(LS_PREFS, { lang: get().ui.lang, muted });
  },
  setShowRules(v) {
    set((s) => ({ ui: { ...s.ui, showRules: v } }));
  },
  setShowLog(v) {
    set((s) => ({ ui: { ...s.ui, showLog: v } }));
  },
  setHoverPlayer(id) {
    if (get().ui.hoverPlayerId === id) return;
    set((s) => ({ ui: { ...s.ui, hoverPlayerId: id } }));
  },
  beginTargeting(action) {
    set((s) => ({ ui: { ...s.ui, targeting: action } }));
  },
  cancelTargeting() {
    if (get().ui.targeting === null) return;
    set((s) => ({ ui: { ...s.ui, targeting: null } }));
  },
  toast(text, tone = 'info') {
    const id = toastSeq++;
    set((s) => ({ ui: { ...s.ui, toasts: [...s.ui.toasts.slice(-3), { id, text, tone }] } }));
    setTimeout(() => get().dismissToast(id), 4000);
  },
  dismissToast(id) {
    set((s) => ({ ui: { ...s.ui, toasts: s.ui.toasts.filter((t) => t.id !== id) } }));
  },
  setProfile(p) {
    const profile = { ...get().profile, ...p };
    set({ profile });
    writeJSON(LS_PROFILE, profile);
  },
}));

/** Current server time estimate (ms). */
export function serverNow(): number {
  return Date.now() + useGame.getState().clockOffset;
}

/** Remaining ms on the current phase timer (0 if none/expired). */
export function timeLeftMs(): number {
  const g = useGame.getState().game;
  if (!g || g.deadline == null) return 0;
  return Math.max(0, g.deadline - serverNow());
}

/** The local player's id in the current room (null when not in a room). */
export function selfId(): string | null {
  return useGame.getState().room?.youId ?? null;
}
