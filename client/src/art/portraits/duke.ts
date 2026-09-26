/** Duke: a jolly, chubby noble with a jewelled crown, ermine-trimmed robe and a fat coin purse. */
import { CHARACTER_COLORS, PALETTE } from '../palette';
import { at, circle, coin, ellipse, fill, gloss, ink, line, rrect, svg, union, type Ctx } from '../draw';
import { darken, lighten } from '../color';
import { CX, blush, ears, eyes, head, hand, nose, openSmile, torsoPath, type Skin, SKINS } from './figure';

const col = CHARACTER_COLORS.duke;
const skin: Skin = SKINS.peach;
const HAIR = '#8A5634';
const HAIR_SHADE = '#693E23';
const FUR = PALETTE.paper;
const FUR_SHADE = '#E6DDF2';

function ermineSpots(g: Ctx, spots: readonly (readonly [number, number])[]): void {
  for (const [x, y] of spots) {
    fill(g, ellipse(x, y, 3.2, 6.5), PALETTE.ink);
    fill(g, circle(x, y - 6, 2.2), PALETTE.ink);
  }
}

export function drawDukeBackdrop(g: Ctx): void {
  coin(g, 62, 150, 18, 4.5);
  coin(g, 382, 74, 16, 4);
  coin(g, 392, 214, 13, 3.5);
  coin(g, 44, 238, 12, 3.5);
}

function crown(g: Ctx): void {
  at(g, CX, 108, -0.1, 1, () => {
    // Velvet cap showing between the points.
    ink(g, ellipse(0, -18, 56, 38), { fill: col.main, shade: col.dark, shadeOffset: [6, 8], line: 6 });
    const body = union(
      svg('M -64 4 L -76 -52 L -38 -22 L 0 -68 L 38 -22 L 76 -52 L 64 4 Z'),
      rrect(-70, -6, 140, 30, 10),
      circle(-78, -56, 10),
      circle(0, -74, 11),
      circle(78, -56, 10),
    );
    ink(g, body, { fill: PALETTE.gold, shade: PALETTE.mustardDark, shadeOffset: [6, 7], line: 6, behind: true });
    gloss(g, -46, -24, 7, 16, 0.55, 0.5);
    gloss(g, -4, -46, 5, 12, 0.55, 0.2);
    // Band gems.
    const gems: [number, number, string][] = [
      [-40, 9, PALETTE.teal],
      [0, 9, PALETTE.danger],
      [40, 9, PALETTE.teal],
    ];
    for (const [x, y, c] of gems) {
      ink(g, circle(x, y, x === 0 ? 10 : 8), { fill: c, shade: darken(c, 0.3), shadeOffset: [2, 3], line: 4.5 });
      gloss(g, x - 3, y - 3, 3, 2, 0.9);
    }
  });
}

function purse(g: Ctx): void {
  // Coins peeking out of the top.
  coin(g, 314, 262, 15, 4.5);
  coin(g, 342, 256, 15, 4.5);
  const sack = svg('M 304 284 C 268 300 260 352 284 374 C 304 390 348 390 366 374 C 390 352 380 300 350 284 Z');
  ink(g, sack, { fill: PALETTE.wood, shade: PALETTE.woodDark, shadeOffset: [8, 9], line: 6 });
  gloss(g, 290, 322, 7, 16, 0.3, 0.3);
  const ruffle = svg('M 304 290 L 294 266 L 314 276 L 326 258 L 338 276 L 358 266 L 350 290 Z');
  ink(g, ruffle, { fill: PALETTE.wood, shade: PALETTE.woodDark, shadeOffset: [3, 4], line: 5 });
  ink(g, rrect(296, 280, 62, 14, 7), { fill: PALETTE.danger, shade: darken(PALETTE.danger, 0.3), shadeOffset: [2, 3], line: 5 });
  coin(g, 326, 340, 20, 4.5);
}

export function drawDuke(g: Ctx): void {
  const hy = 176;

  // Robe.
  ink(g, torsoPath(CX, 290, 350), { fill: col.main, shade: col.dark, shadeOffset: [14, 0] });
  // Gold brocade dots on the robe.
  g.save();
  g.clip(torsoPath(CX, 290, 350));
  for (let y = 318; y < 420; y += 30) {
    for (let x = 58 + ((y / 30) % 2) * 15; x < 380; x += 30) fill(g, circle(x, y, 3.2), lighten(col.main, 0.35));
  }
  g.restore();
  // Ermine front strip.
  ink(g, rrect(CX - 22, 300, 44, 140, 12), { fill: FUR, shade: FUR_SHADE, shadeOffset: [5, 0], line: 6 });
  ermineSpots(g, [[CX - 6, 336], [CX + 8, 372], [CX - 4, 404]]);

  // Fluffy ermine collar.
  const puffs: Path2D[] = [];
  for (let i = -4; i <= 4; i++) puffs.push(circle(CX + i * 37, 296 - Math.abs(i) * 5 + (i % 2 ? 4 : 0), 30));
  const collar = union(...puffs);
  ink(g, collar, { fill: FUR, shade: FUR_SHADE, shadeOffset: [5, 7], line: 6.5, behind: true });
  ermineSpots(g, [[CX - 118, 296], [CX - 60, 306], [CX + 62, 304], [CX + 120, 294]]);

  // Head.
  ears(g, CX, hy + 16, 90, skin);
  head(g, CX, hy, 92, 86, skin);
  // Side curls.
  for (const s of [-1, 1]) {
    const curls = union(circle(CX + s * 88, hy - 22, 21), circle(CX + s * 98, hy + 2, 18), circle(CX + s * 76, hy - 46, 19));
    ink(g, curls, { fill: HAIR, shade: HAIR_SHADE, shadeOffset: [s * -3, 4], line: 6, behind: true });
  }

  // Face.
  eyes(g, CX, hy + 4, 36, { happy: true });
  blush(g, CX, hy + 30, 58, skin, 20);
  // Laughing mouth under a curly moustache.
  openSmile(g, CX, hy + 44, 22, 26);
  const stache = svg(
    'M 0 38 C -10 28 -34 26 -48 36 C -58 44 -70 40 -70 28 C -76 48 -58 62 -36 56 C -22 52 -8 48 0 48 Z',
  );
  for (const s of [-1, 1]) {
    at(g, CX, hy, 0, 1, () => {
      g.scale(s, 1);
      ink(g, stache, { fill: HAIR, shade: HAIR_SHADE, shadeOffset: [0, 4], line: 5.5 });
    });
  }
  nose(g, CX, hy + 20, skin, 14);
  // Double chin.
  line(g, svg(`M ${CX - 24} ${hy + 80} Q ${CX} ${hy + 90} ${CX + 24} ${hy + 80}`), 4.5, skin.shade);

  crown(g);
  purse(g);
  hand(g, 280, 350, 24, skin, -0.4);
}
