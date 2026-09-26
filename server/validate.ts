/**
 * Payload validation for every client→server event. Parsers return clean, freshly built
 * objects (unknown keys dropped) or throw `BadRequest`, which the socket layer turns into a
 * `bad_request` ack. Semantic checks (host, phase, settings options…) live in the rooms.
 */
import { INFLUENCES_PER_PLAYER, NAME_MAX_LENGTH, ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH } from '@shared/constants';
import { ACTION_TYPES, AVATARS, CHARACTERS, EMOTES } from '@shared/types';
import type { ActionType, AvatarId, BotLevel, Character, EmoteId, Move, RoomSettings } from '@shared/types';

export class BadRequest extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BadRequest';
  }
}

export const TOKEN_MIN_LENGTH = 8;
export const TOKEN_MAX_LENGTH = 128;
/** Player ids are short server-generated strings; anything longer is garbage. */
const ID_MAX_LENGTH = 64;
/** Raw name strings longer than this are rejected before normalisation. */
const RAW_NAME_MAX_LENGTH = 64;
const BOT_LEVELS: readonly BotLevel[] = ['easy', 'normal', 'hard'];
const MAX_EXCHANGE_CARDS = INFLUENCES_PER_PLAYER + 2;
/** Control, zero-width and bidi-override characters — replaced by spaces in names. */
const INVISIBLE_CHARS = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2060-\u206f\ufeff]/g;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireRecord(value: unknown, what: string): Record<string, unknown> {
  if (!isRecord(value)) throw new BadRequest(`${what}: expected an object`);
  return value;
}

function oneOf<T extends string>(value: unknown, options: readonly T[], what: string): T {
  if (typeof value !== 'string' || !(options as readonly string[]).includes(value)) {
    throw new BadRequest(`${what}: invalid value`);
  }
  return value as T;
}

/** Handshake token: 8..128 printable characters, else null (connection is refused). */
export function parseToken(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  if (value.length < TOKEN_MIN_LENGTH || value.length > TOKEN_MAX_LENGTH) return null;
  return /^[\x21-\x7e]+$/.test(value) ? value : null;
}

/** Trimmed, whitespace-collapsed, NFC-normalised display name of 1..NAME_MAX_LENGTH chars. */
export function parseName(value: unknown): string {
  if (typeof value !== 'string' || value.length > RAW_NAME_MAX_LENGTH) throw new BadRequest('name: invalid');
  const name = value
    .normalize('NFC')
    .replace(INVISIBLE_CHARS, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (name.length < 1 || name.length > NAME_MAX_LENGTH) throw new BadRequest('name: length');
  return name;
}

function optionalAvatar(value: unknown): AvatarId | undefined {
  if (value === undefined || value === null) return undefined;
  return oneOf(value, AVATARS, 'avatar');
}

/** Upper-cased room code, or null when it cannot possibly exist (→ `room_not_found`). */
export function parseRoomCode(value: unknown): string | null {
  if (typeof value !== 'string') throw new BadRequest('code: expected a string');
  const code = value.trim().toUpperCase();
  if (code.length !== ROOM_CODE_LENGTH) return null;
  for (const ch of code) if (!ROOM_CODE_ALPHABET.includes(ch)) return null;
  return code;
}

export interface ProfileInput {
  name: string;
  avatar?: AvatarId;
}

function profile(p: Record<string, unknown>): ProfileInput {
  const out: ProfileInput = { name: parseName(p.name) };
  const avatar = optionalAvatar(p.avatar);
  if (avatar) out.avatar = avatar;
  return out;
}

export function parseCreatePayload(value: unknown): ProfileInput {
  return profile(requireRecord(value, 'room:create'));
}

export function parseJoinPayload(value: unknown): ProfileInput & { code: string | null } {
  const p = requireRecord(value, 'room:join');
  return { code: parseRoomCode(p.code), ...profile(p) };
}

export function parseUpdatePayload(value: unknown): Partial<ProfileInput> {
  const p = requireRecord(value, 'player:update');
  const out: Partial<ProfileInput> = {};
  if (p.name !== undefined) out.name = parseName(p.name);
  const avatar = optionalAvatar(p.avatar);
  if (avatar) out.avatar = avatar;
  return out;
}

export function parseAddBotPayload(value: unknown): { level: BotLevel } {
  const p = requireRecord(value, 'room:addBot');
  return { level: oneOf(p.level, BOT_LEVELS, 'level') };
}

function parseId(value: unknown, what: string): string {
  if (typeof value !== 'string' || value.length < 1 || value.length > ID_MAX_LENGTH) throw new BadRequest(`${what}: invalid`);
  return value;
}

export function parseKickPayload(value: unknown): { playerId: string } {
  const p = requireRecord(value, 'room:kick');
  return { playerId: parseId(p.playerId, 'playerId') };
}

/** Shape only (finite numbers); allowed values are checked by the room. Unknown keys are dropped. */
export function parseSettingsPayload(value: unknown): Partial<RoomSettings> {
  const p = requireRecord(value, 'room:settings');
  const out: Partial<RoomSettings> = {};
  for (const key of ['turnSeconds', 'responseSeconds'] as const) {
    const v = p[key];
    if (v === undefined) continue;
    if (typeof v !== 'number' || !Number.isFinite(v)) throw new BadRequest(`${key}: expected a number`);
    out[key] = v;
  }
  return out;
}

function parseSlotIndex(value: unknown, max: number, what: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value >= max) {
    throw new BadRequest(`${what}: invalid index`);
  }
  return value;
}

export function parseMove(value: unknown): Move {
  const m = requireRecord(value, 'move');
  switch (m.type) {
    case 'action': {
      const action = oneOf<ActionType>(m.action, ACTION_TYPES, 'action');
      if (m.targetId === undefined || m.targetId === null) return { type: 'action', action };
      return { type: 'action', action, targetId: parseId(m.targetId, 'targetId') };
    }
    case 'pass':
      return { type: 'pass' };
    case 'challenge':
      return { type: 'challenge' };
    case 'block':
      return { type: 'block', character: oneOf<Character>(m.character, CHARACTERS, 'character') };
    case 'reveal':
      return { type: 'reveal', slot: parseSlotIndex(m.slot, INFLUENCES_PER_PLAYER, 'slot') };
    case 'exchange': {
      if (!Array.isArray(m.keep) || m.keep.length < 1 || m.keep.length > MAX_EXCHANGE_CARDS) {
        throw new BadRequest('keep: invalid');
      }
      return { type: 'exchange', keep: m.keep.map((k) => parseSlotIndex(k, MAX_EXCHANGE_CARDS, 'keep')) };
    }
    default:
      throw new BadRequest('move: unknown type');
  }
}

export function parseMovePayload(value: unknown): { move: Move; phaseSeq: number } {
  const p = requireRecord(value, 'game:move');
  const seq = p.phaseSeq;
  if (typeof seq !== 'number' || !Number.isSafeInteger(seq) || seq < 0) throw new BadRequest('phaseSeq: invalid');
  return { move: parseMove(p.move), phaseSeq: seq };
}

export function parseEmotePayload(value: unknown): { emote: EmoteId } {
  const p = requireRecord(value, 'game:emote');
  return { emote: oneOf(p.emote, EMOTES, 'emote') };
}
