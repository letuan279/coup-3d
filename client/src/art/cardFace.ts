/**
 * Character card face layout (500 × 700): coloured frame, illustrated portrait window, name
 * ribbon, ability panel and a corner emblem.
 */
import type { Character } from '@shared/types';
import type { Lang } from '../store/useGame';
import { translate } from '../i18n';
import { CHARACTER_COLORS, FONT_BODY, FONT_DISPLAY, PALETTE } from './palette';
import { at, circle, clipped, fill, ink, outline, poly, rrect, type Ctx } from './draw';
import { rgba } from './color';
import { canvasMeasure, fitSize, fontSpec, inkCenterOffset, layoutText, textInkHeight } from './text';
import { drawPortrait, PORTRAIT_H, PORTRAIT_W } from './portraits';
import { drawEmblem } from './icons';
import { drawGlyph } from './glyphs';

export const FACE_W = 500;
export const FACE_H = 700;
/** Corner radius of the card silhouette (outside is transparent). */
export const CARD_RADIUS = 36;

const WIN_X = (FACE_W - PORTRAIT_W) / 2;
const WIN_Y = 34;
const RIBBON_Y = 424;
const RIBBON_H = 80;
/** Horizontal inset of the name band from the card edge. */
const RIBBON_INSET = 38;
const PANEL = { x: 46, y: 482, w: 408, h: 184 } as const;

export function cardShape(): Path2D {
  return rrect(0, 0, FACE_W, FACE_H, CARD_RADIUS);
}

/** Coloured frame with a soft diagonal stripe texture and a stitched inner border. */
function drawFrame(g: Ctx, main: string, dark: string, light: string): void {
  const shape = cardShape();
  fill(g, shape, main);
  clipped(g, shape, () => {
    g.strokeStyle = rgba('#FFFFFF', 0.08);
    g.lineWidth = 14;
    g.beginPath();
    for (let x = -FACE_H; x < FACE_W; x += 38) {
      g.moveTo(x, FACE_H);
      g.lineTo(x + FACE_H, 0);
    }
    g.stroke();
    // Darker rim so the silhouette reads on any table colour.
    g.strokeStyle = rgba(dark, 0.6);
    g.lineWidth = 26;
    g.stroke(shape);
  });
  g.save();
  g.setLineDash([12, 10]);
  outline(g, rrect(17, 17, FACE_W - 34, FACE_H - 34, CARD_RADIUS - 12), 3, rgba(light, 0.75));
  g.restore();
}

function drawRibbon(g: Ctx, text: string, main: string, dark: string): void {
  const y = RIBBON_Y;
  const h = RIBBON_H;
  const bx = RIBBON_INSET;
  // Tails with a V notch, then the little folds tucked behind the band.
  for (const s of [-1, 1]) {
    const outer = s < 0 ? 10 : FACE_W - 10;
    const inner = s < 0 ? bx + 26 : FACE_W - bx - 26;
    const notch = outer - s * 22;
    const tail = poly([
      [inner, y + 20],
      [outer, y + 20],
      [notch, y + 20 + (h - 4) / 2],
      [outer, y + h + 16],
      [inner, y + h + 16],
    ]);
    ink(g, tail, { fill: main, shade: dark, shadeOffset: [0, 8], line: 6 });
    const bandEnd = s < 0 ? bx : FACE_W - bx;
    ink(g, poly([[bandEnd, y + h], [inner, y + h], [inner, y + h + 16]]), { fill: dark, line: 5 });
  }
  const band = rrect(bx, y, FACE_W - bx * 2, h, 16);
  // Hard sticker shadow below the band.
  fill(g, rrect(bx, y + 6, FACE_W - bx * 2, h, 16), rgba(PALETTE.ink, 0.35));
  ink(g, band, { fill: PALETTE.paper, shade: PALETTE.sand, shadeOffset: [0, 9], line: 7 });

  // Largest size that fits the band's width, then shrink if stacked diacritics + descenders
  // would touch the band's edges.
  const maxW = FACE_W - bx * 2 - 44;
  let size = fitSize(text, canvasMeasure(g, 800, FONT_DISPLAY), maxW, 68, 26);
  g.font = fontSpec(800, size, FONT_DISPLAY);
  const inkH = textInkHeight(g, text, size);
  if (inkH > h - 16) {
    size = Math.max(26, Math.floor((size * (h - 16)) / inkH));
    g.font = fontSpec(800, size, FONT_DISPLAY);
  }
  g.textAlign = 'center';
  g.textBaseline = 'alphabetic';
  const cy = y + h / 2 + inkCenterOffset(g, text, size);
  g.fillStyle = PALETTE.ink;
  g.fillText(text, FACE_W / 2, cy, maxW);
}

function drawAbility(g: Ctx, character: Character, text: string): void {
  const { dark, light } = CHARACTER_COLORS[character];
  const { x, y, w, h } = PANEL;
  fill(g, rrect(x, y + 7, w, h, 24), rgba(dark, 0.9));
  const panel = rrect(x, y, w, h, 24);
  ink(g, panel, { fill: PALETTE.paper, shade: PALETTE.cream, shadeOffset: [0, 10], line: 6 });
  // Faint glyph watermark peeking from the panel's lower corner.
  clipped(g, panel, () => {
    at(g, x + w - 44, y + h - 36, -0.2, 1.25, () => drawGlyph(g, character, { body: rgba(light, 0.75), cut: PALETTE.paper }));
  });

  const top = RIBBON_Y + RIBBON_H + 10;
  const bottom = y + h - 16;
  const maxW = w - 56;
  const layout = layoutText(text, canvasMeasure(g, 800, FONT_BODY), maxW, 2, 34, 20);
  const lh = layout.size * 1.24;
  g.font = fontSpec(800, layout.size, FONT_BODY);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = PALETTE.inkSoft;
  const cy = (top + bottom) / 2 - ((layout.lines.length - 1) * lh) / 2;
  layout.lines.forEach((l, i) => g.fillText(l, FACE_W / 2, cy + i * lh + layout.size * 0.06, maxW));
}

export function drawCardFace(g: Ctx, character: Character, lang: Lang): void {
  const col = CHARACTER_COLORS[character];
  drawFrame(g, col.main, col.dark, col.light);

  // Portrait window with a hard drop shadow.
  const win = rrect(WIN_X, WIN_Y, PORTRAIT_W, PORTRAIT_H, 26);
  fill(g, rrect(WIN_X, WIN_Y + 7, PORTRAIT_W, PORTRAIT_H, 26), rgba(col.dark, 0.9));
  clipped(g, win, () => {
    g.translate(WIN_X, WIN_Y);
    drawPortrait(g, character);
  });
  outline(g, win, 7);

  drawAbility(g, character, translate(lang, `charAbility.${character}`));
  drawRibbon(g, translate(lang, `char.${character}`), col.main, col.dark);

  // Corner emblem.
  fill(g, circle(74, 80, 46), rgba(col.dark, 0.9));
  drawEmblem(g, character, 74, 74, 46);

  // Outer ink edge.
  outline(g, rrect(4, 4, FACE_W - 8, FACE_H - 8, CARD_RADIUS - 4), 8);
}
