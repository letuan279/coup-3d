/**
 * Dispatches a prompt to the matching decision module. May throw on malformed input —
 * `decideBotMove` wraps it with a legality check and a safe fallback.
 */
import type { GameView, Move, Prompt } from '../types';
import type { BotContext } from './index';
import { chooseAction } from './action';
import { chooseExchange, chooseReveal } from './cards';
import { respondToAction, respondToBlock } from './respond';
import { buildSituation } from './situation';

export function decidePolicyMove(view: GameView, prompt: Prompt, ctx: BotContext): Move {
  const S = buildSituation(view, prompt, ctx);
  switch (prompt.kind) {
    case 'choose_action':
      return chooseAction(S, prompt);
    case 'respond_action':
      return respondToAction(S, prompt);
    case 'respond_block':
      return respondToBlock(S);
    case 'lose_influence':
      return chooseReveal(S, prompt);
    case 'exchange':
      return chooseExchange(S, prompt);
  }
}
