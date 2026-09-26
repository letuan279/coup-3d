/**
 * Shared card back: coral harlequin field inside a teal band strung with little tavern lights,
 * a scalloped mustard medallion and the word COUP on a ribbon.
 */
import { FONT_DISPLAY, PALETTE } from './palette';
import { at, circle, clipped, fill, ink, outline, poly, rrect, sunburst, union, type Ctx } from './draw';
import { mix, rgba } from './color';
import { drawGlyph } from './glyphs';
import { cardShape, CARD_RADIUS, FACE_H, FACE_W } from './cardFace';
import { fitSize, canvasMeasure, fontSpec, inkCenterOffset } from './text';

const BAND_OUT = 20;
const BAND_IN = 46;
const CX = FACE_W / 2;
const CY = FACE_H / 2;

function harlequin(g: Ctx): void {
  const cw = 64;
  const ch = 88;
  g.fillStyle = mix(PALETTE.coral, PALETTE.coralDark, 0.45);
  g.beginPath();
  for (let j = -1; j * ch < FACE_H + ch; j++) {
    for (let i = -1; i * cw < FACE_W + cw; i++) {
      const x = i * cw + cw / 2;
      const y = j * ch + ch / 2;
      g.moveTo(x, y - ch / 2);
      g.lineTo(x + cw / 2, y);
      g.lineTo(x, y + ch / 2);
      g.lineTo(x - cw / 2, y);
      g.closePath();
    }
  }
  g.fill();
  // Gold studs where the diamonds meet.
  g.fillStyle = PALETTE.mustard;
  g.beginPath();
  for (let j = -1; j * ch < FACE_H + ch; j++) {
    for (let i = -1; i * cw < FACE_W + cw; i++) {
      const x = i * cw + cw / 2;
      const y = j * ch;
      g.moveTo(x + 4, y);
      g.arc(x, y, 4, 0, Math.PI * 2);
    }
  }
  g.fill();
}

/** Little light bulbs strung along the teal band. */
function bulbs(g: Ctx): void {
  const inset = (BAND_OUT + BAND_IN) / 2;
  const pts: [number, number][] = [];
  const x0 = inset + 24;
  const x1 = FACE_W - inset - 24;
  const y0 = inset + 24;
  const y1 = FACE_H - inset - 24;
  const nx = 8;
  const ny = 11;
  for (let i = 0; i <= nx; i++) {
    const x = x0 + ((x1 - x0) * i) / nx;
    pts.push([x, inset], [x, FACE_H - inset]);
  }
  for (let i = 0; i <= ny; i++) {
    const y = y0 + ((y1 - y0) * i) / ny;
    pts.push([inset, y], [FACE_W - inset, y]);
  }
  pts.forEach(([x, y], i) => {
    const c = i % 3 === 0 ? PALETTE.mustard : PALETTE.paper;
    ink(g, circle(x, y, 6), { fill: c, line: 3.5 });
  });
}

function cornerFans(g: Ctx): void {
  const corners: [number, number, number][] = [
    [BAND_IN, BAND_IN, 0],
    [FACE_W - BAND_IN, BAND_IN, Math.PI / 2],
    [FACE_W - BAND_IN, FACE_H - BAND_IN, Math.PI],
    [BAND_IN, FACE_H - BAND_IN, -Math.PI / 2],
  ];
  for (const [x, y, rot] of corners) {
    at(g, x, y, rot, 1, () => {
      ink(g, circle(0, 0, 50), { fill: PALETTE.mustard, shade: PALETTE.mustardDark, shadeOffset: [0, 0], line: 5 });
      sunburst(g, 0, 0, 44, 12, rgba(PALETTE.paper, 0.45), 0);
      ink(g, circle(0, 0, 20), { fill: PALETTE.teal, line: 5 });
    });
  }
}

