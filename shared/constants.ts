import type { ActionDef, ActionType, BotLevel, Character, RoomSettings } from './types';

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 6;

export const CARDS_PER_CHARACTER = 3;
export const TREASURY_COINS = 50;
export const STARTING_COINS = 2;
/** Official rule: in a 2-player game the starting player begins with 1 coin instead of 2. */
export const TWO_PLAYER_FIRST_PLAYER_COINS = 1;
export const INFLUENCES_PER_PLAYER = 2;

export const COUP_COST = 7;
export const ASSASSINATE_COST = 3;
/** A player starting their turn with this many coins (or more) must Coup. */
export const MUST_COUP_COINS = 10;
export const EXCHANGE_DRAW = 2;

export const ACTIONS: Record<ActionType, ActionDef> = {
  income: { type: 'income', cost: 0, needsTarget: false, blockedBy: [], blockableBy: null },
  foreign_aid: { type: 'foreign_aid', cost: 0, needsTarget: false, blockedBy: ['duke'], blockableBy: 'anyone' },
  coup: { type: 'coup', cost: COUP_COST, needsTarget: true, blockedBy: [], blockableBy: null },
  tax: { type: 'tax', cost: 0, claim: 'duke', needsTarget: false, blockedBy: [], blockableBy: null },
  assassinate: {
    type: 'assassinate',
    cost: ASSASSINATE_COST,
    claim: 'assassin',
    needsTarget: true,
    blockedBy: ['contessa'],
    blockableBy: 'target',
  },
  steal: {
    type: 'steal',
    cost: 0,
    claim: 'captain',
    needsTarget: true,
    blockedBy: ['captain', 'ambassador'],
    blockableBy: 'target',
  },
  exchange: { type: 'exchange', cost: 0, claim: 'ambassador', needsTarget: false, blockedBy: [], blockableBy: null },
};

/** Coins gained by the actor when the action resolves (steal = up to this many from the target). */
export const ACTION_GAIN: Record<ActionType, number> = {
  income: 1,
  foreign_aid: 2,
  coup: 0,
  tax: 3,
  assassinate: 0,
  steal: 2,
  exchange: 0,
};

/** Character → the action it enables (if any) and what it can block. Handy for UI/bots. */
export const CHARACTER_INFO: Record<Character, { action?: ActionType; blocks: ActionType[] }> = {
  duke: { action: 'tax', blocks: ['foreign_aid'] },
  assassin: { action: 'assassinate', blocks: [] },
  captain: { action: 'steal', blocks: ['steal'] },
  ambassador: { action: 'exchange', blocks: ['steal'] },
  contessa: { blocks: ['assassinate'] },
};

// ───────────── Timers & room lifecycle ─────────────

export const DEFAULT_SETTINGS: RoomSettings = { turnSeconds: 30, responseSeconds: 12 };
export const TURN_SECONDS_OPTIONS = [20, 30, 45, 60] as const;
export const RESPONSE_SECONDS_OPTIONS = [8, 12, 15, 20] as const;
/** Time to pick which influence to lose. */
export const LOSE_INFLUENCE_SECONDS = 15;
/** Exchange uses the turn timer. */

/** A disconnected human's seat is taken over by a bot after this long (they can still come back). */
export const RECONNECT_GRACE_MS = 30_000;
/** A disconnected human in the lobby (no game running) is removed after this long. */
export const LOBBY_DISCONNECT_REMOVE_MS = 60_000;
/** A room with no connected humans is deleted after this long. */
export const EMPTY_ROOM_DELETE_MS = 5 * 60_000;
/** Bot "thinking" delay range (ms) before acting — keeps the game readable. */
export const BOT_THINK_MS: Record<BotLevel, [number, number]> = {
  easy: [900, 2200],
  normal: [1000, 2600],
  hard: [1100, 3000],
};
/** Minimum delay before bots act at the start of a new phase, so clients can animate the previous step. */
export const MIN_PHASE_SETTLE_MS = 700;

export const ROOM_CODE_LENGTH = 5;
/** Unambiguous uppercase alphabet for room codes (no I, O, 0, 1). */
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
/**
 * Length of a seat's rejoin key: base64url of 12 random bytes (server/rooms/rejoinKey.ts). The
 * client uses it to trim junk a chat app glued onto a pasted rejoin link.
 */
export const REJOIN_KEY_LENGTH = 16;
export const NAME_MAX_LENGTH = 16;
export const CLIENT_LOG_LIMIT = 120;
export const EMOTE_COOLDOWN_MS = 1500;
