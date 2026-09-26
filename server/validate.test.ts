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
