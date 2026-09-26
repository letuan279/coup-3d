/**
 * Coup rules engine — pure, deterministic, framework-free.
 *
 * PUBLIC API CONTRACT (used by server, bots, tests). Implementations may live in other files
 * under shared/engine/, but these exports and signatures must stay exactly as declared.
 *
 * All functions are pure: they never mutate their `state` argument (return a new state).
 *
 * Internals: setup.ts (createGame), moves.ts (validation + dispatch), flow.ts (phase machine,
 * docs/SPEC.md §1.1), prompts.ts (prompts, deciders, defaults, legal moves), view.ts (redaction).
 *
 * Event order per declared action: `action` (+ `coins` for the cost) → responses (`pass`,
 * `challenge`/`challenge_result`/`card_replaced`, `block`) → exactly one of `action_resolved`
 * (logged right before the effect: coins / influence loss / exchange draw), `action_blocked` or
 * `action_failed` (logged before the influence loss that goes with it) — unless the game ends
 * first → `turn_start` of the next turn or `game_over`.
 */
import type { GameState, GameView, LoggedEvent, Move, MoveError, PhaseKind, Prompt } from '../types';
import { applyMoveToState } from './moves';
import { defaultMove, deciders, getPromptFor, legalMoves, timerKind } from './prompts';
import { createGameState } from './setup';
import { buildView } from './view';

export interface NewGamePlayer {
  id: string;
  name: string;
  /** Seat index 0..5 (stable; turn order = ascending seat). */
  seat: number;
}

export interface NewGameOptions {
  players: NewGamePlayer[];
  seed: number;
  /** Defaults to a random (seeded) player. */
  firstPlayerId?: string;
}

export type MoveResult =
  | { ok: true; state: GameState; events: LoggedEvent[] }
  | { ok: false; error: MoveError };

/** Shuffle the 15-card court deck, deal 2 cards each, give coins (2 each; 1 for the first player in a 2-player game), start turn 1. */
export function createGame(opts: NewGameOptions): GameState {
  return createGameState(opts);
}

/**
 * Apply `move` by `playerId`. Returns the new state and the events it produced (already
 * appended to state.log). `opts.auto` marks a server-applied timeout default: the engine logs
 * a `timeout` event before the move's own events.
 */
export function applyMove(state: GameState, playerId: string, move: Move, opts?: { auto?: boolean }): MoveResult {
  return applyMoveToState(state, playerId, move, opts);
}

/** The decision `playerId` must/may make right now, or null. */
export function getPrompt(state: GameState, playerId: string): Prompt | null {
  return getPromptFor(state, playerId);
}

/** Ids of all players who currently have a non-null prompt (for response windows: responders who have not passed yet). */
export function getDeciders(state: GameState): string[] {
  return deciders(state);
}

/**
 * Move applied when `playerId`'s timer runs out: turn → income (or a coup on the first legal
 * target when forced), responses → pass, lose_influence → random unrevealed slot (seeded),
 * exchange → keep current cards. null if the player has no decision.
 */
export function getDefaultMove(state: GameState, playerId: string): Move | null {
  return defaultMove(state, playerId);
}

/**
 * Redacted view for `viewerId` (null = spectator). Never leaks hidden characters of other
 * players, deck order, card ids, or another player's exchange draw. `deadline`,
 * `phaseDurationMs` are null and `serverNow` is 0 — the server fills them in.
 * `logLimit` keeps only the most recent N log entries (default: all).
 */
export function toView(state: GameState, viewerId: string | null, opts?: { logLimit?: number }): GameView {
  return buildView(state, viewerId, opts);
}

/** Which timer applies to the current phase (server maps it to a duration). null = no timer (game over). */
export function phaseTimer(state: GameState): 'turn' | 'response' | 'lose_influence' | 'exchange' | null {
  return timerKind(state);
}

// ───────────── Extra helpers (not part of the original contract) ─────────────

/**
 * Every legal move for `playerId` right now: each target of each enabled action, pass /
 * challenge / each allowed block character, each revealable slot, and every exchange
 * keep-combination (ascending indexes). Empty when the player has no decision.
 */
export function listLegalMoves(state: GameState, playerId: string): Move[] {
  return legalMoves(state, playerId);
}

export function isGameOver(state: GameState): boolean {
  return state.phase.kind === 'game_over';
}

export type { PhaseKind };
