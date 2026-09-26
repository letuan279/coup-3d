import { clipped, ellipse, fill, gloss, ink, outline, poly, svg, INK } from '../draw';
import { darken } from '../color';
import { AL, C, bigEyes, cheeks, wMouth, type AnimalFn } from './common';

export const drawFox: AnimalFn = (g, { body, accent }) => {
  const shade = darken(body, 0.18);
  for (const s of [-1, 1]) {
    ink(g, poly([[C + s * 34, 76], [C + s * 84, 14], [C + s * 98, 104]]), { fill: body, shade, shadeOffset: [s * -4, 6], line: AL });
    fill(g, poly([[C + s * 52, 76], [C + s * 80, 38], [C + s * 86, 92]]), '#5A2C24');
  }
  const head = svg(
    `M ${C} 62 C ${C + 50} 62 ${C + 80} 90 ${C + 86} 124 L ${C + 110} 152 L ${C + 80} 160 ` +
      `C ${C + 70} 196 ${C + 38} 218 ${C} 218 C ${C - 38} 218 ${C - 70} 196 ${C - 80} 160 ` +
      `L ${C - 110} 152 L ${C - 86} 124 C ${C - 80} 90 ${C - 50} 62 ${C} 62 Z`,
  );
  ink(g, head, { fill: body, shade, shadeOffset: [8, 9], line: 0 });
  clipped(g, head, () => {
    const muzzle = svg(
      `M ${C - 100} 150 C ${C - 60} 142 ${C - 24} 150 ${C} 176 C ${C + 24} 150 ${C + 60} 142 ${C + 100} 150 L ${C + 100} 240 L ${C - 100} 240 Z`,
    );
    ink(g, muzzle, { fill: accent, shade: darken(accent, 0.1), shadeOffset: [0, 8], line: 5 });
  });
  outline(g, head, AL);
  bigEyes(g, 128, 40);
  cheeks(g, 170, 58, '#FF7E9B', 14, 0.4);
  fill(g, ellipse(C, 176, 13, 9), INK);
  gloss(g, C - 4, 173, 4, 2.5, 0.8);
  wMouth(g, 188, 11, 4.5);
};
