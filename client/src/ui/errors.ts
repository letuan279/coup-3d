/**
 * Maps server error codes (ServerErrorCode | MoveError | client-side CLIENT_ERRORS)
 * to i18n keys in client/src/i18n/ui.ts.
 */
import type { ServerErrorCode } from '@shared/protocol';
import type { MoveError } from '@shared/types';

/** Records (not lists) so a new error code in the contract fails typecheck until it is listed here. */
const SERVER_ERRORS: Record<ServerErrorCode, true> = {
  bad_request: true,
  room_not_found: true,
  room_full: true,
  game_in_progress: true,
  not_host: true,
  not_in_room: true,
  not_enough_players: true,
  name_taken: true,
  rate_limited: true,
  bad_rejoin_key: true,
  seat_taken: true,
};

export const SERVER_ERROR_CODES = Object.keys(SERVER_ERRORS) as readonly ServerErrorCode[];

const MOVE_ERROR_SET: Record<MoveError, true> = {
  game_over: true,
  not_your_decision: true,
  invalid_move: true,
  invalid_target: true,
  not_enough_coins: true,
  must_coup: true,
  stale_phase: true,
  unknown_player: true,
};

export const MOVE_ERRORS = Object.keys(MOVE_ERROR_SET) as readonly MoveError[];

/** Errors produced by the client API wrapper itself (net/socket.ts). */
export const CLIENT_ERRORS = ['timeout', 'no_game', 'not_connected', 'disconnected'] as const;

const KNOWN = new Set<string>([...SERVER_ERROR_CODES, ...MOVE_ERRORS, ...CLIENT_ERRORS]);

export function errorKey(code: string): string {
  return KNOWN.has(code) ? `error.${code}` : 'error.unknown';
}
