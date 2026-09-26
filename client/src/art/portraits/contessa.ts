/** Contessa: an elegant lady with a tall updo, tiara, pearls, off-shoulder gown and a lace fan. */
import { CHARACTER_COLORS, PALETTE } from '../palette';
import { at, circle, ellipse, fill, gloss, ink, line, sparkle, svg, union, type Ctx } from '../draw';
import { darken, lighten } from '../color';
import { CX, blush, eyes, hand, head, torsoPath, type Skin, SKINS } from './figure';

const col = CHARACTER_COLORS.contessa;
const skin: Skin = SKINS.fair;
const HAIR = '#5B2F2C';
const HAIR_SHADE = '#3F1D1C';
const PEARL = '#FFFDF7';
const FAN = PALETTE.teal;
const FAN_LIGHT = lighten(PALETTE.teal, 0.3);
const GLOVE = PALETTE.paper;

function heart(x: number, y: number, s: number): Path2D {
  return svg(
    `M ${x} ${y + s * 0.9} C ${x - s * 1.4} ${y} ${x - s * 0.9} ${y - s * 1.1} ${x} ${y - s * 0.35} ` +
      `C ${x + s * 0.9} ${y - s * 1.1} ${x + s * 1.4} ${y} ${x} ${y + s * 0.9} Z`,
  );
}

export function drawContessaBackdrop(g: Ctx): void {
  sparkle(g, 60, 64, 13, PALETTE.paper);
  sparkle(g, 380, 176, 9, PALETTE.paper);
  ink(g, heart(372, 72, 16), { fill: lighten(col.main, 0.35), line: 4.5 });
  ink(g, heart(52, 200, 11), { fill: lighten(col.main, 0.35), line: 4 });
}

function pearls(g: Ctx, pts: readonly (readonly [number, number])[], r: number): void {
  for (const [x, y] of pts) {
    ink(g, circle(x, y, r), { fill: PEARL, shade: '#E4DCEB', shadeOffset: [1.5, 2], line: 3.5 });
  }
}

function fan(g: Ctx): void {
  const px = 322;
  const py = 356;
  const r = 104;
  const a0 = -Math.PI * 0.92;
  const a1 = -Math.PI * 0.22;
  const n = 8;
  const pt = (a: number, k: number): [number, number] => [px + Math.cos(a) * r * k, py + Math.sin(a) * r * k];
  // Lace edge scallops behind the pleats.
  const lace: Path2D[] = [];
  for (let i = 0; i <= n * 2; i++) {
    const [x, y] = pt(a0 + ((a1 - a0) * i) / (n * 2), 1.02);
    lace.push(circle(x, y, 9));
  }
  ink(g, union(...lace), { fill: PALETTE.paper, line: 4.5, behind: true });
  for (let i = 0; i < n; i++) {
    const s = a0 + ((a1 - a0) * i) / n;
    const e = a0 + ((a1 - a0) * (i + 1)) / n;
    const [x0, y0] = pt(s, 1);
    const [x1, y1] = pt(e, 1);
    const pleat = svg(`M ${px} ${py} L ${x0} ${y0} L ${x1} ${y1} Z`);
    ink(g, pleat, { fill: i % 2 ? FAN : FAN_LIGHT, line: 4.5 });
  }
  // Painted dots along the fan.
  for (let i = 0; i < n; i++) {
    const [x, y] = pt(a0 + ((a1 - a0) * (i + 0.5)) / n, 0.78);
    fill(g, circle(x, y, 5), i % 2 ? PALETTE.pink : PALETTE.paper);
  }
  ink(g, circle(px, py, 10), { fill: PALETTE.gold, line: 4.5 });
  // Gloved hand holding the pivot.
  hand(g, px + 6, py + 16, 24, { base: GLOVE, shade: '#E6DDEB', blush: GLOVE }, -0.5);
}

