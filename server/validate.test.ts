import { describe, expect, it } from 'vitest';
import { RateLimiter } from './rateLimit';
import {
  BadRequest,
  parseAddBotPayload,
  parseCreatePayload,
  parseJoinPayload,
  parseMove,
  parseMovePayload,
  parseName,
  parseRejoinKey,
  parseSettingsPayload,
  parseToken,
  parseUpdatePayload,
} from './validate';

describe('validate', () => {
  it('accepts 8..128 printable-char tokens only', () => {
    expect(parseToken('abcdefgh')).toBe('abcdefgh');
    expect(parseToken('550e8400-e29b-41d4-a716-446655440000')).toBe('550e8400-e29b-41d4-a716-446655440000');
    expect(parseToken('short')).toBeNull();
    expect(parseToken('x'.repeat(129))).toBeNull();
    expect(parseToken('has space in it')).toBeNull();
    expect(parseToken(12345678)).toBeNull();
    expect(parseToken(undefined)).toBeNull();
  });

  it('normalises names: trims, collapses whitespace, strips invisible chars, 1..16 chars', () => {
    expect(parseName('  Bé   Heo  ')).toBe('Bé Heo');
    expect(parseName('Cá​o‮Già')).toBe('Cá o Già');
    expect(parseName('Tún')).toBe('Tún'); // NFC
    expect(parseName('x'.repeat(16))).toHaveLength(16);
    for (const bad of ['', '   ', 'x'.repeat(17), 5, null, {}, 'a'.repeat(100)]) {
      expect(() => parseName(bad)).toThrow(BadRequest);
    }
  });

  it('validates the optional rejoin key (base64url, ≤ 64 chars)', () => {
    for (const absent of [undefined, null, '']) expect(parseRejoinKey(absent)).toBeUndefined();
    expect(parseRejoinKey('aB3_-xYz09QwErTy')).toBe('aB3_-xYz09QwErTy');
    expect(parseRejoinKey('  aB3_-xYz09QwErTy ')).toBe('aB3_-xYz09QwErTy');
    // Well-formed but wrong-length keys are the room's call (bad_rejoin_key), not a bad request.
    expect(parseRejoinKey('aB3')).toBe('aB3');
    for (const bad of [123, {}, [], true, '   ', 'has space', 'key+with/slash=', 'ключ', 'x'.repeat(65)]) {
      expect(() => parseRejoinKey(bad)).toThrow(BadRequest);
    }
  });

  it('parses room:join with a rejoin key: the profile becomes optional', () => {
    expect(parseJoinPayload({ code: 'abcde', rejoinKey: 'aB3_-xYz09QwErTy' })).toEqual({
      code: 'ABCDE',
      rejoinKey: 'aB3_-xYz09QwErTy',
    });
    expect(parseJoinPayload({ code: 'ABCDE', name: ' An ', avatar: 'fox', rejoinKey: 'k3y' })).toEqual({
      code: 'ABCDE',
      name: 'An',
      avatar: 'fox',
      rejoinKey: 'k3y',
    });
    // An invalid profile is dropped (a reclaim ignores it; a lobby join then fails in the room).
    expect(parseJoinPayload({ code: 'ABCDE', name: '', avatar: 'dragon', rejoinKey: 'k3y' })).toEqual({
      code: 'ABCDE',
      rejoinKey: 'k3y',
    });
    // Without a key the name is still required.
    expect(() => parseJoinPayload({ code: 'ABCDE' })).toThrow(BadRequest);
    expect(() => parseJoinPayload({ code: 'ABCDE', rejoinKey: '' })).toThrow(BadRequest);
    expect(() => parseJoinPayload({ code: 'ABCDE', name: 'An', rejoinKey: 42 })).toThrow(BadRequest);
  });

  it('parses lobby payloads and drops unknown keys', () => {
    expect(parseCreatePayload({ name: 'An', avatar: 'fox', admin: true })).toEqual({ name: 'An', avatar: 'fox' });
    expect(parseCreatePayload({ name: 'An', avatar: null })).toEqual({ name: 'An' });
    expect(() => parseCreatePayload({ name: 'An', avatar: 'dragon' })).toThrow(BadRequest);
    expect(() => parseCreatePayload([])).toThrow(BadRequest);
    expect(parseJoinPayload({ code: ' abcde ', name: 'An' })).toEqual({ code: 'ABCDE', name: 'An' });
    expect(parseJoinPayload({ code: 'ABC0O', name: 'An' }).code).toBeNull(); // 0/O not in the alphabet
    expect(parseJoinPayload({ code: 'ABCDEF', name: 'An' }).code).toBeNull();
    expect(() => parseJoinPayload({ code: 12345, name: 'An' })).toThrow(BadRequest);
    expect(parseUpdatePayload({})).toEqual({});
    expect(parseUpdatePayload({ avatar: 'owl' })).toEqual({ avatar: 'owl' });
    expect(parseAddBotPayload({ level: 'hard' })).toEqual({ level: 'hard' });
    expect(() => parseAddBotPayload({ level: 'insane' })).toThrow(BadRequest);
    expect(parseSettingsPayload({ turnSeconds: 45, junk: 1 })).toEqual({ turnSeconds: 45 });
    expect(() => parseSettingsPayload({ responseSeconds: '12' })).toThrow(BadRequest);
    expect(() => parseSettingsPayload({ responseSeconds: Number.NaN })).toThrow(BadRequest);
  });

  it('parses moves into clean objects', () => {
    expect(parseMove({ type: 'action', action: 'steal', targetId: 'p1', extra: 1 })).toEqual({
      type: 'action',
      action: 'steal',
      targetId: 'p1',
    });
    expect(parseMove({ type: 'action', action: 'income', targetId: null })).toEqual({ type: 'action', action: 'income' });
    expect(parseMove({ type: 'block', character: 'contessa' })).toEqual({ type: 'block', character: 'contessa' });
    expect(parseMove({ type: 'reveal', slot: 1 })).toEqual({ type: 'reveal', slot: 1 });
    expect(parseMove({ type: 'exchange', keep: [0, 3] })).toEqual({ type: 'exchange', keep: [0, 3] });
    const bad: unknown[] = [
      { type: 'action', action: 'nuke' },
      { type: 'action', action: 'coup', targetId: 42 },
      { type: 'block', character: 'king' },
      { type: 'reveal', slot: 2 },
      { type: 'reveal', slot: 0.5 },
      { type: 'exchange', keep: [0, 4] },
      { type: 'exchange', keep: [] },
      { type: 'exchange', keep: 'all' },
      { type: 'dance' },
      null,
    ];
    for (const m of bad) expect(() => parseMove(m)).toThrow(BadRequest);
    expect(parseMovePayload({ move: { type: 'pass' }, phaseSeq: 7 })).toEqual({ move: { type: 'pass' }, phaseSeq: 7 });
    expect(() => parseMovePayload({ move: { type: 'pass' }, phaseSeq: -1 })).toThrow(BadRequest);
    expect(() => parseMovePayload({ move: { type: 'pass' }, phaseSeq: 1.5 })).toThrow(BadRequest);
  });
});

describe('RateLimiter', () => {
  it('allows a burst, then refills at the sustained rate', () => {
    let now = 0;
    const rl = new RateLimiter(20, 5, () => now);
    for (let i = 0; i < 5; i++) expect(rl.take()).toBe(true);
    expect(rl.take()).toBe(false);
    now += 50; // 1 token
    expect(rl.take()).toBe(true);
    expect(rl.take()).toBe(false);
    now += 10_000;
    for (let i = 0; i < 5; i++) expect(rl.take()).toBe(true);
    expect(rl.take()).toBe(false);
  });
});
