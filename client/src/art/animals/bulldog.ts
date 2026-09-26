import { ellipse, fill, gloss, ink, line, poly, svg, union, INK } from '../draw';
import { lighten, mix } from '../color';
import { PALETTE } from '../palette';
import { AL, C, bigEyes, cheeks, type AnimalFn } from './common';

export const drawBulldog: AnimalFn = (g, { body, accent }) => {
  const shade = mix(body, accent, 0.4);
  for (const s of [-1, 1]) {
    ink(g, ellipse(C + s * 84, 84, 32, 20, s * 0.7), { fill: accent, shade: mix(accent, INK, 0.2), shadeOffset: [0, 4], line: AL });
  }
  const head = svg(
    `M ${C} 62 C ${C + 64} 62 ${C + 90} 92 ${C + 92} 140 C ${C + 94} 192 ${C + 60} 222 ${C} 222 ` +
      `C ${C - 60} 222 ${C - 94} 192 ${C - 92} 140 C ${C - 90} 92 ${C - 64} 62 ${C} 62 Z`,
  );
  ink(g, head, { fill: body, shade, shadeOffset: [9, 10], line: AL });
  // Eye patch and forehead wrinkles.
  fill(g, ellipse(C + 42, 120, 30, 27, 0.3), mix(body, accent, 0.55));
  for (const [dy, w] of [[0, 20], [11, 14]] as const) {
    line(g, svg(`M ${C - w} ${84 + dy} Q ${C} ${78 + dy} ${C + w} ${84 + dy}`), 4.5, accent);
  }
  bigEyes(g, 124, 42, 13, 16);
  // Jowls, nose and an underbite with two tiny teeth.
  const jowls = union(ellipse(C - 30, 178, 38, 28), ellipse(C + 30, 178, 38, 28));
  ink(g, jowls, { fill: lighten(body, 0.45), shade: lighten(body, 0.2), shadeOffset: [0, 6], line: 6, behind: true });
  const mouth = svg(`M ${C - 26} 198 Q ${C} 214 ${C + 26} 198 Q ${C} 190 ${C - 26} 198 Z`);
  ink(g, mouth, { fill: '#9C2F45', line: 5 });
  for (const s of [-1, 1]) {
    ink(g, poly([[C + s * 18, 200], [C + s * 12, 188], [C + s * 6, 202]]), { fill: PALETTE.paper, line: 3.5 });
  }
  ink(g, ellipse(C, 158, 24, 15), { fill: INK, line: 0 });
  gloss(g, C - 8, 153, 7, 3.5, 0.75);
  cheeks(g, 162, 70, '#FF7E9B', 14, 0.4);
};
