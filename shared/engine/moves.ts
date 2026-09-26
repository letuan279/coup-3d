/** Move validation (→ MoveError) and dispatch into the phase machine. */
import { ACTIONS, MUST_COUP_COINS } from '../constants';
import { ACTION_TYPES } from '../types';
import type { ActionType, GameState, Move, MoveError, PlayerState, Prompt } from '../types';
import {
  challengeAction,
  challengeBlock,
  completeExchange,
  completeLoss,
  declareAction,
  declareBlock,
  passResponse,
} from './flow';
import type { MoveResult } from './index';
import { getPromptFor } from './prompts';
import { cloneState, emit, findPlayer } from './state';

const MOVE_TYPES: ReadonlySet<string> = new Set(['action', 'pass', 'challenge', 'block', 'reveal', 'exchange']);

function isMove(move: unknown): move is Move {
  if (typeof move !== 'object' || move === null) return false;
  const type = (move as { type?: unknown }).type;
  return typeof type === 'string' && MOVE_TYPES.has(type);
}

function isActionType(value: unknown): value is ActionType {
  return typeof value === 'string' && (ACTION_TYPES as readonly string[]).includes(value);
}

function validateAction(s: GameState, actor: PlayerState, move: Extract<Move, { type: 'action' }>): MoveError | null {
  if (!isActionType(move.action)) return 'invalid_move';
  const def = ACTIONS[move.action];
  if (actor.coins >= MUST_COUP_COINS && move.action !== 'coup') return 'must_coup';
  if (actor.coins < def.cost) return 'not_enough_coins';
  const targetId: unknown = move.targetId;
  const hasTarget = targetId !== undefined && targetId !== null;
  if (!def.needsTarget) return hasTarget ? 'invalid_target' : null;
  if (typeof targetId !== 'string' || targetId === actor.id) return 'invalid_target';
  const target = findPlayer(s, targetId);
  return target && !target.eliminated ? null : 'invalid_target';
}

function validateExchange(prompt: Extract<Prompt, { kind: 'exchange' }>, keep: unknown): MoveError | null {
  if (!Array.isArray(keep) || keep.length !== prompt.keepCount) return 'invalid_move';
  const seen = new Set<number>();
  for (const index of keep) {
    if (!Number.isInteger(index) || index < 0 || index >= prompt.cards.length || seen.has(index)) return 'invalid_move';
    seen.add(index);
  }
  return null;
}

export function validateMove(s: GameState, playerId: string, move: Move): MoveError | null {
  if (s.phase.kind === 'game_over') return 'game_over';
  const player = findPlayer(s, playerId);
  if (!player) return 'unknown_player';
  const prompt = getPromptFor(s, playerId);
  if (!prompt) return 'not_your_decision';
  if (!isMove(move)) return 'invalid_move';

  switch (prompt.kind) {
    case 'choose_action':
      return move.type === 'action' ? validateAction(s, player, move) : 'invalid_move';
    case 'respond_action':
      if (move.type === 'pass') return null;
      if (move.type === 'challenge') return prompt.canChallenge ? null : 'invalid_move';
      if (move.type === 'block') return prompt.blockCharacters.includes(move.character) ? null : 'invalid_move';
      return 'invalid_move';
    case 'respond_block':
      return move.type === 'pass' || move.type === 'challenge' ? null : 'invalid_move';
    case 'lose_influence':
      return move.type === 'reveal' && Number.isInteger(move.slot) && prompt.slots.includes(move.slot)
        ? null
        : 'invalid_move';
    case 'exchange':
      return move.type === 'exchange' ? validateExchange(prompt, move.keep) : 'invalid_move';
  }
}

/** Apply an already validated move to the private clone `s`. */
function dispatch(s: GameState, playerId: string, move: Move): void {
  switch (move.type) {
    case 'action':
      declareAction(s, playerId, move.action, move.targetId ?? undefined);
      return;
    case 'pass':
      passResponse(s, playerId);
      return;
    case 'challenge':
      if (s.phase.kind === 'block_response') challengeBlock(s, playerId);
      else challengeAction(s, playerId);
      return;
    case 'block':
      declareBlock(s, playerId, move.character);
      return;
    case 'reveal':
      completeLoss(s, move.slot);
      return;
    case 'exchange':
      completeExchange(s, move.keep);
      return;
  }
}

export function applyMoveToState(
  state: GameState,
  playerId: string,
  move: Move,
  opts?: { auto?: boolean },
): MoveResult {
  const error = validateMove(state, playerId, move);
  if (error) return { ok: false, error };
  const s = cloneState(state);
  const firstNew = s.log.length;
  if (opts?.auto) emit(s, { type: 'timeout', playerId, phase: s.phase.kind });
  dispatch(s, playerId, move);
  return { ok: true, state: s, events: s.log.slice(firstNew) };
}
