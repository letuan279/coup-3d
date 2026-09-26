import { ellipse, fill, ink, svg } from '../draw';
import { mix } from '../color';
import { AL, C, bigEyes, cheeks, smileArc, type AnimalFn } from './common';

export const drawPig: AnimalFn = (g, { body, accent }) => {
  const shade = mix(body, accent, 0.45);
  for (const s of [-1, 1]) {
    const ear = svg(
      `M ${C + s * 34} 76 Q ${C + s * 58} 30 ${C + s * 98} 28 Q ${C + s * 106} 70 ${C + s * 86} 104 Z`,
    );
    ink(g, ear, { fill: body, shade, shadeOffset: [s * -4, 5], line: AL });
    fill(g, svg(`M ${C + s * 52} 76 Q ${C + s * 66} 48 ${C + s * 90} 44 Q ${C + s * 94} 70 ${C + s * 82} 90 Z`), mix(body, accent, 0.6));
  }
  ink(g, ellipse(C, 146, 94, 82), { fill: body, shade, shadeOffset: [9, 10], line: AL });
  bigEyes(g, 124, 40);
  cheeks(g, 160, 64, accent, 17, 0.55);
  ink(g, ellipse(C, 164, 34, 25), { fill: mix(body, accent, 0.3), shade: mix(body, accent, 0.55), shadeOffset: [0, 5], line: 6 });
  for (const s of [-1, 1]) fill(g, ellipse(C + s * 12, 164, 6, 9), accent);
  smileArc(g, 200, 14, 8, 5);
};
