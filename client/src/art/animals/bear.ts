import { circle, ellipse, fill, gloss, ink, line, svg, INK } from '../draw';
import { darken } from '../color';
import { AL, C, bigEyes, cheeks, type AnimalFn } from './common';

export const drawBear: AnimalFn = (g, { body, accent }) => {
  const shade = darken(body, 0.2);
  for (const s of [-1, 1]) {
    ink(g, circle(C + s * 70, 74, 32), { fill: body, shade, shadeOffset: [s * -3, 5], line: AL });
    fill(g, circle(C + s * 70, 76, 17), accent);
  }
  ink(g, ellipse(C, 146, 94, 86), { fill: body, shade, shadeOffset: [9, 10], line: AL });
  bigEyes(g, 128, 38);
  cheeks(g, 164, 64, '#FF7E9B', 15, 0.45);
  ink(g, ellipse(C, 176, 42, 32), { fill: accent, shade: darken(accent, 0.12), shadeOffset: [0, 6], line: 6 });
  const nose = svg(`M ${C - 17} 160 Q ${C} 150 ${C + 17} 160 Q ${C + 12} 176 ${C} 178 Q ${C - 12} 176 ${C - 17} 160 Z`);
  fill(g, nose, INK);
  gloss(g, C - 5, 159, 5, 2.5, 0.75);
  line(g, svg(`M ${C} 178 L ${C} 186 M ${C - 13} 188 Q ${C - 6} 196 ${C} 186 Q ${C + 6} 196 ${C + 13} 188`), 4.5);
};
