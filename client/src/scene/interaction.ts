/**
 * Pointer interaction with seats (targeting + hover highlight), shared by characters, cards
 * and nameplates.
 */
import { useSyncExternalStore } from 'react';
import { useGame } from '../store/useGame';
import { useHud } from '../ui/hudStore';
import { isMoveLocked, pickTarget } from '../ui/moves';
import { targetIds } from './sceneModel';

/** Valid targets right now — none while a move is on its way (same lock as the HUD's). */
function currentTargets(): string[] {
  if (isMoveLocked()) return [];
  const s = useGame.getState();
  return targetIds(s.game, s.ui.targeting);
}

export function isTargetable(playerId: string): boolean {
  return currentTargets().includes(playerId);
}

/** Commits the pending targeted action against `playerId` (no-op if it is not a valid target). */
export function chooseTarget(playerId: string): void {
  const action = useGame.getState().ui.targeting;
  if (!action || !isTargetable(playerId)) return;
  // Same path as the HUD's target buttons: in-flight lock, targeting ends, rejection feedback.
  pickTarget(action, playerId);
  setCursor(null);
}

/** The part of R3F's ThreeEvent the seat handlers use. */
interface StoppableEvent {
  stopPropagation(): void;
}

export interface SeatPointerHandlers {
  onClick(e: StoppableEvent): void;
  onPointerOver(e: StoppableEvent): void;
  onPointerOut(): void;
}

/**
 * Pointer handlers of a seat's pickable meshes: the character's hit box and, in a game, the
 * opponent's cards. Hover and click both stop at the first mesh hit, targetable or not: R3F
 * hands a click on to whatever lies behind until a handler stops it, so a mesh that highlights
 * its seat on hover must also swallow the click — else an eliminated player's standing card
 * would pass it to the neighbour's hit box behind (SCN-1). chooseTarget ignores non-targets.
 */
export function seatPointerHandlers(playerId: string): SeatPointerHandlers {
  return {
    onClick(e) {
      e.stopPropagation();
      chooseTarget(playerId);
    },
    onPointerOver(e) {
      e.stopPropagation();
      hoverEnter(playerId);
    },
    onPointerOut() {
      hoverLeave(playerId);
    },
  };
}

let cursorEl: HTMLElement | null = null;
/** The seat currently under the pointer in the 3D view (character, card or nameplate). */
let pointerOver: string | null = null;

export function registerCursorElement(el: HTMLElement | null): void {
  cursorEl = el;
}

export function setCursor(kind: 'pointer' | null): void {
  if (cursorEl) cursorEl.style.cursor = kind ?? '';
}

export function hoverEnter(playerId: string): void {
  pointerOver = playerId;
  useGame.getState().setHoverPlayer(playerId);
  setCursor(isTargetable(playerId) ? 'pointer' : null);
}

export function hoverLeave(playerId: string): void {
  if (pointerOver === playerId) pointerOver = null;
  const s = useGame.getState();
  if (s.ui.hoverPlayerId === playerId) s.setHoverPlayer(null);
  setCursor(null);
}

/**
 * Called whenever the set of valid targets changes (targeting starts/ends, a move goes out, a
 * new state arrives). Brings the pointer cursor in line with what is under the pointer, and —
 * once targeting is over — drops a hover highlight that no pointer is on any more: the HUD's
 * target buttons set it too, and they can unmount (Esc, hotkey, timeout) without a mouseleave.
 */
export function syncTargeting(): void {
  const targets = currentTargets();
  setCursor(pointerOver && targets.includes(pointerOver) ? 'pointer' : null);
  const s = useGame.getState();
  if (!s.ui.targeting && s.ui.hoverPlayerId && s.ui.hoverPlayerId !== pointerOver) s.setHoverPlayer(null);
}

/** Forget the pointer (new game / mode change: seats and handlers go away without pointer-out). */
export function resetPointer(): void {
  pointerOver = null;
  setCursor(null);
  useGame.getState().setHoverPlayer(null);
}

function subscribeMoveLock(onChange: () => void): () => void {
  const offHud = useHud.subscribe(onChange);
  const offGame = useGame.subscribe(onChange);
  return () => {
    offHud();
    offGame();
  };
}

/** The HUD's in-flight move lock (re-renders only when it flips). */
function useMoveLocked(): boolean {
  return useSyncExternalStore(subscribeMoveLock, isMoveLocked, isMoveLocked);
}

/** Comma-joined valid target ids (a stable string for React selectors). */
export function useTargetKey(): string {
  const locked = useMoveLocked();
  const key = useGame((s) => targetIds(s.game, s.ui.targeting).join(','));
  return locked ? '' : key;
}

/** Narrow store selector: is this seat a valid target right now? */
export function useTargetable(playerId: string): boolean {
  const locked = useMoveLocked();
  const targetable = useGame((s) => targetIds(s.game, s.ui.targeting).includes(playerId));
  return targetable && !locked;
}

export function useHovered(playerId: string): boolean {
  return useGame((s) => s.ui.hoverPlayerId === playerId);
}
