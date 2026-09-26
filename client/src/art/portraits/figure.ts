/**
 * Shared building blocks for the card portraits so all five characters share one face style:
 * soft "mochi" head, big glossy ink eyes, blush, simple nose and mouth, mitten hands.
 *
 * Portrait space: PW × PH px (the card's portrait window). The name ribbon covers the bottom
 * ~36 px, so important content stays above y ≈ 385.
 */
import { circle, ellipse, fill, glossyEye, ink, line, svg, type Ctx } from '../draw';
import { rgba } from '../color';
import { PALETTE } from '../palette';

export const PW = 432;
export const PH = 424;
export const CX = PW / 2;

export interface Skin {
  base: string;
  shade: string;
  blush: string;
}

export const SKINS = {
  peach: { base: '#FFD8B5', shade: '#F2AE86', blush: '#FF8C9E' },
  fair: { base: '#FFE6D6', shade: '#F6BEA6', blush: '#FF8FA8' },
  tan: { base: '#F1B98E', shade: '#D8926A', blush: '#F0707E' },
  deep: { base: '#B5774F', shade: '#8E5636', blush: '#E0606E' },
} as const satisfies Record<string, Skin>;

/** Soft rounded head: slightly flattened top, full cheeks. */
export function headPath(cx: number, cy: number, rx: number, ry: number): Path2D {
  return svg(
    `M ${cx} ${cy - ry} ` +
      `C ${cx + rx * 0.78} ${cy - ry} ${cx + rx} ${cy - ry * 0.48} ${cx + rx} ${cy + ry * 0.06} ` +
      `C ${cx + rx} ${cy + ry * 0.64} ${cx + rx * 0.56} ${cy + ry} ${cx} ${cy + ry} ` +
      `C ${cx - rx * 0.56} ${cy + ry} ${cx - rx} ${cy + ry * 0.64} ${cx - rx} ${cy + ry * 0.06} ` +
      `C ${cx - rx} ${cy - ry * 0.48} ${cx - rx * 0.78} ${cy - ry} ${cx} ${cy - ry} Z`,
  );
}

export function head(g: Ctx, cx: number, cy: number, rx: number, ry: number, skin: Skin): void {
  ink(g, headPath(cx, cy, rx, ry), { fill: skin.base, shade: skin.shade, shadeOffset: [9, 10] });
}

export function ears(g: Ctx, cx: number, cy: number, dx: number, skin: Skin): void {
  for (const s of [-1, 1]) {
    const x = cx + s * dx;
    ink(g, ellipse(x, cy, 17, 22), { fill: skin.base, shade: skin.shade, shadeOffset: [s * -4, 4] });
    line(g, svg(`M ${x + s * 5} ${cy - 9} Q ${x - s * 3} ${cy} ${x + s * 5} ${cy + 9}`), 4, skin.shade);
  }
}

export interface EyeOpts {
  /** Shift of both eyes (glance direction). */
  look?: readonly [number, number];
  rx?: number;
  ry?: number;
  /** Eyelashes on the outer corners. */
  lashes?: boolean;
  /** Draw ^ ^ closed happy eyes instead. */
  happy?: boolean;
  /** Heavy upper lids covering this fraction of the eye (sly / sleepy look), drawn in `lidColor`. */
  lids?: number;
  lidColor?: string;
}

/** A pair of big glossy eyes with optional expression tweaks. */
export function eyes(g: Ctx, cx: number, cy: number, gap: number, o: EyeOpts = {}): void {
  const [lx, ly] = o.look ?? [0, 0];
  const rx = o.rx ?? 12;
  const ry = o.ry ?? 15;
  for (const s of [-1, 1] as const) {
    const x = cx + s * gap + lx;
    const y = cy + ly;
    if (o.happy) {
      line(g, svg(`M ${x - rx - 1} ${y + 4} Q ${x} ${y - ry} ${x + rx + 1} ${y + 4}`), 6.5);
      continue;
    }
    glossyEye(g, x, y, rx, ry, o.lids ? ry * o.lids : 0);
    if (o.lids) {
      // Lid slopes down towards the nose for a sly squint.
      const ly0 = y - ry + ry * 2 * o.lids;
      const lid = svg(`M ${x - rx - 4} ${y - ry - 4} L ${x + rx + 4} ${y - ry - 4} L ${x + rx + 4} ${ly0 - s * 4} L ${x - rx - 4} ${ly0 + s * 4} Z`);
      g.save();
      g.clip(ellipse(x, y, rx + 1, ry + 1));
      fill(g, lid, o.lidColor ?? '#FFFFFF');
      g.restore();
      line(g, svg(`M ${x - rx - 3} ${ly0 + s * 4} L ${x + rx + 3} ${ly0 - s * 4}`), 5);
    }
    if (o.lashes) {
      const ox = x + s * rx * 0.75;
      line(g, svg(`M ${ox} ${y - ry * 0.6} l ${s * 9} ${-7}`), 4.5);
      line(g, svg(`M ${ox + s * 2} ${y - ry * 0.1} l ${s * 10} ${-2}`), 4.5);
    }
  }
}

