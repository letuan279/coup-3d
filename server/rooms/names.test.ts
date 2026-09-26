import { describe, expect, it } from 'vitest';
import { NAME_MAX_LENGTH } from '@shared/constants';
import { AVATARS } from '@shared/types';
import { createRng } from '@shared/rng';
import { BOT_NAMES, nameKey, pickBotName, uniqueName } from './names';

describe('names', () => {
  it('appends " 2", " 3"… case-insensitively and stays within the length limit', () => {
    expect(uniqueName('Heo', [])).toBe('Heo');
    expect(uniqueName('Heo', ['heo'])).toBe('Heo 2');
    expect(uniqueName('Heo', ['HEO', 'heo 2'])).toBe('Heo 3');
    const long = 'x'.repeat(NAME_MAX_LENGTH);
    const u = uniqueName(long, [long]);
    expect(u.length).toBeLessThanOrEqual(NAME_MAX_LENGTH);
    expect(u.endsWith(' 2')).toBe(true);
    expect(nameKey(' Bé Heo ')).toBe(nameKey('BÉ HEO'));
  });

  it('has Vietnamese names for every avatar and picks unused ones', () => {
    for (const a of AVATARS) {
      expect(BOT_NAMES[a].length).toBeGreaterThan(1);
      for (const n of BOT_NAMES[a]) expect(n.length).toBeLessThanOrEqual(NAME_MAX_LENGTH);
    }
    const rand = createRng(1);
    const taken: string[] = [];
    for (let i = 0; i < 6; i++) taken.push(pickBotName('pig', taken, rand));
    expect(new Set(taken.map(nameKey)).size).toBe(6);
    expect(taken.slice(0, 4).sort()).toEqual([...BOT_NAMES.pig].sort());
  });
});
