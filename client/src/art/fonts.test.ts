import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FONT_WAIT_MS, waitForArtFonts, type FontSource } from './fonts';

/** A fake `document.fonts` whose loads finish when the test says so. */
function fakeFonts() {
  let finish!: (ok: boolean) => void;
  const loaded = new Promise<boolean>((r) => (finish = r));
  const fonts: FontSource = {
    load: () => loaded.then((ok) => (ok ? [] : Promise.reject(new Error('font failed')))),
    get ready() {
      return loaded.then(() => undefined);
    },
  };
  return { fonts, finish };
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('waitForArtFonts', () => {
  it('renders as soon as the fonts are in, with nothing to redraw', async () => {
    const { fonts, finish } = fakeFonts();
    const onLate = vi.fn();
    let done = false;
    void waitForArtFonts(fonts, FONT_WAIT_MS, onLate).then(() => (done = true));
    await vi.advanceTimersByTimeAsync(400);
    finish(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(done).toBe(true);
    await vi.advanceTimersByTimeAsync(5000);
    expect(onLate).not.toHaveBeenCalled();
  });

  it('renders after the timeout, then redraws the art once the fonts arrive', async () => {
    const { fonts, finish } = fakeFonts();
    const onLate = vi.fn();
    let done = false;
    void waitForArtFonts(fonts, FONT_WAIT_MS, onLate).then(() => (done = true));
    await vi.advanceTimersByTimeAsync(FONT_WAIT_MS - 1);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(done).toBe(true);
    expect(onLate).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(3000);
    finish(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(onLate).toHaveBeenCalledTimes(1);
  });

  it('does not wait or redraw when the fonts fail to load', async () => {
    const { fonts, finish } = fakeFonts();
    const onLate = vi.fn();
    let done = false;
    void waitForArtFonts(fonts, FONT_WAIT_MS, onLate).then(() => (done = true));
    finish(false);
    await vi.advanceTimersByTimeAsync(0);
    expect(done).toBe(true);
    await vi.advanceTimersByTimeAsync(5000);
    expect(onLate).not.toHaveBeenCalled();
  });
});
