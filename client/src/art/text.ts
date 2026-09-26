/**
 * Text fitting for canvas-drawn labels. The layout functions are pure (they take a `measure`
 * callback) so they can be unit-tested without a canvas.
 */
import type { Ctx } from './draw';

/** Width of `text` rendered at font size `size` (px). */
export type Measure = (text: string, size: number) => number;

export interface TextLayout {
  size: number;
  lines: string[];
}

/** Separator used in ability lines ("Tax +3 coins · Blocks Foreign Aid"). Preferred break point. */
const SEP = ' · ';

export function fontSpec(weight: number, size: number, family: string): string {
  return `${weight} ${size}px ${family}`;
}

/** Largest integer size in [min, max] at which `text` fits `maxWidth`; `min` if nothing fits. */
export function fitSize(text: string, measure: Measure, maxWidth: number, max: number, min: number): number {
  for (let s = max; s > min; s--) if (measure(text, s) <= maxWidth) return s;
  return min;
}

/** Greedy word wrap at one size. A single word wider than maxWidth gets its own line. */
export function wrapWords(text: string, measure: Measure, size: number, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (cur && measure(next, size) > maxWidth) {
      lines.push(cur);
      cur = w;
    } else {
      cur = next;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

/**
 * Break at " · " separators first (packing whole segments greedily), then wrap words inside a
 * segment that is too wide. With `mixSegments` false a wrapped segment's last line is never
 * joined with the next segment, so "A b c · D" never becomes "A b / c · D".
 */
function breakLines(text: string, measure: Measure, size: number, maxWidth: number, mixSegments: boolean): string[] {
  if (measure(text, size) <= maxWidth) return [text];
  const lines: string[] = [];
  let cur = '';
  for (const seg of text.split(SEP)) {
    const next = cur ? `${cur}${SEP}${seg}` : seg;
    if (measure(next, size) <= maxWidth) {
      cur = next;
      continue;
    }
    if (cur) lines.push(cur);
    if (measure(seg, size) <= maxWidth) {
      cur = seg;
    } else {
      const wrapped = wrapWords(seg, measure, size, maxWidth);
      if (mixSegments) {
        cur = wrapped.pop() ?? '';
        lines.push(...wrapped);
      } else {
        lines.push(...wrapped);
        cur = '';
      }
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

/**
 * Largest font size in [min, max] at which `text` fits in at most `maxLines` lines of
 * `maxWidth`. When nothing fits, returns the `min`-size layout (callers pass maxWidth to
 * fillText so the browser squeezes any leftover overflow horizontally).
 */
export function layoutText(
  text: string,
  measure: Measure,
  maxWidth: number,
  maxLines: number,
  max: number,
  min: number,
): TextLayout {
  // Prefer clean separator breaks at any size; only then allow segments to share a line.
  for (const mix of [false, true]) {
    for (let size = max; size >= min; size--) {
      const lines = breakLines(text, measure, size, maxWidth, mix);
      if (lines.length <= maxLines && lines.every((l) => measure(l, size) <= maxWidth)) return { size, lines };
    }
  }
  const lines = breakLines(text, measure, min, maxWidth, true);
  if (lines.length <= maxLines) return { size: min, lines };
  // Still too many lines: merge the tail into the last allowed line (squeezed when drawn).
  const head = lines.slice(0, maxLines - 1);
  head.push(lines.slice(maxLines - 1).join(' '));
  return { size: min, lines: head };
}

/** A canvas-backed Measure for one font weight/family. */
export function canvasMeasure(g: Ctx, weight: number, family: string): Measure {
  return (text, size) => {
    g.font = fontSpec(weight, size, family);
    return g.measureText(text).width;
  };
}

/** Actual glyph ink extent above/below the alphabetic baseline for `text` in the current g.font. */
function inkBounds(g: Ctx, text: string, size: number): { asc: number; desc: number } {
  const m = g.measureText(text);
  return {
    asc: Number.isFinite(m.actualBoundingBoxAscent) ? m.actualBoundingBoxAscent : size * 0.72,
    desc: Number.isFinite(m.actualBoundingBoxDescent) ? m.actualBoundingBoxDescent : size * 0.12,
  };
}

/**
 * Vertical offset that centres the actual glyph ink of `text` (as currently set in g.font) on a
 * y coordinate, with textBaseline 'alphabetic'. Uses real glyph bounds so Vietnamese stacked
 * diacritics don't push the word off-centre; falls back to font metrics when unavailable.
 */
export function inkCenterOffset(g: Ctx, text: string, size: number): number {
  const { asc, desc } = inkBounds(g, text, size);
  return (asc - desc) / 2;
}

/** Height of the actual glyph ink of `text` (as currently set in g.font). */
export function textInkHeight(g: Ctx, text: string, size: number): number {
  const { asc, desc } = inkBounds(g, text, size);
  return asc + desc;
}
