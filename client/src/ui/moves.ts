/**
 * Sends moves through `api.move`, blocking further input while one is in flight. Rejections are
 * surfaced by the bus 'moveRejected' listener (see useMoveFeedback).
 *
 * Every input path (action bar, hotkeys, HUD target buttons, 3D target clicks) goes through these
 * functions so they share the in-flight lock.
 */
import { ACTIONS } from '@shared/constants';
import type { ActionOption, ActionType, Character, InfluenceView, Move } from '@shared/types';
import { api } from '../net/socket';
import { useGame } from '../store/useGame';
import { useHud } from './hudStore';

/** Bumped per send so a late-settling older move never clears a newer move's lock. */
let sendToken = 0;

/** True while a move for the CURRENT phase awaits its ack. */
export function isMoveLocked(): boolean {
  const h = useHud.getState();
  return h.moveInFlight && h.moveSeq === (useGame.getState().game?.phaseSeq ?? null);
}

export async function sendMove(move: Move): Promise<boolean> {
  if (isMoveLocked()) return false;
  const token = ++sendToken;
  useHud.setState({ moveInFlight: true, moveSeq: useGame.getState().game?.phaseSeq ?? null });
  try {
    const res = await api.move(move);
    return res.ok;
  } finally {
    if (token === sendToken) useHud.setState({ moveInFlight: false, moveSeq: null });
  }
}

/**
 * A new phase (or a resync to one) means the in-flight move is moot: e.g. its ack was lost in a
 * disconnect. Unlock right away instead of waiting for the ack timeout.
 */
export function releaseStaleMoveLock(): void {
  const h = useHud.getState();
  if (h.moveInFlight && h.moveSeq !== (useGame.getState().game?.phaseSeq ?? null)) {
    useHud.setState({ moveInFlight: false, moveSeq: null });
  }
}

useGame.subscribe((s, prev) => {
  if (s.game !== prev.game) releaseStaleMoveLock();
});

/** Action-bar click / hotkey: targeted actions enter targeting mode, others are sent. */
export function pickAction(opt: ActionOption): void {
  if (!opt.enabled || isMoveLocked()) return;
  if (ACTIONS[opt.action].needsTarget) {
    useGame.getState().beginTargeting(opt.action);
    return;
  }
  void sendMove({ type: 'action', action: opt.action });
}

/** Commit a targeted action (HUD target button, digit key, or a click on a 3D character). */
export function pickTarget(action: ActionType, targetId: string): void {
  if (isMoveLocked()) return;
  if (useGame.getState().game?.prompt?.kind !== 'choose_action') return;
  useGame.getState().cancelTargeting();
  void sendMove({ type: 'action', action, targetId });
}

/**
 * The block character the B hotkey (and its badge) stands for: the first one the player really
 * holds, so a quick B never bluffs by accident when a true block exists; else the first listed.
 */
export function hotkeyBlockCharacter(
  blockCharacters: readonly Character[],
  influences: readonly InfluenceView[] | undefined,
): Character | null {
  if (blockCharacters.length === 0) return null;
  const held = new Set((influences ?? []).filter((i) => !i.revealed).map((i) => i.character));
  return blockCharacters.find((c) => held.has(c)) ?? blockCharacters[0];
}

export const respond = {
  pass: () => void sendMove({ type: 'pass' }),
  challenge: () => void sendMove({ type: 'challenge' }),
  block: (character: Character) => void sendMove({ type: 'block', character }),
};
