import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AVATARS, CHARACTERS } from '@shared/types';
import { fitSize, layoutText, wrapWords, type Measure } from './text';
import { darken, lighten, mix, parseHex, rgba } from './color';
import {
  CARD_H,
  CARD_W,
  getCardBackCanvas,
  getCardBackUrl,
  getCardFaceCanvas,
  getCardFaceUrl,
  getCharacterIconCanvas,
  getCharacterIconUrl,
} from './cardArt';
import { getAvatarCanvas, getAvatarUrl } from './avatars';

/** Monospace-ish fake metrics: every char is half the font size wide. */
const measure: Measure = (text, size) => text.length * size * 0.5;

describe('text layout', () => {
  it('fitSize picks the largest size that fits, else the minimum', () => {
    expect(fitSize('abcd', measure, 100, 40, 10)).toBe(40); // 4 * 40 * 0.5 = 80
    expect(fitSize('abcdefghij', measure, 100, 40, 10)).toBe(20);
    expect(fitSize('a'.repeat(100), measure, 100, 40, 10)).toBe(10);
  });

  it('wrapWords wraps greedily', () => {
    expect(wrapWords('aa bb cc dd', measure, 10, 25)).toEqual(['aa bb', 'cc dd']);
  });

  it('keeps a short line on one line at the max size', () => {
    expect(layoutText('Chặn Ám sát', measure, 400, 2, 34, 20)).toEqual({ size: 34, lines: ['Chặn Ám sát'] });
  });

  it('prefers breaking at the " · " separator over wrapping inside a segment', () => {
    const layout = layoutText('Đổi bài với chồng bài · Chặn Cướp', measure, 352, 2, 38, 20);
    expect(layout.lines).toEqual(['Đổi bài với chồng bài', 'Chặn Cướp']);
    for (const l of layout.lines) expect(measure(l, layout.size)).toBeLessThanOrEqual(352);
  });

  it('word-wraps a single long segment', () => {
    const layout = layoutText('Pay 3 coins to Assassinate', measure, 300, 2, 34, 20);
    expect(layout.lines.length).toBe(2);
    expect(layout.lines.join(' ')).toBe('Pay 3 coins to Assassinate');
  });

  it('never returns more than maxLines, even when nothing fits', () => {
    const layout = layoutText('one two three four five six seven', measure, 20, 2, 30, 20);
    expect(layout.size).toBe(20);
    expect(layout.lines.length).toBeLessThanOrEqual(2);
    expect(layout.lines.join(' ')).toBe('one two three four five six seven');
  });
});

describe('colour helpers', () => {
  it('parses and mixes hex colours', () => {
    expect(parseHex('#FF8000')).toEqual([255, 128, 0]);
    expect(parseHex('#fff')).toEqual([255, 255, 255]);
    expect(mix('#000000', '#FFFFFF', 0)).toBe('#000000');
    expect(mix('#000000', '#FFFFFF', 1)).toBe('#FFFFFF');
    expect(mix('#000000', '#FFFFFF', 0.5)).toBe('#808080');
    expect(lighten('#2B2140', 1)).toBe('#FFFFFF');
    expect(darken('#FFFFFF', 1)).toBe('#2B2140');
    expect(rgba('#FF0000', 0.5)).toBe('rgba(255,0,0,0.5)');
  });
});

// ───────────── Smoke test: draw everything against a fake canvas ─────────────

const problems: string[] = [];

function checkArgs(where: string, args: readonly unknown[]): void {
  args.forEach((a, i) => {
    if (typeof a === 'number' && !Number.isFinite(a)) problems.push(`${where} arg ${i} = ${a}`);
    if (typeof a === 'string' && /NaN|undefined|Infinity/.test(a)) problems.push(`${where} arg ${i} = "${a}"`);
  });
}

