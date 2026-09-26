/**
 * Coup rules engine — pure, deterministic, framework-free.
 *
 * PUBLIC API CONTRACT (used by server, bots, tests). Implementations may live in other files
 * under shared/engine/, but these exports and signatures must stay exactly as declared.
 *
 * All functions are pure: they never mutate their `state` argument (return a new state).
 */
import type { GameState, GameView, LoggedEvent, Move, MoveError, PhaseKind, Prompt } from '../types';

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
  throw new Error('not implemented');
}

/**
 * Apply `move` by `playerId`. Returns the new state and the events it produced (already
 * appended to state.log). `opts.auto` marks a server-applied timeout default: the engine logs
 * a `timeout` event before the move's own events.
 */
export function applyMove(state: GameState, playerId: string, move: Move, opts?: { auto?: boolean }): MoveResult {
  throw new Error('not implemented');
}

/** The decision `playerId` must/may make right now, or null. */
export function getPrompt(state: GameState, playerId: string): Prompt | null {
  throw new Error('not implemented');
}

/** Ids of all players who currently have a non-null prompt (for response windows: responders who have not passed yet). */
export function getDeciders(state: GameState): string[] {
  throw new Error('not implemented');
}

/**
 * Move applied when `playerId`'s timer runs out: turn → income (or a coup on the first legal
 * target when forced), responses → pass, lose_influence → random unrevealed slot (seeded),
 * exchange → keep current cards. null if the player has no decision.
 */
export function getDefaultMove(state: GameState, playerId: string): Move | null {
  throw new Error('not implemented');
}

/**
 * Redacted view for `viewerId` (null = spectator). Never leaks hidden characters of other
 * players, deck order, card ids, or another player's exchange draw. `deadline`,
 * `phaseDurationMs` are null and `serverNow` is 0 — the server fills them in.
 * `logLimit` keeps only the most recent N log entries (default: all).
 */
export function toView(state: GameState, viewerId: string | null, opts?: { logLimit?: number }): GameView {
  throw new Error('not implemented');
}

/** Which timer applies to the current phase (server maps it to a duration). null = no timer (game over). */
export function phaseTimer(state: GameState): 'turn' | 'response' | 'lose_influence' | 'exchange' | null {
  throw new Error('not implemented');
}

export type { PhaseKind };
