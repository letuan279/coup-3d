/**
 * Late web fonts: the text textures (sign, cards) are redrawn in place and re-uploaded
 * (regression for perf3d-8). Canvases are faked — only the calls matter here.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const texts: string[] = [];

function fakeContext(): CanvasRenderingContext2D {
  const state: Record<string | symbol, unknown> = {};
  const gradient = { addColorStop: () => {} };
  const special: Record<string, (...args: unknown[]) => unknown> = {
    measureText: (text) => ({ width: String(text).length * 10, actualBoundingBoxAscent: 16, actualBoundingBoxDescent: 4 }),
    createRadialGradient: () => gradient,
    createLinearGradient: () => gradient,
    fillText: (text) => void texts.push(String(text)),
  };
  return new Proxy({} as CanvasRenderingContext2D, {
    get: (_t, prop) => (typeof prop === 'string' && special[prop]) || (prop in state ? state[prop] : () => {}),
    set: (_t, prop, value) => {
      state[prop] = value;
      return true;
    },
  });
}

beforeAll(() => {
  vi.stubGlobal(
    'Path2D',
    class {
      constructor() {
        return new Proxy(this, { get: (t, p) => (p in t ? Reflect.get(t, p) : () => {}) });
      }
    },
  );
  vi.stubGlobal('document', {
    createElement: () => {
      const ctx = fakeContext();
      return { width: 0, height: 0, getContext: () => ctx, toDataURL: () => 'data:image/png;base64,' };
    },
  });
});

afterAll(() => {
  vi.unstubAllGlobals();
});

describe('text textures after a late font load', () => {
  it('repaints the sign and re-uploads sign and card textures, keeping the same objects', async () => {
    const { cardBackTexture, cardFaceTexture, floorTexture, signTexture } = await import('./textures');
    const { refreshArt } = await import('../art/refresh');
    const sign = signTexture('vi');
    const face = cardFaceTexture('captain', 'en');
    const back = cardBackTexture();
    const floor = floorTexture();
    const images = [sign.image, face.image, back.image];
    const versions = [sign.version, face.version, back.version, floor.version];
    texts.length = 0;

    refreshArt();

    expect([sign.image, face.image, back.image]).toEqual(images);
    expect(sign.version).toBe(versions[0] + 1);
    expect(face.version).toBe(versions[1] + 1);
    expect(back.version).toBe(versions[2] + 1);
    expect(floor.version).toBe(versions[3]); // no text: untouched
    expect(texts).toContain('QUÁN BÀI NẮNG');
    // The textures module hands out the same (now refreshed) objects afterwards.
    expect(signTexture('vi')).toBe(sign);
    expect(cardFaceTexture('captain', 'en')).toBe(face);
  });
});
