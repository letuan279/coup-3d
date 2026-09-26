/** Ambassador: a friendly diplomat with round glasses, a sash and medal, a sealed scroll and a dove. */
import { CHARACTER_COLORS, PALETTE } from '../palette';
import { at, circle, ellipse, fill, ink, line, poly, rrect, sparkle, svg, union, type Ctx } from '../draw';
import { darken, rgba } from '../color';
import { CX, blush, ears, eyes, hand, head, smile, torsoPath, type Skin, SKINS } from './figure';

const col = CHARACTER_COLORS.ambassador;
const skin: Skin = SKINS.deep;
const HAIR = '#2E2230';
const HAIR_SHADE = '#1C141E';
const PARCHMENT = '#FFF0CC';
const PARCHMENT_SHADE = '#E8C98C';
const DOVE = '#FFFFFF';
const DOVE_SHADE = '#DCE3F0';

function leaf(g: Ctx, x: number, y: number, rot: number, len: number): void {
  at(g, x, y, rot, 1, () => {
    ink(g, svg(`M 0 0 Q ${len * 0.5} ${-len * 0.42} ${len} 0 Q ${len * 0.5} ${len * 0.42} 0 0 Z`), {
      fill: PALETTE.success,
      line: 4,
    });
  });
}

export function drawAmbassadorBackdrop(g: Ctx): void {
  sparkle(g, 66, 70, 13, PALETTE.paper);
  sparkle(g, 372, 52, 10, PALETTE.paper);
  sparkle(g, 40, 200, 8, PALETTE.paper);
  leaf(g, 374, 132, -0.6, 30);
  leaf(g, 50, 128, 2.6, 26);
}

function scroll(g: Ctx): void {
  at(g, 104, 330, -0.38, 1, () => {
    const sheet = rrect(-58, -34, 116, 68, 4);
    ink(g, sheet, { fill: PARCHMENT, shade: PARCHMENT_SHADE, shadeOffset: [0, 8], line: 6 });
    for (const y of [-14, 0, 14]) line(g, svg(`M -38 ${y} L 30 ${y}`), 4, PARCHMENT_SHADE);
    for (const s of [-1, 1]) {
      ink(g, rrect(s * 62 - 13, -44, 26, 88, 13), { fill: PARCHMENT, shade: PARCHMENT_SHADE, shadeOffset: [4, 0], line: 6 });
      fill(g, ellipse(s * 62, -40, 7, 3), PARCHMENT_SHADE);
    }
    // Ribbon tails and wax seal.
    ink(g, poly([[14, 22], [4, 58], [16, 52], [24, 62], [28, 24]]), { fill: PALETTE.danger, line: 4.5 });
    ink(g, circle(20, 20, 16), { fill: PALETTE.danger, shade: darken(PALETTE.danger, 0.3), shadeOffset: [2, 3], line: 5 });
    fill(g, circle(20, 20, 7), darken(PALETTE.danger, 0.25));
  });
  hand(g, 128, 360, 24, skin, -0.3);
}

function dove(g: Ctx): void {
  at(g, 336, 256, 0, 1, () => {
    // Tail, body, wing, head (facing left toward the ambassador).
    ink(g, poly([[34, 6], [78, -14], [80, 12], [44, 24]]), { fill: DOVE, shade: DOVE_SHADE, shadeOffset: [0, 4], line: 5.5 });
    ink(g, ellipse(8, 10, 46, 30, -0.1), { fill: DOVE, shade: DOVE_SHADE, shadeOffset: [4, 6], line: 6 });
    const wing = svg('M -8 0 C 10 -30 46 -34 62 -22 C 50 -12 40 8 14 18 C 2 20 -10 12 -8 0 Z');
    ink(g, wing, { fill: DOVE, shade: DOVE_SHADE, shadeOffset: [3, 5], line: 5.5 });
    line(g, svg('M 16 -8 Q 30 -14 44 -16'), 3.5, DOVE_SHADE);
    ink(g, circle(-32, -14, 20), { fill: DOVE, shade: DOVE_SHADE, shadeOffset: [3, 4], line: 6 });
    // Beak holding an olive sprig.
    line(g, svg('M -52 -2 Q -64 12 -58 30'), 4, PALETTE.feltDark);
    leaf(g, -58, 14, 2.4, 22);
    leaf(g, -60, 26, 0.8, 18);
    ink(g, poly([[-50, -18], [-68, -8], [-48, -6]]), { fill: PALETTE.mustard, line: 4.5 });
    fill(g, circle(-36, -20, 5), PALETTE.ink);
    fill(g, circle(-34.5, -21.5, 1.8), '#FFFFFF');
    fill(g, ellipse(-28, -6, 6, 3.5), rgba(PALETTE.pink, 0.8));
  });
  // Feet gripping the shoulder.
  for (const x of [330, 346]) line(g, svg(`M ${x} 288 l -4 10 M ${x} 288 l 4 10`), 4, PALETTE.coralDark);
}

