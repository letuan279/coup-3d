/**
 * Bot driving helpers: when a bot acts (think delay inside the phase window) and what it
 * plays (the shared bot AI, with the engine's timeout default as a safety net).
 */
import { decideBotMove, type BotContext } from '@shared/bot';
import { applyMove, getDefaultMove, toView, type MoveResult } from '@shared/engine';
import type { BotLevel, GameState, GameView, Move } from '@shared/types';
import type { ServerTiming } from '../timing';

export type DecideBot = (view: GameView, ctx: BotContext) => Move;

export const defaultDecideBot: DecideBot = decideBotMove;

export interface ThinkDelayInput {
  level: BotLevel;
  now: number;
  phaseStartedAt: number;
  /** null = no deadline (should not happen while a decision is pending). */
  deadline: number | null;
  timing: ServerTiming;
  rand: () => number;
}

/**
 * Random think time from `botThinkMs[level]`, but never before `minPhaseSettleMs` after the
 * phase began and never later than `botDeadlineMarginMs` before the deadline.
 */
export function botThinkDelay(i: ThinkDelayInput): number {
  const [lo, hi] = i.timing.botThinkMs[i.level];
  let delay = lo + i.rand() * Math.max(0, hi - lo);
  const settle = i.phaseStartedAt + i.timing.minPhaseSettleMs - i.now;
  delay = Math.max(delay, settle);
  if (i.deadline !== null) delay = Math.min(delay, i.deadline - i.timing.botDeadlineMarginMs - i.now);
  return Math.max(0, Math.round(delay));
}

/**
 * Let the bot in `playerId`'s seat decide and apply its move: the AI's choice when the engine
 * accepts it, else the timeout default (an AI error never stalls the game). null only when the
 * player has no decision right now.
 */
export function playBotMove(
  state: GameState,
  playerId: string,
  ctx: BotContext,
  decide: DecideBot = defaultDecideBot,
): Extract<MoveResult, { ok: true }> | null {
  let move: Move | null = null;
  try {
    move = decide(toView(state, playerId), ctx);
  } catch {
    move = null;
  }
  if (move) {
    const res = applyMove(state, playerId, move);
    if (res.ok) return res;
  }
  const fallback = getDefaultMove(state, playerId);
  if (!fallback) return null;
  const res = applyMove(state, playerId, fallback);
  return res.ok ? res : null;
}
