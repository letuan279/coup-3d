import { circle, clipped, ellipse, fill, ink, line, poly, svg, union, INK } from '../draw';
import { darken, lighten } from '../color';
import { PALETTE } from '../palette';
import { AL, C, cheeks, type AnimalFn } from './common';

export const drawOwl: AnimalFn = (g, { body, accent }) => {
  const shade = darken(body, 0.22);
  for (const s of [-1, 1]) {
    const tuft = svg(`M ${C + s * 34} 80 Q ${C + s * 64} 52 ${C + s * 100} 22 Q ${C + s * 100} 66 ${C + s * 86} 104 Z`);
    ink(g, tuft, { fill: body, shade, shadeOffset: [s * -4, 5], line: AL });
  }
  const head = ellipse(C, 148, 98, 88);
  ink(g, head, { fill: body, shade, shadeOffset: [9, 10], line: AL });
  // Chest feathers.
  clipped(g, head, () => {
    for (const [x, y] of [[C - 30, 212], [C, 222], [C + 30, 212], [C - 15, 196], [C + 15, 196]] as const) {
      line(g, svg(`M ${x - 10} ${y} Q ${x} ${y + 9} ${x + 10} ${y}`), 4.5, lighten(body, 0.35));
    }
  });
  // Facial discs and big yellow eyes.
  const discs = union(circle(C - 38, 132, 42), circle(C + 38, 132, 42));
  ink(g, discs, { fill: lighten(body, 0.6), line: 5.5, behind: true });
  for (const s of [-1, 1]) {
    const x = C + s * 38;
    ink(g, circle(x, 132, 27), { fill: accent, shade: PALETTE.mustardDark, shadeOffset: [0, 4], line: 5 });
    fill(g, ellipse(x, 134, 14, 16), INK);
    fill(g, circle(x + 5, 127, 6), '#FFFFFF');
    fill(g, circle(x - 4, 141, 2.8), '#FFFFFF');
  }
  ink(g, poly([[C - 13, 160], [C + 13, 160], [C, 184]]), { fill: PALETTE.coral, shade: PALETTE.coralDark, shadeOffset: [2, 3], line: 5 });
  cheeks(g, 174, 72, '#FF7E9B', 13, 0.45);
};
