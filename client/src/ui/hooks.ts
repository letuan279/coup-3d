/**
 * Narrow store selectors shared by HUD components. Selectors only return values that already
 * exist in the store (or primitives) so zustand's equality check keeps re-renders minimal.
 */
import type { AvatarId, LobbyPlayer, PlayerPublic } from '@shared/types';
import { useGame } from '../store/useGame';

export function useSelfId(): string | null {
  return useGame((s) => s.room?.youId ?? null);
}

export function useLang() {
  return useGame((s) => s.ui.lang);
}

/** Public game info for one player (stable reference between unrelated store updates). */
export function useGamePlayer(id: string | null | undefined): PlayerPublic | undefined {
  return useGame((s) => (id ? s.game?.players.find((p) => p.id === id) : undefined));
}

export function useLobbyPlayer(id: string | null | undefined): LobbyPlayer | undefined {
  return useGame((s) => (id ? s.room?.players.find((p) => p.id === id) : undefined));
}

export function useAvatarOf(id: string | null | undefined): AvatarId | undefined {
  return useGame((s) => (id ? s.room?.players.find((p) => p.id === id)?.avatar : undefined));
}

/** The local player's public game state (their own characters are visible). */
export function useMe(): PlayerPublic | undefined {
  return useGame((s) => {
    const g = s.game;
    const id = g?.viewerId ?? s.room?.youId;
    return id ? g?.players.find((p) => p.id === id) : undefined;
  });
}

export function useIsHost(): boolean {
  return useGame((s) => !!s.room && s.room.hostId === s.room.youId);
}
