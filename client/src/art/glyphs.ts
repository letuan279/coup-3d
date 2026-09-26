/**
 * Character glyphs (crown, dagger, anchor, scroll, fan) as bold single-colour silhouettes in a
 * ±44 unit box centred on the origin. Detail lines are cut out with `cut` (normally the disc
 * colour) so the glyph stays one flat shape that still reads at 20 px.
 */
import type { Character } from '@shared/types';
import { at, circle, fill, line, poly, rrect, svg, union, type Ctx } from './draw';

export interface GlyphColors {
  body: string;
  /** Colour used for engraved details (usually the background disc colour). */
  cut: string;
}

type GlyphFn = (g: Ctx, c: GlyphColors) => void;

const crown: GlyphFn = (g, c) => {
  const body = union(
    svg('M -38 16 L -44 -20 L -19 1 L 0 -31 L 19 1 L 44 -20 L 38 16 Z'),
    rrect(-40, 12, 80, 20, 7),
    circle(-44, -22, 7.5),
    circle(0, -34, 8),
    circle(44, -22, 7.5),
  );
  fill(g, body, c.body);
  // Gems on the band.
  fill(g, circle(0, 22, 5.5), c.cut);
  fill(g, circle(-22, 22, 4), c.cut);
  fill(g, circle(22, 22, 4), c.cut);
};

const dagger: GlyphFn = (g, c) => {
  at(g, 0, 0, Math.PI / 4, 1, () => {
    const body = union(
      svg('M 0 -52 C 7 -44 11 -34 11 -22 L 11 6 L -11 6 L -11 -22 C -11 -34 -7 -44 0 -52 Z'),
      rrect(-26, 5, 52, 12, 6),
      rrect(-7, 15, 14, 22, 4),
      circle(0, 42, 9),
    );
    fill(g, body, c.body);
    line(g, svg('M 0 -38 L 0 0'), 3.5, c.cut);
    fill(g, circle(0, 42, 3.5), c.cut);
  });
};

const anchor: GlyphFn = (g, c) => {
  // Ring, shank and stock.
  line(g, circle(0, -34, 8), 7.5, c.body);
  fill(g, union(rrect(-5.5, -27, 11, 64, 5), rrect(-24, -20, 48, 10, 5)), c.body);
  // Curved arms.
  const arms = svg('M -34 6 C -32 30 -16 40 0 40 C 16 40 32 30 34 6');
  line(g, arms, 10, c.body);
  // Flukes (arrow tips pointing up/outwards).
  fill(g, poly([[-44, 12], [-34, -6], [-22, 14]]), c.body);
  fill(g, poly([[44, 12], [34, -6], [22, 14]]), c.body);
};

const scroll: GlyphFn = (g, c) => {
  at(g, 0, 0, -0.32, 1, () => {
    const sheet = rrect(-24, -30, 48, 60, 3);
    const top = rrect(-32, -40, 64, 16, 8);
    const bottom = rrect(-32, 24, 64, 16, 8);
    fill(g, union(sheet, top, bottom), c.body);
    // Writing lines and roll ends.
    for (const y of [-12, -1, 10]) line(g, svg(`M -14 ${y} L 14 ${y}`), 3.5, c.cut);
    fill(g, circle(-28, -32, 3), c.cut);
    fill(g, circle(28, 32, 3), c.cut);
  });
  // Wax seal hanging off the corner.
  fill(g, circle(20, 26, 11), c.body);
  fill(g, circle(20, 26, 5), c.cut);
};

const fan: GlyphFn = (g, c) => {
  const cx = 0;
  const cy = 24;
  const r = 50;
  const a0 = Math.PI * 1.08;
  const a1 = Math.PI * 1.92;
  const ribs = 6;
  // Scalloped outer edge: one outward bulge per rib segment.
  const p = new Path2D();
  p.moveTo(cx, cy);
  for (let i = 0; i < ribs; i++) {
    const s = a0 + ((a1 - a0) * i) / ribs;
    const e = a0 + ((a1 - a0) * (i + 1)) / ribs;
    const m = (s + e) / 2;
    if (i === 0) p.lineTo(cx + Math.cos(s) * r, cy + Math.sin(s) * r);
    p.quadraticCurveTo(cx + Math.cos(m) * r * 1.13, cy + Math.sin(m) * r * 1.13, cx + Math.cos(e) * r, cy + Math.sin(e) * r);
  }
  p.closePath();
  fill(g, p, c.body);
  // Ribs cut from the pivot, stopping short of the edge.
  for (let i = 1; i < ribs; i++) {
    const a = a0 + ((a1 - a0) * i) / ribs;
    line(
      g,
      svg(`M ${cx + Math.cos(a) * 16} ${cy + Math.sin(a) * 16} L ${cx + Math.cos(a) * r * 0.86} ${cy + Math.sin(a) * r * 0.86}`),
      3.2,
      c.cut,
    );
  }
  // Pivot and a little tassel handle.
  fill(g, union(circle(cx, cy, 9), rrect(-5, cy, 10, 16, 4), circle(0, cy + 20, 6)), c.body);
  fill(g, circle(cx, cy, 3.5), c.cut);
};

const GLYPHS: Record<Character, GlyphFn> = {
  duke: crown,
  assassin: dagger,
  captain: anchor,
  ambassador: scroll,
  contessa: fan,
};

/** Draws the glyph centred at the current origin (±44 units). */
export function drawGlyph(g: Ctx, character: Character, colors: GlyphColors): void {
  g.save();
  g.lineCap = 'round';
  g.lineJoin = 'round';
  GLYPHS[character](g, colors);
  g.restore();
}
