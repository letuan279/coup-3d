import { ellipse, fill, ink, rrect, svg } from '../draw';
import { darken, mix } from '../color';
import { PALETTE } from '../palette';
import { AL, C, bigEyes, cheeks, wMouth, type AnimalFn } from './common';

export const drawBunny: AnimalFn = (g, { body, accent }) => {
  const shade = mix(body, '#B9B0E0', 0.45);
  for (const s of [-1, 1]) {
    const rot = s * 0.2;
    ink(g, ellipse(C + s * 36, 62, 22, 56, rot), { fill: body, shade, shadeOffset: [s * -4, 5], line: AL });
    fill(g, ellipse(C + s * 36, 66, 11, 40, rot), accent);
  }
  ink(g, ellipse(C, 160, 88, 76), { fill: body, shade, shadeOffset: [9, 10], line: AL });
  bigEyes(g, 148, 38);
  cheeks(g, 180, 60, accent, 17, 0.6);
  const nose = svg(`M ${C - 10} 170 Q ${C} 164 ${C + 10} 170 Q ${C + 4} 182 ${C} 182 Q ${C - 4} 182 ${C - 10} 170 Z`);
  ink(g, nose, { fill: darken(accent, 0.1), line: 4 });
  wMouth(g, 188, 11, 4.5);
  for (const s of [-1, 1]) ink(g, rrect(C + (s < 0 ? -12 : 0), 190, 12, 15, 3), { fill: PALETTE.paper, line: 4 });
};
