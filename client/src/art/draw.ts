/**
 * Low-level Canvas 2D helpers shared by every procedurally drawn asset: canvas creation, path
 * builders, the "inked sticker" fill → shade crescent → outline routine, and small decorations.
 */
import { PALETTE } from './palette';
import { lighten, rgba } from './color';

export type Ctx = CanvasRenderingContext2D;

export const TAU = Math.PI * 2;
export const INK = PALETTE.ink;
/** Main outline width at card scale (500 px wide). */
export const LINE = 7;

export function makeCanvas(w: number, h: number): [HTMLCanvasElement, Ctx] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  if (!g) throw new Error('Canvas 2D is not supported');
  return [c, g];
}

// ───────────────────────────── Path builders ─────────────────────────────

export function circle(cx: number, cy: number, r: number): Path2D {
  const p = new Path2D();
  p.arc(cx, cy, r, 0, TAU);
  return p;
}

export function ellipse(cx: number, cy: number, rx: number, ry: number, rotation = 0): Path2D {
  const p = new Path2D();
  p.ellipse(cx, cy, rx, ry, rotation, 0, TAU);
  return p;
}

/** Rounded rectangle; `r` is clamped to half the smaller side. */
export function rrect(x: number, y: number, w: number, h: number, r: number): Path2D {
  const p = new Path2D();
  const k = Math.max(0, Math.min(r, w / 2, h / 2));
  p.moveTo(x + k, y);
  p.arcTo(x + w, y, x + w, y + h, k);
  p.arcTo(x + w, y + h, x, y + h, k);
  p.arcTo(x, y + h, x, y, k);
  p.arcTo(x, y, x + w, y, k);
  p.closePath();
  return p;
}

/** Path from SVG path data (handy for hand-authored curves). */
export function svg(d: string): Path2D {
  return new Path2D(d);
}

/**
 * Crescent: the disc (cx, cy, r) minus the disc offset by (ox, oy) with radius r2.
 * The bite must overlap the disc edge (|o| + r2 > r and |o| < r + r2).
 */
export function crescent(cx: number, cy: number, r: number, ox: number, oy: number, r2: number): Path2D {
  const d = Math.hypot(ox, oy);
  const a = (r * r - r2 * r2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, r * r - a * a));
  const ux = ox / d;
  const uy = oy / d;
  const px = a * ux;
  const py = a * uy;
  const p1: [number, number] = [px - h * uy, py + h * ux];
  const p2: [number, number] = [px + h * uy, py - h * ux];
  const t1 = Math.atan2(p1[1], p1[0]);
  const t2 = Math.atan2(p2[1], p2[0]);
  const f1 = Math.atan2(p1[1] - oy, p1[0] - ox);
  const f2 = Math.atan2(p2[1] - oy, p2[0] - ox);
  const p = new Path2D();
  // Long way round the outer disc (away from the bite), then back along the bite's edge.
  p.arc(cx, cy, r, t1, t2, false);
  p.arc(cx + ox, cy + oy, r2, f2, f1, true);
  p.closePath();
  return p;
}

/** Closed polygon through the given points. */
export function poly(points: readonly (readonly [number, number])[]): Path2D {
  const p = new Path2D();
  points.forEach(([x, y], i) => (i === 0 ? p.moveTo(x, y) : p.lineTo(x, y)));
  p.closePath();
  return p;
}

/** Union of several paths (non-zero fill, draw every sub-path in the same winding). */
export function union(...paths: Path2D[]): Path2D {
  const p = new Path2D();
  for (const q of paths) p.addPath(q);
  return p;
}

// ───────────────────────────── Inked shapes ─────────────────────────────

export interface InkStyle {
  fill: string | CanvasGradient | CanvasPattern;
  /** Colour of a shadow crescent along the lower-right edge. Omit for a flat fill. */
  shade?: string;
  /** Crescent thickness in px [dx, dy]. */
  shadeOffset?: readonly [number, number];
  /** Outline width (0 = no outline). */
  line?: number;
  stroke?: string;
  /**
   * Draw the outline *behind* the fill (at double width) so only the outer silhouette shows.
   * Needed for unions of overlapping shapes (fluffy fur, curls, clouds).
   */
  behind?: boolean;
}

/**
 * The house style: flat fill, a soft shadow crescent on the lower-right (drawn by filling the
 * shade colour and re-filling the base colour shifted up-left, clipped to the shape) and a
 * thick rounded ink outline.
 */
export function ink(g: Ctx, path: Path2D, s: InkStyle): void {
  const w = s.line ?? LINE;
  if (s.behind && w > 0) outline(g, path, w * 2, s.stroke);
  g.save();
  if (s.shade) {
    g.fillStyle = s.shade;
    g.fill(path);
    g.clip(path);
    const [dx, dy] = s.shadeOffset ?? [6, 8];
    g.translate(-dx, -dy);
    g.fillStyle = s.fill;
    g.fill(path);
  } else {
    g.fillStyle = s.fill;
    g.fill(path);
  }
  g.restore();
  if (!s.behind && w > 0) outline(g, path, w, s.stroke);
}

