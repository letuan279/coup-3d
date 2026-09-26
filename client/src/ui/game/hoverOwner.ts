/**
 * HUD buttons that highlight a player (`ui.hoverPlayerId`) track whether THEY set the highlight, so
 * they can clear it when they unmount (Esc / digit key / phase change fire no mouseleave) without
 * wiping a hover that the 3D scene owns meanwhile.
 */
import { useGame } from '../../store/useGame';

export interface HoverOwner {
  current: boolean;
}

export function claimHover(owner: HoverOwner, playerId: string): void {
  owner.current = true;
  useGame.getState().setHoverPlayer(playerId);
}

/** Clears the highlight only if this owner set it and it still points at `playerId`. */
export function releaseHover(owner: HoverOwner, playerId: string): void {
  if (!owner.current) return;
  owner.current = false;
  const s = useGame.getState();
  if (s.ui.hoverPlayerId === playerId) s.setHoverPlayer(null);
}
