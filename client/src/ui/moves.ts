/**
 * Sends moves through `api.move`, blocking further input while one is in flight. Rejections are
 * surfaced by the bus 'moveRejected' listener (see useMoveFeedback).
 */
import { ACTIONS } from '@shared/constants';
import type { ActionOption, ActionType, Character, Move } from '@shared/types';
import { api } from '../net/socket';
import { useGame } from '../store/useGame';
import { useHud } from './hudStore';

export async function sendMove(move: Move): Promise<boolean> {
  if (useHud.getState().moveInFlight) return false;
  useHud.setState({ moveInFlight: true });
  try {
    const res = await api.move(move);
    return res.ok;
  } finally {
    useHud.setState({ moveInFlight: false });
  }
}

/** Action-bar click / hotkey: targeted actions enter targeting mode, others are sent. */
export function pickAction(opt: ActionOption): void {
  if (!opt.enabled || useHud.getState().moveInFlight) return;
  if (ACTIONS[opt.action].needsTarget) {
    useGame.getState().beginTargeting(opt.action);
    return;
  }
  void sendMove({ type: 'action', action: opt.action });
}

export function pickTarget(action: ActionType, targetId: string): void {
  if (useHud.getState().moveInFlight) return;
  useGame.getState().cancelTargeting();
  void sendMove({ type: 'action', action, targetId });
}

export const respond = {
  pass: () => void sendMove({ type: 'pass' }),
  challenge: () => void sendMove({ type: 'challenge' }),
  block: (character: Character) => void sendMove({ type: 'block', character }),
};