export function outline(g: Ctx, path: Path2D, width = LINE, color: string = INK): void {
  g.save();
  g.lineWidth = width;
  g.lineJoin = 'round';
  g.lineCap = 'round';
  g.strokeStyle = color;
  g.stroke(path);
  g.restore();
}

export function fill(g: Ctx, path: Path2D, color: string | CanvasGradient | CanvasPattern): void {
  g.fillStyle = color;
  g.fill(path);
}

/** Runs `draw` with the canvas clipped to `path`. */
export function clipped(g: Ctx, path: Path2D, draw: () => void): void {
  g.save();
  g.clip(path);
  draw();
  g.restore();
}

/** Stroke an open path (curves, creases, mouths) with round caps. */
export function line(g: Ctx, path: Path2D, width: number, color: string = INK): void {
  outline(g, path, width, color);
}

/** Soft white gloss blob (for shiny things: gems, eyes, cheeks, metal). */
export function gloss(g: Ctx, cx: number, cy: number, rx: number, ry: number, alpha = 0.7, rotation = -0.5): void {
  g.fillStyle = rgba('#FFFFFF', alpha);
  g.fill(ellipse(cx, cy, rx, ry, rotation));
}

/** Runs `draw` inside save/translate/rotate/scale/restore. */
export function at(g: Ctx, x: number, y: number, rotation: number, scale: number, draw: () => void): void {
  g.save();
  g.translate(x, y);
  if (rotation) g.rotate(rotation);
  if (scale !== 1) g.scale(scale, scale);
  draw();
  g.restore();
}

// ───────────────────────────── Decorations ─────────────────────────────

/** Four-pointed twinkle star. */
export function sparklePath(x: number, y: number, r: number): Path2D {
  const k = r * 0.28;
  return svg(
    `M ${x} ${y - r} Q ${x + k} ${y - k} ${x + r} ${y} Q ${x + k} ${y + k} ${x} ${y + r} ` +
      `Q ${x - k} ${y + k} ${x - r} ${y} Q ${x - k} ${y - k} ${x} ${y - r} Z`,
  );
}

export function sparkle(g: Ctx, x: number, y: number, r: number, color: string): void {
  fill(g, sparklePath(x, y, r), color);
}

/** Sun rays radiating from (cx, cy): alternate wedges in `color` over whatever is below. */
export function sunburst(g: Ctx, cx: number, cy: number, radius: number, rays: number, color: string, rotation = 0): void {
  g.fillStyle = color;
  g.beginPath();
  const step = TAU / rays;
  for (let i = 0; i < rays; i += 2) {
    const a0 = rotation + i * step;
    g.moveTo(cx, cy);
    g.arc(cx, cy, radius, a0, a0 + step);
    g.closePath();
  }
  g.fill();
}

/** Soft radial glow (a radial gradient disc fading to transparent). */
export function glow(g: Ctx, cx: number, cy: number, r: number, color: string, alpha = 0.8): void {
  const grad = g.createRadialGradient(cx, cy, 0, cx, cy, r);
  grad.addColorStop(0, rgba(color, alpha));
  grad.addColorStop(1, rgba(color, 0));
  g.fillStyle = grad;
  g.fillRect(cx - r, cy - r, r * 2, r * 2);
}

/** Regular grid of dots (subtle background texture). */
export function dotGrid(g: Ctx, x: number, y: number, w: number, h: number, gap: number, r: number, color: string): void {
  g.fillStyle = color;
  g.beginPath();
  for (let row = 0, py = y; py <= y + h; row++, py += gap) {
    const off = row % 2 ? gap / 2 : 0;
    for (let px = x + off; px <= x + w; px += gap) {
      g.moveTo(px + r, py);
      g.arc(px, py, r, 0, TAU);
    }
  }
  g.fill();
}

/**
 * The house eye shared by portraits and animal avatars: a glossy ink oval with a big and a
 * small glint. `glintDy` pushes the big glint down (e.g. under a heavy eyelid).
 */
export function glossyEye(g: Ctx, x: number, y: number, rx: number, ry: number, glintDy = 0): void {
  fill(g, ellipse(x, y, rx, ry), INK);
  fill(g, circle(x + rx * 0.3, y - ry * 0.38 + glintDy, rx * 0.4), '#FFFFFF');
  fill(g, circle(x - rx * 0.32, y + ry * 0.4, rx * 0.19), '#FFFFFF');
}

/** A gold coin seen from the front (used on the Duke card and as decoration). */
export function coin(g: Ctx, x: number, y: number, r: number, lineW = LINE * 0.7): void {
  const body = circle(x, y, r);
  ink(g, body, { fill: PALETTE.mustard, shade: PALETTE.mustardDark, shadeOffset: [r * 0.12, r * 0.16], line: lineW });
  outline(g, circle(x, y, r * 0.66), lineW * 0.55, PALETTE.mustardDark);
  gloss(g, x - r * 0.35, y - r * 0.4, r * 0.22, r * 0.14, 0.8);
  // Tiny star stamped in the middle.
  fill(g, sparklePath(x, y, r * 0.36), lighten(PALETTE.mustard, 0.55));
}
