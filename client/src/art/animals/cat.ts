import { ellipse, fill, ink, line, poly, svg } from '../draw';
import { darken, mix } from '../color';
import { AL, C, bigEyes, cheeks, wMouth, type AnimalFn } from './common';

export const drawCat: AnimalFn = (g, { body, accent }) => {
  const shade = darken(body, 0.18);
  const stripe = darken(body, 0.3);
  for (const s of [-1, 1]) {
    ink(g, poly([[C + s * 36, 76], [C + s * 78, 20], [C + s * 96, 100]]), { fill: body, shade, shadeOffset: [s * -4, 6], line: AL });
    fill(g, poly([[C + s * 52, 76], [C + s * 76, 42], [C + s * 86, 90]]), accent);
  }
  const head = svg(
    `M ${C} 64 C ${C + 54} 64 ${C + 86} 94 ${C + 88} 134 L ${C + 104} 150 L ${C + 86} 160 ` +
      `C ${C + 78} 198 ${C + 44} 218 ${C} 218 C ${C - 44} 218 ${C - 78} 198 ${C - 86} 160 ` +
      `L ${C - 104} 150 L ${C - 88} 134 C ${C - 86} 94 ${C - 54} 64 ${C} 64 Z`,
  );
  ink(g, head, { fill: body, shade, shadeOffset: [8, 9], line: AL });
  // Forehead stripes.
  for (const [dx, len] of [[0, 26], [-20, 18], [20, 18]] as const) {
    line(g, svg(`M ${C + dx} 70 L ${C + dx * 0.9} ${70 + len}`), 6, stripe);
  }
  bigEyes(g, 130, 40);
  cheeks(g, 168, 62, '#FF7E9B', 14, 0.45);
  // Muzzle puffs, nose, mouth and whiskers.
  for (const s of [-1, 1]) ink(g, ellipse(C + s * 15, 176, 18, 14), { fill: mix(accent, '#FFFFFF', 0.3), line: 0 });
  const nose = svg(`M ${C - 10} 162 Q ${C} 158 ${C + 10} 162 Q ${C + 4} 172 ${C} 173 Q ${C - 4} 172 ${C - 10} 162 Z`);
  ink(g, nose, { fill: '#FF8FA3', line: 4 });
  wMouth(g, 176, 12, 4.5);
  for (const s of [-1, 1]) {
    for (const [y, dy] of [[168, -8], [178, 2]] as const) {
      line(g, svg(`M ${C + s * 38} ${y} L ${C + s * 78} ${y + dy}`), 3.5);
    }
  }
};
