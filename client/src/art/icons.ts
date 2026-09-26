/** Round character emblems: coloured disc with an ink rim and a bold white glyph. */
import type { Character } from '@shared/types';
import { CHARACTER_COLORS, PALETTE } from './palette';
import { at, circle, ellipse, fill, ink, type Ctx } from './draw';
import { drawGlyph } from './glyphs';
import { rgba } from './color';

export const ICON_SIZE = 128;

/**
 * Draws the emblem centred at (cx, cy) with radius `r` (the 128 px icon uses r = 58).
 * Everything scales from r so the same routine serves icons and card corner badges.
 */
export function drawEmblem(g: Ctx, character: Character, cx: number, cy: number, r: number): void {
  const col = CHARACTER_COLORS[character];
  const k = r / 58;
  ink(g, circle(cx, cy, r), { fill: col.main, shade: col.dark, shadeOffset: [4 * k, 6 * k], line: 7 * k });
  // Soft top highlight.
  g.save();
  g.clip(circle(cx, cy, r - 3.5 * k));
  fill(g, ellipse(cx - 12 * k, cy - 34 * k, 34 * k, 16 * k, -0.35), rgba('#FFFFFF', 0.16));
  g.restore();
  at(g, cx, cy + 1 * k, 0, 0.92 * k, () => {
    // Drop shadow first, then the glyph itself.
    g.save();
    g.translate(0, 5);
    drawGlyph(g, character, { body: col.dark, cut: col.dark });
    g.restore();
    drawGlyph(g, character, { body: PALETTE.paper, cut: col.main });
  });
}
