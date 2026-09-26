/**
 * Who has to decide what right now: prompts, deciders, timeout defaults and the full list of
 * legal moves (for bots, fuzzing and validation).
 */
import { ACTIONS, MUST_COUP_COINS } from '../constants';
import { rngNext } from '../rng';
import { ACTION_TYPES } from '../types';
import type { ActionOption, Card, GameState, Move, PlayerState, Prompt } from '../types';
import { findPlayer, getPlayer, othersInTurnOrder, unrevealedSlots } from './state';

function actionOptions(s: GameState, actor: PlayerState): ActionOption[] {
  const mustCoup = actor.coins >= MUST_COUP_COINS;
  const others = othersInTurnOrder(s, actor.id);
  return ACTION_TYPES.map((action): ActionOption => {
    const def = ACTIONS[action];
    const option: ActionOption = { action, enabled: false, targets: [], cost: def.cost };
    if (def.claim) option.claim = def.claim;
    if (mustCoup && action !== 'coup') option.disabledReason = 'must_coup';
    else if (actor.coins < def.cost) option.disabledReason = 'not_enough_coins';
    else if (def.needsTarget && others.length === 0) option.disabledReason = 'no_targets';
    else {
      option.enabled = true;
      if (def.needsTarget) option.targets = others.slice();
    }
    return option;
  });
}

/** Actor's unrevealed cards (slot order) followed by the drawn cards — the exchange choice list. */
export function exchangeChoices(s: GameState): { cards: Card[]; keepCount: number } {
  const phase = s.phase;
  if (phase.kind !== 'exchange') return { cards: [], keepCount: 0 };
  const actor = getPlayer(s, s.actorId);
  const slots = unrevealedSlots(actor);
  return { cards: [...slots.map((slot) => actor.influences[slot].card), ...phase.drawn], keepCount: slots.length };
}

export function getPromptFor(s: GameState, playerId: string): Prompt | null {
  const player = findPlayer(s, playerId);
  if (!player || player.eliminated) return null;
  const phase = s.phase;
  switch (phase.kind) {
    case 'turn':
      if (s.actorId !== playerId) return null;
      return {
        kind: 'choose_action',
        options: actionOptions(s, player),
        mustCoup: player.coins >= MUST_COUP_COINS,
      };
    case 'action_response':
      if (!phase.responders.includes(playerId) || phase.passed.includes(playerId)) return null;
      return {
        kind: 'respond_action',
        canChallenge: phase.canChallenge,
        // Once a block is recorded the window only stays open to challenge the action (SPEC §1.1).
        blockCharacters: phase.blockers.includes(playerId) && !s.pendingBlock ? phase.blockCharacters.slice() : [],
      };
    case 'block_response':
      if (!phase.responders.includes(playerId) || phase.passed.includes(playerId)) return null;
      return { kind: 'respond_block' };
    case 'lose_influence':
      if (phase.playerId !== playerId) return null;
      return { kind: 'lose_influence', slots: unrevealedSlots(player), reason: phase.reason };
    case 'exchange': {
      if (s.actorId !== playerId) return null;
      const { cards, keepCount } = exchangeChoices(s);
      return { kind: 'exchange', cards: cards.map((c) => c.character), keepCount };
    }
    case 'game_over':
      return null;
  }
}

export function deciders(s: GameState): string[] {
  const phase = s.phase;
  switch (phase.kind) {
    case 'turn':
    case 'exchange':
      return [s.actorId];
    case 'action_response':
    case 'block_response':
      return phase.responders.filter((id) => !phase.passed.includes(id));
    case 'lose_influence':
      return [phase.playerId];
    case 'game_over':
      return [];
  }
}

export function defaultMove(s: GameState, playerId: string): Move | null {
  const prompt = getPromptFor(s, playerId);
  if (!prompt) return null;
  switch (prompt.kind) {
    case 'choose_action': {
      if (!prompt.mustCoup) return { type: 'action', action: 'income' };
      const coup = prompt.options.find((o) => o.action === 'coup');
      const targetId = coup?.targets[0];
      return targetId ? { type: 'action', action: 'coup', targetId } : { type: 'action', action: 'income' };
    }
    case 'respond_action':
    case 'respond_block':
      return { type: 'pass' };
    case 'lose_influence': {
      // Peek the seeded RNG without advancing it: the choice is reproducible and reveals nothing.
      const [, value] = rngNext(s.rngState);
      return { type: 'reveal', slot: prompt.slots[Math.floor(value * prompt.slots.length)] };
    }
    case 'exchange':
      return { type: 'exchange', keep: Array.from({ length: prompt.keepCount }, (_, i) => i) };
  }
}

/** All k-subsets of 0..n-1, each ascending, in lexicographic order. */
function combinations(n: number, k: number): number[][] {
  const out: number[][] = [];
  const pick = (start: number, acc: number[]): void => {
    if (acc.length === k) {
      out.push(acc.slice());
      return;
    }
    for (let i = start; i <= n - (k - acc.length); i++) {
      acc.push(i);
      pick(i + 1, acc);
      acc.pop();
    }
  };
  pick(0, []);
  return out;
}

export function legalMoves(s: GameState, playerId: string): Move[] {
  const prompt = getPromptFor(s, playerId);
  if (!prompt) return [];
  switch (prompt.kind) {
    case 'choose_action':
      return prompt.options.flatMap((o): Move[] => {
        if (!o.enabled) return [];
        if (!ACTIONS[o.action].needsTarget) return [{ type: 'action', action: o.action }];
        return o.targets.map((targetId): Move => ({ type: 'action', action: o.action, targetId }));
      });
    case 'respond_action':
      return [
        { type: 'pass' },
        ...(prompt.canChallenge ? [{ type: 'challenge' } as const] : []),
        ...prompt.blockCharacters.map((character): Move => ({ type: 'block', character })),
      ];
    case 'respond_block':
      return [{ type: 'pass' }, { type: 'challenge' }];
    case 'lose_influence':
      return prompt.slots.map((slot): Move => ({ type: 'reveal', slot }));
    case 'exchange':
      return combinations(prompt.cards.length, prompt.keepCount).map((keep): Move => ({ type: 'exchange', keep }));
  }
}

export function timerKind(s: GameState): 'turn' | 'response' | 'lose_influence' | 'exchange' | null {
  switch (s.phase.kind) {
    case 'turn':
      return 'turn';
    case 'action_response':
    case 'block_response':
      return 'response';
    case 'lose_influence':
      return 'lose_influence';
    case 'exchange':
      return 'exchange';
    case 'game_over':
      return null;
  }
}