function medallion(g: Ctx): void {
  fill(g, circle(CX, CY + 9, 150), rgba(PALETTE.ink, 0.28));
  const scallops: Path2D[] = [circle(CX, CY, 136)];
  for (let i = 0; i < 20; i++) {
    const a = (i / 20) * Math.PI * 2;
    scallops.push(circle(CX + Math.cos(a) * 136, CY + Math.sin(a) * 136, 17));
  }
  ink(g, union(...scallops), { fill: PALETTE.mustard, shade: PALETTE.mustardDark, shadeOffset: [6, 8], line: 7, behind: true });
  ink(g, circle(CX, CY, 118), { fill: PALETTE.teal, shade: PALETTE.tealDark, shadeOffset: [6, 8], line: 6 });
  const inner = circle(CX, CY, 100);
  fill(g, inner, PALETTE.paper);
  clipped(g, inner, () => sunburst(g, CX, CY, 110, 24, PALETTE.sand, 0));
  outline(g, inner, 6);
  // Crown above, three little coins below the ribbon.
  at(g, CX, CY - 70, 0, 0.7, () => {
    g.save();
    g.translate(0, 6);
    drawGlyph(g, 'duke', { body: PALETTE.ink, cut: PALETTE.ink });
    g.restore();
    drawGlyph(g, 'duke', { body: PALETTE.coral, cut: PALETTE.gold });
  });
  for (const dx of [-30, 0, 30]) {
    ink(g, circle(CX + dx, CY + 70 - (dx === 0 ? 6 : 0), 11), { fill: PALETTE.gold, shade: PALETTE.mustardDark, shadeOffset: [1.5, 2], line: 4.5 });
  }
}

function wordmark(g: Ctx): void {
  const y = CY - 6;
  const h = 76;
  for (const s of [-1, 1]) {
    const outer = s < 0 ? 42 : FACE_W - 42;
    const inner = s < 0 ? 104 : FACE_W - 104;
    const tail = poly([
      [inner, y - h / 2 + 18],
      [outer, y - h / 2 + 18],
      [outer - s * 20, y + 18],
      [outer, y + h / 2 + 18],
      [inner, y + h / 2 + 18],
    ]);
    ink(g, tail, { fill: PALETTE.coralDark, line: 6 });
  }
  fill(g, rrect(80, y - h / 2 + 7, FACE_W - 160, h, 18), rgba(PALETTE.ink, 0.35));
  ink(g, rrect(80, y - h / 2, FACE_W - 160, h, 18), { fill: PALETTE.coral, shade: PALETTE.coralDark, shadeOffset: [0, 8], line: 7 });

  const text = 'COUP';
  const size = fitSize(text, canvasMeasure(g, 800, FONT_DISPLAY), FACE_W - 220, 86, 40);
  g.font = fontSpec(800, size, FONT_DISPLAY);
  g.textAlign = 'center';
  g.textBaseline = 'alphabetic';
  const ty = y + inkCenterOffset(g, text, size);
  g.lineJoin = 'round';
  g.lineWidth = 12;
  g.strokeStyle = PALETTE.ink;
  g.strokeText(text, CX, ty + 4);
  g.fillStyle = PALETTE.ink;
  g.fillText(text, CX, ty + 4);
  g.strokeText(text, CX, ty);
  g.fillStyle = PALETTE.paper;
  g.fillText(text, CX, ty);
}

export function drawCardBack(g: Ctx): void {
  const shape = cardShape();
  fill(g, shape, PALETTE.coral);
  ink(g, rrect(BAND_OUT, BAND_OUT, FACE_W - BAND_OUT * 2, FACE_H - BAND_OUT * 2, CARD_RADIUS - 10), {
    fill: PALETTE.teal,
    line: 5,
  });
  const field = rrect(BAND_IN, BAND_IN, FACE_W - BAND_IN * 2, FACE_H - BAND_IN * 2, 14);
  clipped(g, field, () => {
    fill(g, field, PALETTE.coral);
    harlequin(g);
    cornerFans(g);
  });
  outline(g, field, 5);
  bulbs(g);
  medallion(g);
  wordmark(g);
  outline(g, rrect(4, 4, FACE_W - 8, FACE_H - 8, CARD_RADIUS - 4), 8);
}
