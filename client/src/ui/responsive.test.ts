import { describe, expect, it } from 'vitest';
import { hudLayout, lobbyLayout } from './responsive';

describe('responsive layout modes', () => {
  it('keeps the design-size HUD on desktop screens', () => {
    expect(hudLayout(1366, 768)).toEqual({ mode: 'desktop', scale: 1, logOverlay: false });
    expect(hudLayout(1920, 1080).mode).toBe('desktop');
    expect(lobbyLayout(1366, 768)).toBe('desktop');
  });

  it('stacks the HUD on phones and tablets held upright, with the log as a drawer', () => {
    for (const [w, h] of [
      [390, 844],
      [375, 667],
      [768, 1024],
    ]) {
      expect(hudLayout(w, h)).toEqual({ mode: 'portrait', scale: 1, logOverlay: true });
      expect(lobbyLayout(w, h)).toBe('portrait');
    }
  });

  it('uses the flat, lightly scaled layout on phones held sideways', () => {
    const l = hudLayout(844, 390);
    expect(l.mode).toBe('short');
    expect(l.logOverlay).toBe(true);
    // Readable: the zones shrink far less than the desktop HUD would have to.
    expect(l.scale).toBeGreaterThan(0.75);
    expect(hudLayout(667, 375).scale).toBeGreaterThanOrEqual(0.72);
    expect(lobbyLayout(844, 390)).toBe('side');
  });

  it('scales the desktop zones down on small laptops and landscape tablets', () => {
    const l = hudLayout(1024, 768);
    expect(l.mode).toBe('scaled');
    expect(l.scale).toBeCloseTo(0.93, 2);
    expect(l.logOverlay).toBe(false);
    expect(hudLayout(1280, 600).logOverlay).toBe(false);
  });
});
