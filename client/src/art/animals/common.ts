/**
 * Shared pieces for the 256 × 256 animal avatar heads. Heads are centred on (C, C) and built
 * from chunky primitive-like shapes (spheres → ellipses, cones → triangles) so they match the
 * 3D characters, with the same big glossy ink eyes as the card portraits.
 */
import { ellipse, fill, glossyEye, line, svg, type Ctx } from '../draw';
import { rgba } from '../color';

export const AVATAR_SIZE = 256;
export const C = AVATAR_SIZE / 2;
/** Outline width at avatar scale. */
export const AL = 7;

export interface AnimalColors {
  body: string;
  accent: string;
}

export type AnimalFn = (g: Ctx, c: AnimalColors) => void;

/** A pair of big glossy eyes (same eye as the card portraits). */
export function bigEyes(g: Ctx, cy: number, gap: number, rx = 14, ry = 17, cx = C): void {
  for (const s of [-1, 1]) glossyEye(g, cx + s * gap, cy, rx, ry);
}

export function cheeks(g: Ctx, cy: number, gap: number, color = '#FF7E9B', rx = 16, alpha = 0.45): void {
  for (const s of [-1, 1]) fill(g, ellipse(C + s * gap, cy, rx, rx * 0.6), rgba(color, alpha));
}

/** Little "w" cat/fox mouth under a nose. */
export function wMouth(g: Ctx, cy: number, w = 12, width = 5): void {
  line(g, svg(`M ${C - w} ${cy} Q ${C - w / 2} ${cy + w * 0.75} ${C} ${cy} Q ${C + w / 2} ${cy + w * 0.75} ${C + w} ${cy}`), width);
}

export function smileArc(g: Ctx, cy: number, w: number, curve: number, width = 5.5): void {
  line(g, svg(`M ${C - w} ${cy} Q ${C} ${cy + curve} ${C + w} ${cy}`), width);
}