export function drawAmbassador(g: Ctx): void {
  const hy = 184;

  // Coat, shirt, bow tie, sash and medal.
  const coat = torsoPath(CX, 296, 356);
  ink(g, coat, { fill: col.main, shade: col.dark, shadeOffset: [14, 0] });
  ink(g, svg(`M ${CX - 40} 288 L ${CX + 40} 288 L ${CX} 430 Z`), { fill: PALETTE.paper, line: 6 });
  for (const s of [-1, 1]) {
    ink(g, svg(`M ${CX + s * 40} 290 L ${CX + s * 6} 430 L ${CX + s * 44} 430 L ${CX + s * 78} 300 Z`), {
      fill: col.dark,
      line: 6,
    });
  }
  // Sash from the right shoulder across the chest, with a star medal pinned on it.
  g.save();
  g.clip(coat);
  const sash = svg(`M ${CX + 176} 318 L ${CX + 128} 290 L ${CX - 150} 430 L ${CX - 90} 450 Z`);
  ink(g, sash, { fill: PALETTE.gold, shade: PALETTE.mustardDark, shadeOffset: [0, 6], line: 6 });
  line(g, svg(`M ${CX + 150} 318 L ${CX - 110} 448`), 5, PALETTE.danger);
  g.restore();
  const star: [number, number][] = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const r = i % 2 ? 10 : 22;
    star.push([CX + 70 + Math.cos(a) * r, 350 + Math.sin(a) * r]);
  }
  ink(g, poly(star), { fill: PALETTE.gold, shade: PALETTE.mustardDark, shadeOffset: [2, 3], line: 4.5 });
  fill(g, circle(CX + 70, 350, 6), PALETTE.danger);
  const bow = union(poly([[CX, 296], [CX - 30, 282], [CX - 30, 312]]), poly([[CX, 296], [CX + 30, 282], [CX + 30, 312]]));
  ink(g, bow, { fill: PALETTE.danger, line: 5 });
  ink(g, circle(CX, 296, 8), { fill: PALETTE.danger, line: 4.5 });

  // Head and short curly hair.
  ears(g, CX, hy + 14, 84, skin);
  head(g, CX, hy, 84, 86, skin);
  const curls: Path2D[] = [];
  for (let i = 0; i <= 8; i++) {
    const a = Math.PI * (1.04 + (0.92 * i) / 8);
    curls.push(circle(CX + Math.cos(a) * 76, hy - 18 + Math.sin(a) * 74, i % 2 ? 26 : 29));
  }
  curls.push(ellipse(CX, hy - 70, 64, 30));
  ink(g, union(...curls), { fill: HAIR, shade: HAIR_SHADE, shadeOffset: [0, 5], line: 6, behind: true });

  // Face: kind eyes behind round glasses, smile and a neat goatee.
  eyes(g, CX, hy + 8, 34, { rx: 11, ry: 13 });
  for (const s of [-1, 1]) {
    fill(g, circle(CX + s * 36, hy + 8, 26), rgba('#FFFFFF', 0.22));
    line(g, circle(CX + s * 36, hy + 8, 26), 12);
    line(g, circle(CX + s * 36, hy + 8, 26), 5.5, PALETTE.gold);
    line(g, svg(`M ${CX + s * 36 - 14} ${hy - 4} l 8 -6`), 4, rgba('#FFFFFF', 0.9));
    line(g, svg(`M ${CX + s * 62} ${hy + 4} L ${CX + s * 84} ${hy - 2}`), 5.5, PALETTE.ink);
  }
  line(g, svg(`M ${CX - 10} ${hy + 4} Q ${CX} ${hy - 4} ${CX + 10} ${hy + 4}`), 5.5, PALETTE.ink);
  blush(g, CX, hy + 42, 58, skin, 15);
  fill(g, ellipse(CX, hy + 32, 11, 8), skin.shade);
  smile(g, CX, hy + 52, 22, 14, 5.5);

  scroll(g);
  dove(g);
}
