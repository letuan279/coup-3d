import { circle, clipped, ellipse, fill, ink, line, svg, union, INK } from '../draw';
import { darken } from '../color';
import { AL, C, cheeks, type AnimalFn } from './common';

export const drawFrog: AnimalFn = (g, { body, accent }) => {
  const shade = darken(body, 0.2);
  const head = union(ellipse(C, 156, 104, 70), circle(C - 50, 96, 38), circle(C + 50, 96, 38));
  ink(g, head, { fill: body, shade, shadeOffset: [8, 10], line: AL, behind: true });
  // Pale chin.
  clipped(g, head, () => fill(g, ellipse(C, 214, 80, 34), accent));
  // Bulging eyes: pale eyeballs with big glossy pupils.
  for (const s of [-1, 1]) {
    const x = C + s * 50;
    ink(g, circle(x, 96, 27), { fill: accent, line: 5 });
    fill(g, ellipse(x + s * 2, 100, 15, 18), INK);
    fill(g, circle(x + s * 2 + 5, 93, 6.5), '#FFFFFF');
    fill(g, circle(x + s * 2 - 5, 108, 3), '#FFFFFF');
  }
  for (const s of [-1, 1]) fill(g, ellipse(C + s * 12, 144, 4, 3), darken(body, 0.45));
  line(g, svg(`M ${C - 70} 164 Q ${C} 204 ${C + 70} 164`), 6);
  cheeks(g, 170, 76, '#FF7E9B', 16, 0.5);
};