export function drawContessa(g: Ctx): void {
  const hy = 190;

  // Hair volume behind: big bun and hanging ringlets.
  ink(g, circle(CX, hy - 118, 52), { fill: HAIR, shade: HAIR_SHADE, shadeOffset: [8, 8] });
  line(g, svg(`M ${CX - 30} ${hy - 136} Q ${CX} ${hy - 150} ${CX + 26} ${hy - 128}`), 5, HAIR_SHADE);
  for (const s of [-1, 1]) {
    const ringlet = union(
      circle(CX + s * 96, hy + 30, 22),
      circle(CX + s * 100, hy + 64, 19),
      circle(CX + s * 96, hy + 94, 16),
      circle(CX + s * 92, hy + 120, 12),
    );
    ink(g, ringlet, { fill: HAIR, shade: HAIR_SHADE, shadeOffset: [s * -3, 4], line: 6, behind: true });
  }
  ink(g, ellipse(CX, hy - 20, 104, 92), { fill: HAIR, shade: HAIR_SHADE, shadeOffset: [8, 6] });

  // Shoulders (skin) and the gown with a sweetheart neckline.
  ink(g, torsoPath(CX, 312, 330, 100), { fill: skin.base, shade: skin.shade, shadeOffset: [10, 0] });
  const gown = svg(
    `M ${CX - 190} 440 L ${CX - 180} 350 Q ${CX - 120} 340 ${CX - 64} 356 Q ${CX - 30} 332 ${CX} 362 ` +
      `Q ${CX + 30} 332 ${CX + 64} 356 Q ${CX + 120} 340 ${CX + 180} 350 L ${CX + 190} 440 Z`,
  );
  ink(g, gown, { fill: col.main, shade: col.dark, shadeOffset: [14, 0] });
  // Gold-edged trim following the sweetheart neckline, with little bows of lace dots.
  const neckline = svg(
    `M ${CX - 180} 350 Q ${CX - 120} 340 ${CX - 64} 356 Q ${CX - 30} 332 ${CX} 362 ` +
      `Q ${CX + 30} 332 ${CX + 64} 356 Q ${CX + 120} 340 ${CX + 180} 350`,
  );
  line(g, neckline, 20);
  line(g, neckline, 11, PALETTE.gold);
  for (const x of [-120, -64, 64, 120]) fill(g, circle(CX + x, x % 120 === 0 ? 346 : 355, 4), PALETTE.paper);
  // Puff sleeves.
  for (const s of [-1, 1]) {
    ink(g, ellipse(CX + s * 170, 368, 42, 34, s * 0.4), { fill: col.main, shade: col.dark, shadeOffset: [s * -6, 6] });
    line(g, svg(`M ${CX + s * 150} 346 Q ${CX + s * 168} 368 ${CX + s * 160} 392`), 4, col.dark);
  }

  // Neck and pearl necklace.
  ink(g, svg(`M ${CX - 26} ${hy + 60} L ${CX - 30} 322 Q ${CX} 334 ${CX + 30} 322 L ${CX + 26} ${hy + 60} Z`), {
    fill: skin.base,
    shade: skin.shade,
    shadeOffset: [6, 0],
    line: 6,
  });
  const necklace: [number, number][] = [];
  for (let i = 0; i <= 6; i++) {
    const t = i / 6;
    necklace.push([CX - 30 + t * 60, 296 + Math.sin(t * Math.PI) * 12]);
  }
  pearls(g, necklace, 6);
  ink(g, circle(CX, 316, 9), { fill: PALETTE.danger, line: 4 });
  gloss(g, CX - 3, 313, 3, 2, 0.9);

  // Face.
  head(g, CX, hy, 80, 84, skin);
  // Centre-parted hair framing the forehead.
  for (const s of [-1, 1]) {
    const side = svg(
      `M ${CX} ${hy - 88} C ${CX + s * 50} ${hy - 96} ${CX + s * 90} ${hy - 62} ${CX + s * 86} ${hy + 4} ` +
        `C ${CX + s * 74} ${hy - 30} ${CX + s * 44} ${hy - 50} ${CX + s * 6} ${hy - 58} Z`,
    );
    ink(g, side, { fill: HAIR, shade: HAIR_SHADE, shadeOffset: [s * -3, 5] });
    gloss(g, CX + s * 46, hy - 70, 16, 6, 0.22, s * 0.5);
  }

  eyes(g, CX, hy + 10, 32, { look: [-6, 0], lashes: true, rx: 12, ry: 15 });
  line(g, svg(`M ${CX - 54} ${hy - 20} Q ${CX - 38} ${hy - 30} ${CX - 22} ${hy - 22}`), 5, HAIR);
  line(g, svg(`M ${CX + 10} ${hy - 22} Q ${CX + 26} ${hy - 30} ${CX + 42} ${hy - 20}`), 5, HAIR);
  blush(g, CX, hy + 40, 54, skin, 17);
  line(g, svg(`M ${CX - 4} ${hy + 30} Q ${CX} ${hy + 36} ${CX + 5} ${hy + 30}`), 4, skin.shade);
  // Red lips.
  const lips = svg(
    `M ${CX - 16} ${hy + 50} Q ${CX - 8} ${hy + 42} ${CX} ${hy + 47} Q ${CX + 8} ${hy + 42} ${CX + 16} ${hy + 50} Q ${CX} ${hy + 66} ${CX - 16} ${hy + 50} Z`,
  );
  ink(g, lips, { fill: col.main, shade: col.dark, shadeOffset: [0, 3], line: 4.5 });
  fill(g, circle(CX + 30, hy + 58, 3), HAIR);

  // Pearl earrings.
  for (const s of [-1, 1]) pearls(g, [[CX + s * 80, hy + 40], [CX + s * 80, hy + 56]], 6);

  // Tiara on top of the hair.
  at(g, CX, hy - 88, 0, 1, () => {
    const tiara = union(
      svg('M -58 10 Q 0 -16 58 10 L 50 18 Q 0 -2 -50 18 Z'),
      svg('M -16 2 L 0 -34 L 16 2 Z'),
      svg('M -46 8 L -34 -14 L -24 4 Z'),
      svg('M 46 8 L 34 -14 L 24 4 Z'),
    );
    ink(g, tiara, { fill: PALETTE.gold, shade: PALETTE.mustardDark, shadeOffset: [0, 3], line: 5, behind: true });
    ink(g, circle(0, -8, 9), { fill: PALETTE.sky, shade: darken(PALETTE.sky, 0.25), shadeOffset: [2, 2], line: 4.5 });
    gloss(g, -3, -11, 3, 2, 0.9);
    pearls(g, [[0, -38], [-34, -18], [34, -18]], 5);
  });

  fan(g);
}
