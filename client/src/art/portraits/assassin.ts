/** Assassin: a hooded, masked figure with sly eyes and a big shiny dagger, under a crescent moon. */
import { CHARACTER_COLORS, PALETTE } from '../palette';
import { at, circle, crescent, ellipse, fill, gloss, ink, line, rrect, sparkle, svg, type Ctx } from '../draw';
import { mix } from '../color';
import { CX, brows, eyes, head, headPath, torsoPath, type Skin, SKINS, shine } from './figure';

const col = CHARACTER_COLORS.assassin;
const skin: Skin = SKINS.tan;
const HOOD = mix(col.main, '#FFFFFF', 0.1);
const MASK = '#B8364A';
const MASK_SHADE = '#86223A';
const STEEL = '#EEF2FA';
const STEEL_SHADE = '#AEB7CF';
const GLOVE = '#5B527A';

export function drawAssassinBackdrop(g: Ctx): void {
  ink(g, crescent(362, 84, 38, 16, -12, 32), { fill: PALETTE.gold, shade: PALETTE.mustardDark, shadeOffset: [4, 5], line: 5.5 });
  sparkle(g, 300, 48, 11, PALETTE.paper);
  sparkle(g, 404, 160, 8, PALETTE.paper);
  sparkle(g, 60, 70, 12, PALETTE.paper);
  sparkle(g, 36, 180, 7, PALETTE.paper);
}

function dagger(g: Ctx): void {
  at(g, 332, 318, 0.36, 1, () => {
    const blade = svg('M 0 -176 C 16 -154 21 -124 21 -98 L 21 -24 L -21 -24 L -21 -98 C -21 -124 -16 -154 0 -176 Z');
    ink(g, blade, { fill: STEEL, shade: STEEL_SHADE, shadeOffset: [8, 0], line: 6 });
    line(g, svg('M -2 -150 L -2 -34'), 5, STEEL_SHADE);
    shine(g, -10, -120, 6);
    shine(g, -11, -86, 3.5);
    ink(g, rrect(-46, -32, 92, 20, 10), { fill: PALETTE.gold, shade: PALETTE.mustardDark, shadeOffset: [3, 4], line: 5.5 });
    ink(g, circle(-46, -22, 9), { fill: PALETTE.gold, line: 5 });
    ink(g, circle(46, -22, 9), { fill: PALETTE.gold, line: 5 });
    ink(g, rrect(-12, -14, 24, 44, 7), { fill: PALETTE.wood, shade: PALETTE.woodDark, shadeOffset: [4, 0], line: 5 });
    ink(g, circle(0, 38, 13), { fill: PALETTE.gold, shade: PALETTE.mustardDark, shadeOffset: [2, 3], line: 5 });
    fill(g, circle(0, 38, 5.5), PALETTE.danger);
    // Gloved fist around the grip.
    ink(g, ellipse(-4, 8, 30, 24), { fill: GLOVE, shade: col.main, shadeOffset: [4, 4], line: 5.5 });
    for (const y of [-2, 12]) line(g, svg(`M -26 ${y} l 20 0`), 4, col.main);
    ink(g, ellipse(14, -2, 12, 9, 0.5), { fill: GLOVE, line: 5 });
  });
}

export function drawAssassin(g: Ctx): void {
  const hy = 186;

  // Cloak and a leather strap.
  ink(g, torsoPath(CX, 298, 360), { fill: col.main, shade: col.dark, shadeOffset: [14, 0] });
  g.save();
  g.clip(torsoPath(CX, 298, 360));
  line(g, svg(`M ${CX - 150} 300 L ${CX + 120} 440`), 30, PALETTE.ink);
  line(g, svg(`M ${CX - 150} 300 L ${CX + 120} 440`), 18, PALETTE.woodDark);
  g.restore();
  ink(g, rrect(CX - 58, 334, 30, 26, 6), { fill: PALETTE.gold, line: 4.5 });

  // Hood back and shadowy opening.
  const hood = svg(
    `M ${CX + 24} ${hy - 138} ` +
      `C ${CX + 100} ${hy - 124} ${CX + 138} ${hy - 44} ${CX + 132} ${hy + 40} ` +
      `C ${CX + 128} ${hy + 92} ${CX + 118} ${hy + 112} ${CX + 168} ${hy + 138} ` +
      `L ${CX - 168} ${hy + 138} ` +
      `C ${CX - 118} ${hy + 112} ${CX - 128} ${hy + 92} ${CX - 132} ${hy + 40} ` +
      `C ${CX - 138} ${hy - 50} ${CX - 76} ${hy - 132} ${CX + 24} ${hy - 138} Z`,
  );
  ink(g, hood, { fill: HOOD, shade: col.dark, shadeOffset: [12, 6] });
  fill(g, ellipse(CX, hy + 14, 94, 100), col.dark);

  // Face with a cloth mask over the lower half.
  const face = headPath(CX, hy + 20, 82, 82);
  head(g, CX, hy + 20, 82, 82, skin);
  g.save();
  g.clip(face);
  const mask = svg(`M ${CX - 90} ${hy + 40} Q ${CX - 40} ${hy + 26} ${CX} ${hy + 34} Q ${CX + 40} ${hy + 26} ${CX + 90} ${hy + 40} L ${CX + 90} ${hy + 120} L ${CX - 90} ${hy + 120} Z`);
  ink(g, mask, { fill: MASK, shade: MASK_SHADE, shadeOffset: [8, 0], line: 6 });
  line(g, svg(`M ${CX - 28} ${hy + 70} Q ${CX} ${hy + 78} ${CX + 32} ${hy + 66}`), 4, MASK_SHADE);
  g.restore();

  eyes(g, CX, hy + 8, 32, { look: [6, 0], rx: 13, ry: 16, lids: 0.26, lidColor: skin.base });
  brows(g, CX + 5, hy - 18, 32, 7, PALETTE.ink, 8, 16);

  // Hood rim over the forehead (ring = hood outline minus the face opening).
  const rim = new Path2D(hood);
  rim.moveTo(CX + 94, hy + 14);
  rim.ellipse(CX, hy + 14, 94, 100, 0, 0, Math.PI * 2, true);
  ink(g, rim, { fill: HOOD, shade: col.dark, shadeOffset: [10, 6] });
  // Fold lines on the hood.
  line(g, svg(`M ${CX + 24} ${hy - 136} Q ${CX + 10} ${hy - 110} ${CX + 12} ${hy - 84}`), 5, col.dark);
  line(g, svg(`M ${CX - 118} ${hy + 30} Q ${CX - 106} ${hy + 76} ${CX - 116} ${hy + 110}`), 5, col.dark);
  gloss(g, CX - 70, hy - 88, 12, 28, 0.16, 0.7);

  dagger(g);
}