class FakePath2D {
  constructor(d?: unknown) {
    if (d !== undefined) checkArgs('Path2D()', [d]);
    return new Proxy(this, {
      get: (target, prop) =>
        prop in target ? Reflect.get(target, prop) : (...args: unknown[]) => checkArgs(`Path2D.${String(prop)}`, args),
    });
  }
}

function fakeContext(): CanvasRenderingContext2D {
  const state: Record<string | symbol, unknown> = {};
  const fontSize = () => Number(/(\d+(?:\.\d+)?)px/.exec(String(state.font ?? '10px'))?.[1] ?? 10);
  const gradient = { addColorStop: (...args: unknown[]) => checkArgs('addColorStop', args) };
  const special: Record<string, (...args: unknown[]) => unknown> = {
    measureText: (text) => {
      const size = fontSize();
      return { width: String(text).length * size * 0.5, actualBoundingBoxAscent: size * 0.8, actualBoundingBoxDescent: size * 0.2 };
    },
    createRadialGradient: (...args) => (checkArgs('createRadialGradient', args), gradient),
    createLinearGradient: (...args) => (checkArgs('createLinearGradient', args), gradient),
  };
  return new Proxy({} as CanvasRenderingContext2D, {
    get: (_t, prop) => {
      if (typeof prop === 'string' && special[prop]) return special[prop];
      if (prop in state) return state[prop];
      return (...args: unknown[]) => checkArgs(`ctx.${String(prop)}`, args);
    },
    set: (_t, prop, value) => {
      checkArgs(`ctx.${String(prop)} =`, [value]);
      state[prop] = value;
      return true;
    },
  });
}

let canvasesCreated = 0;

beforeAll(() => {
  vi.stubGlobal('Path2D', FakePath2D);
  vi.stubGlobal('document', {
    createElement: (tag: string) => {
      expect(tag).toBe('canvas');
      canvasesCreated++;
      const ctx = fakeContext();
      return { width: 0, height: 0, getContext: () => ctx, toDataURL: () => `data:image/png;base64,${canvasesCreated}` };
    },
  });
});

afterAll(() => {
  vi.unstubAllGlobals();
});

describe('procedural art (fake canvas)', () => {
  it('draws every card face, the back, icons and avatars without invalid geometry', () => {
    for (const lang of ['vi', 'en'] as const) {
      for (const c of CHARACTERS) {
        const face = getCardFaceCanvas(c, lang);
        expect([face.width, face.height]).toEqual([CARD_W, CARD_H]);
      }
    }
    const back = getCardBackCanvas();
    expect([back.width, back.height]).toEqual([CARD_W, CARD_H]);
    for (const c of CHARACTERS) expect(getCharacterIconCanvas(c).width).toBe(128);
    for (const a of AVATARS) expect(getAvatarCanvas(a).width).toBe(256);
    expect(problems).toEqual([]);
  });

  it('caches canvases and data URLs (draw once)', () => {
    const before = canvasesCreated;
    expect(getCardFaceCanvas('duke', 'vi')).toBe(getCardFaceCanvas('duke', 'vi'));
    expect(getCardFaceCanvas('duke', 'vi')).not.toBe(getCardFaceCanvas('duke', 'en'));
    expect(getCardBackCanvas()).toBe(getCardBackCanvas());
    expect(getCharacterIconCanvas('captain')).toBe(getCharacterIconCanvas('captain'));
    expect(getAvatarCanvas('owl')).toBe(getAvatarCanvas('owl'));
    expect(canvasesCreated).toBe(before);

    expect(getCardFaceUrl('contessa', 'en')).toMatch(/^data:image\/png/);
    expect(getCardFaceUrl('contessa', 'en')).toBe(getCardFaceUrl('contessa', 'en'));
    expect(getCardBackUrl()).toBe(getCardBackUrl());
    expect(getCharacterIconUrl('assassin')).toBe(getCharacterIconUrl('assassin'));
    expect(getAvatarUrl('frog')).toBe(getAvatarUrl('frog'));
    expect(canvasesCreated).toBe(before);
  });
});
