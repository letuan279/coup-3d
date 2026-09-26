import { describe, expect, it } from 'vitest';
import { parseRejoinKey } from '../validate';
import { newRejoinKey, REJOIN_KEY_LENGTH, sameRejoinKey } from './rejoinKey';

describe('rejoin keys', () => {
  it('are 96-bit base64url strings that pass payload validation', () => {
    const keys = new Set<string>();
    for (let i = 0; i < 500; i++) {
      const key = newRejoinKey();
      expect(key).toHaveLength(REJOIN_KEY_LENGTH);
      expect(key).toMatch(/^[A-Za-z0-9_-]+$/);
      expect(parseRejoinKey(key)).toBe(key);
      keys.add(key);
    }
    expect(keys.size).toBe(500);
  });

  it('compare exactly (case, length)', () => {
    const key = newRejoinKey();
    expect(sameRejoinKey(key, key)).toBe(true);
    expect(sameRejoinKey(key, String(key))).toBe(true);
    expect(sameRejoinKey(key, key.slice(0, -1))).toBe(false);
    expect(sameRejoinKey(key, `${key}A`)).toBe(false);
    expect(sameRejoinKey('abcDEF', 'ABCdef')).toBe(false);
    expect(sameRejoinKey(key, '')).toBe(false);
  });
});
