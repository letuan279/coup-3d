/** Tiny colour utilities for the procedural art (hex #RRGGBB in, hex/rgba out). */

type RGB = readonly [number, number, number];

export function parseHex(hex: string): RGB {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = Number.parseInt(full.slice(0, 6), 16);
  if (Number.isNaN(n)) return [0, 0, 0];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function toHex([r, g, b]: RGB): string {
  const c = (v: number) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`.toUpperCase();
}

/** Linear blend: t = 0 → a, t = 1 → b. */
export function mix(a: string, b: string, t: number): string {
  const x = parseHex(a);
  const y = parseHex(b);
  return toHex([x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t]);
}

export function lighten(c: string, t: number): string {
  return mix(c, '#FFFFFF', t);
}

/** Darken towards the ink colour (keeps shadows warm/purple instead of muddy grey). */
export function darken(c: string, t: number): string {
  return mix(c, '#2B2140', t);
}

export function rgba(c: string, alpha: number): string {
  const [r, g, b] = parseHex(c);
  return `rgba(${r},${g},${b},${alpha})`;
}