/** Thick eyebrows. `tilt` > 0 lowers the inner ends (stern / determined), < 0 raises them (worried). */
export function brows(g: Ctx, cx: number, cy: number, gap: number, tilt: number, color: string, width = 7, len = 14): void {
  for (const s of [-1, 1]) {
    const x = cx + s * gap;
    line(g, svg(`M ${x - s * len} ${cy + tilt} Q ${x} ${cy - 5} ${x + s * len} ${cy - tilt}`), width, color);
  }
}

export function blush(g: Ctx, cx: number, cy: number, gap: number, skin: Skin, rx = 17): void {
  for (const s of [-1, 1]) fill(g, ellipse(cx + s * gap, cy, rx, rx * 0.55), rgba(skin.blush, 0.5));
}

export function nose(g: Ctx, x: number, y: number, skin: Skin, r = 9): void {
  fill(g, ellipse(x, y, r, r * 0.78), skin.shade);
  fill(g, circle(x - r * 0.3, y - r * 0.3, r * 0.3), rgba('#FFFFFF', 0.55));
}

/** Open smiling mouth (D shape with tongue). */
export function openSmile(g: Ctx, cx: number, cy: number, w: number, depth = w * 1.1): void {
  const mouth = svg(`M ${cx - w} ${cy} Q ${cx} ${cy - w * 0.12} ${cx + w} ${cy} Q ${cx + w * 0.9} ${cy + depth} ${cx} ${cy + depth} Q ${cx - w * 0.9} ${cy + depth} ${cx - w} ${cy} Z`);
  g.save();
  fill(g, mouth, '#9C2F45');
  g.clip(mouth);
  fill(g, ellipse(cx, cy + depth * 0.95, w * 0.62, depth * 0.45), '#FF7D8E');
  g.restore();
  line(g, mouth, 5);
}

/** Closed smile curve. */
export function smile(g: Ctx, cx: number, cy: number, w: number, curve = 10, width = 5.5): void {
  line(g, svg(`M ${cx - w} ${cy} Q ${cx} ${cy + curve} ${cx + w} ${cy}`), width);
}

/** Round mitten hand; `rot` turns the thumb. */
export function hand(g: Ctx, x: number, y: number, r: number, skin: Skin, rot = 0): void {
  g.save();
  g.translate(x, y);
  g.rotate(rot);
  ink(g, ellipse(-r * 0.78, -r * 0.2, r * 0.42, r * 0.3, -0.6), { fill: skin.base, line: 5 });
  ink(g, ellipse(0, 0, r, r * 0.86), { fill: skin.base, shade: skin.shade, shadeOffset: [3, 4], line: 5.5 });
  for (const fy of [-0.28, 0.12]) line(g, svg(`M ${r * 0.25} ${r * fy} l ${r * 0.55} 0`), 3.5, skin.shade);
  g.restore();
}

/** Shoulders / torso block running off the bottom of the portrait. */
export function torsoPath(cx: number, top: number, width: number, radius = 90): Path2D {
  const x0 = cx - width / 2;
  const x1 = cx + width / 2;
  const bottom = PH + 40;
  return svg(
    `M ${x0} ${bottom} L ${x0} ${top + radius} Q ${x0} ${top} ${x0 + radius} ${top} ` +
      `L ${x1 - radius} ${top} Q ${x1} ${top} ${x1} ${top + radius} L ${x1} ${bottom} Z`,
  );
}

/** Small highlight used on shiny metal bits. */
export function shine(g: Ctx, x: number, y: number, r: number): void {
  fill(g, ellipse(x, y, r, r * 0.55, -0.6), rgba(PALETTE.paper, 0.85));
}
