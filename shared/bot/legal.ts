/**
 * Legality check and a guaranteed-legal fallback, so the bot can never send a bad move.
 */
import { ACTIONS } from '../constants';
import type { Move, Prompt } from '../types';

export function isLegalMove(prompt: Prompt, move: Move): boolean {
  switch (prompt.kind) {
    case 'choose_action': {
      if (move.type !== 'action') return false;
      if (prompt.mustCoup && move.action !== 'coup') return false;
      const option = prompt.options.find((o) => o.action === move.action);
      if (!option || !option.enabled) return false;
      if (ACTIONS[move.action].needsTarget) return !!move.targetId && option.targets.includes(move.targetId);
      return move.targetId === undefined;
    }
    case 'respond_action':
      if (move.type === 'pass') return true;
      if (move.type === 'challenge') return prompt.canChallenge;
      if (move.type === 'block') return prompt.blockCharacters.includes(move.character);
      return false;
    case 'respond_block':
      return move.type === 'pass' || move.type === 'challenge';
    case 'lose_influence':
      return move.type === 'reveal' && prompt.slots.includes(move.slot);
    case 'exchange': {
      if (move.type !== 'exchange' || move.keep.length !== prompt.keepCount) return false;
      const seen = new Set<number>();
      for (const i of move.keep) {
        if (!Number.isInteger(i) || i < 0 || i >= prompt.cards.length || seen.has(i)) return false;
        seen.add(i);
      }
      return true;
    }
  }
}

/** The engine's timeout defaults: always legal for a well-formed prompt. */
export function fallbackMove(prompt: Prompt | null): Move {
  if (!prompt) return { type: 'pass' };
  switch (prompt.kind) {
    case 'choose_action': {
      const coup = prompt.options.find((o) => o.action === 'coup' && o.enabled && o.targets.length > 0);
      if (prompt.mustCoup && coup) return { type: 'action', action: 'coup', targetId: coup.targets[0] };
      const income = prompt.options.find((o) => o.action === 'income' && o.enabled);
      if (income || !prompt.options.some((o) => o.enabled)) return { type: 'action', action: 'income' };
      const first = prompt.options.find((o) => o.enabled && (!ACTIONS[o.action].needsTarget || o.targets.length > 0));
      if (!first) return { type: 'action', action: 'income' };
      return ACTIONS[first.action].needsTarget
        ? { type: 'action', action: first.action, targetId: first.targets[0] }
        : { type: 'action', action: first.action };
    }
    case 'respond_action':
    case 'respond_block':
      return { type: 'pass' };
    case 'lose_influence':
      return { type: 'reveal', slot: prompt.slots[0] ?? 0 };
    case 'exchange':
      return { type: 'exchange', keep: Array.from({ length: prompt.keepCount }, (_, i) => i) };
  }
}
