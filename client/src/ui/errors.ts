/**
 * Maps server error codes (ServerErrorCode | MoveError | client-side 'timeout' / 'no_game')
 * to i18n keys in client/src/i18n/ui.ts.
 */
import type { ServerErrorCode } from '@shared/protocol';
import type { MoveError } from '@shared/types';

export const SERVER_ERROR_CODES: readonly ServerErrorCode[] = [
  'bad_request',
  'room_not_found',
  'room_full',
  'game_in_progress',
  'not_host',
  'not_in_room',
  'not_enough_players',
  'name_taken',
  'rate_limited',
];

export const MOVE_ERRORS: readonly MoveError[] = [
  'game_over',
  'not_your_decision',
  'invalid_move',
  'invalid_target',
  'not_enough_coins',
  'must_coup',
  'stale_phase',
  'unknown_player',
];

/** Errors produced by the client API wrapper itself (net/socket.ts). */
export const CLIENT_ERRORS = ['timeout', 'no_game'] as const;

const KNOWN = new Set<string>([...SERVER_ERROR_CODES, ...MOVE_ERRORS, ...CLIENT_ERRORS]);

export function errorKey(code: string): string {
  return KNOWN.has(code) ? `error.${code}` : 'error.unknown';
}
