/**
 * Pointer interaction with seats (targeting + hover highlight), shared by characters, cards
 * and nameplates.
 */
import { useGame } from '../store/useGame';
import { api } from '../net/socket';
import { targetIds } from './sceneModel';

export function isTargetable(playerId: string): boolean {
  const s = useGame.getState();
  return targetIds(s.game, s.ui.targeting).includes(playerId);
}

/** Commits the pending targeted action against `playerId` (no-op if it is not a valid target). */
export function chooseTarget(playerId: string): void {
  const s = useGame.getState();
  const action = s.ui.targeting;
  if (!action || !targetIds(s.game, action).includes(playerId)) return;
  void api.move({ type: 'action', action, targetId: playerId });
  s.cancelTargeting();
  setCursor(null);
}

let cursorEl: HTMLElement | null = null;

export function registerCursorElement(el: HTMLElement | null): void {
  cursorEl = el;
}

export function setCursor(kind: 'pointer' | null): void {
  if (cursorEl) cursorEl.style.cursor = kind ?? '';
}

export function hoverEnter(playerId: string): void {
  useGame.getState().setHoverPlayer(playerId);
  setCursor(isTargetable(playerId) ? 'pointer' : null);
}

export function hoverLeave(playerId: string): void {
  const s = useGame.getState();
  if (s.ui.hoverPlayerId === playerId) s.setHoverPlayer(null);
  setCursor(null);
}

/** Narrow store selector: is this seat a valid target right now? */
export function useTargetable(playerId: string): boolean {
  return useGame((s) => targetIds(s.game, s.ui.targeting).includes(playerId));
}

export function useHovered(playerId: string): boolean {
  return useGame((s) => s.ui.hoverPlayerId === playerId);
}
