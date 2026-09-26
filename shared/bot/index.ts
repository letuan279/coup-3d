/**
 * Bot AI — decides a Move from exactly the information a human in that seat would have.
 *
 * PUBLIC API CONTRACT (used by the server). Implementation may be split across files under
 * shared/bot/, but this export and signature must stay as declared.
 */
import type { BotLevel, GameView, Move } from '../types';
import { fallbackMove, isLegalMove } from './legal';
import { decidePolicyMove } from './policy';

export interface BotContext {
  level: BotLevel;
  /** Random source in [0,1). */
  rand: () => number;
}

/**
 * Decide a move for `view.viewerId` given `view.prompt` (must be non-null). The view contains
 * the full public log (claims, challenges, reveals) so the bot can reason about revealed
 * information. Must always return a move that is legal for the prompt.
 *
 * Never throws: any internal error or illegal result falls back to the timeout default.
 */
export function decideBotMove(view: GameView, ctx: BotContext): Move {
  const prompt = view?.prompt ?? null;
  if (!prompt) return fallbackMove(null);
  try {
    const move = decidePolicyMove(view, prompt, ctx);
    if (isLegalMove(prompt, move)) return move;
  } catch {
    // fall through to the safe default
  }
  try {
    return fallbackMove(prompt);
  } catch {
    return { type: 'pass' };
  }
}
