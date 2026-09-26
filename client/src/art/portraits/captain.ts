/** Captain: tricorn hat, handlebar moustache, gold epaulettes and a cutlass, with the sea behind. */
import { CHARACTER_COLORS, PALETTE } from '../palette';
import { at, circle, ellipse, fill, ink, line, rrect, svg, union, type Ctx } from '../draw';
import { darken, lighten } from '../color';
import { drawGlyph } from '../glyphs';
import { CX, PW, blush, brows, ears, eyes, hand, head, nose, openSmile, shine, torsoPath, type Skin, SKINS } from './figure';

const col = CHARACTER_COLORS.captain;
const skin: Skin = SKINS.tan;
const HAT = '#23386E';
const HAT_SHADE = '#172650';
const COAT = col.dark;
const HAIR = '#4A2E1E';
const HAIR_SHADE = '#33200F';
const STEEL = '#EEF2FA';
const STEEL_SHADE = '#AEB7CF';

function wave(y: number, amp: number, len: number, phase: number): Path2D {
  let d = `M -20 ${PW} L -20 ${y}`;
  for (let x = -20; x < PW + 20; x += len) {
    const x1 = x + len / 2;
    const x2 = x + len;
    d += ` Q ${x + len / 4 + phase} ${y - amp} ${x1} ${y} Q ${x1 + len / 4 + phase} ${y + amp} ${x2} ${y}`;
  }
  d += ` L ${PW + 40} ${PW} Z`;
  return svg(d);
}

export function drawCaptainBackdrop(g: Ctx): void {
  ink(g, wave(262, 12, 88, 0), { fill: lighten(col.main, 0.45), line: 5 });
  ink(g, wave(300, 14, 110, 10), { fill: lighten(col.main, 0.2), line: 5 });
  // Seagulls.
  for (const [x, y, s] of [
    [70, 70, 1],
    [118, 44, 0.75],
    [372, 60, 0.9],
  ] as const) {
    line(g, svg(`M ${x - 16 * s} ${y} Q ${x - 8 * s} ${y - 10 * s} ${x} ${y} Q ${x + 8 * s} ${y - 10 * s} ${x + 16 * s} ${y}`), 5);
  }
}

function hat(g: Ctx, hy: number): void {
  // Crown of the hat and a coral plume behind the brim.
  const plume = svg(
    `M ${CX + 40} ${hy - 120} C ${CX + 70} ${hy - 190} ${CX + 150} ${hy - 200} ${CX + 176} ${hy - 170} ` +
      `C ${CX + 140} ${hy - 168} ${CX + 100} ${hy - 146} ${CX + 70} ${hy - 110} Z`,
  );
  ink(g, plume, { fill: PALETTE.coral, shade: PALETTE.coralDark, shadeOffset: [0, 8], line: 6 });
  line(g, svg(`M ${CX + 58} ${hy - 118} C ${CX + 90} ${hy - 160} ${CX + 130} ${hy - 176} ${CX + 168} ${hy - 172}`), 4, PALETTE.coralDark);
  ink(g, ellipse(CX, hy - 124, 70, 46), { fill: HAT, shade: HAT_SHADE, shadeOffset: [8, 6] });

  const brim = svg(
    `M ${CX - 164} ${hy - 96} ` +
      `C ${CX - 124} ${hy - 150} ${CX - 60} ${hy - 150} ${CX} ${hy - 126} ` +
      `C ${CX + 60} ${hy - 150} ${CX + 124} ${hy - 150} ${CX + 164} ${hy - 96} ` +
      `C ${CX + 120} ${hy - 62} ${CX + 56} ${hy - 58} ${CX} ${hy - 38} ` +
      `C ${CX - 56} ${hy - 58} ${CX - 120} ${hy - 62} ${CX - 164} ${hy - 96} Z`,
  );
  ink(g, brim, { fill: HAT, shade: HAT_SHADE, shadeOffset: [0, 10] });
  // Gold trim following the upper edge of the brim.
  g.save();
  g.clip(brim);
  line(
    g,
    svg(
      `M ${CX - 164} ${hy - 90} C ${CX - 124} ${hy - 140} ${CX - 60} ${hy - 140} ${CX} ${hy - 116} ` +
        `C ${CX + 60} ${hy - 140} ${CX + 124} ${hy - 140} ${CX + 164} ${hy - 90}`,
    ),
    9,
    PALETTE.gold,
  );
  g.restore();
  // Anchor badge.
  ink(g, circle(CX, hy - 84, 21), { fill: PALETTE.gold, shade: PALETTE.mustardDark, shadeOffset: [2, 3], line: 5 });
  at(g, CX, hy - 84, 0, 0.3, () => drawGlyph(g, 'captain', { body: HAT, cut: PALETTE.gold }));
}

function cutlass(g: Ctx): void {
  at(g, 92, 346, -0.22, 1, () => {
    const blade = svg('M -11 -22 L -13 -128 C -13 -168 -2 -192 20 -214 C 24 -176 26 -130 14 -22 Z');
    ink(g, blade, { fill: STEEL, shade: STEEL_SHADE, shadeOffset: [7, 0], line: 6 });
    shine(g, -2, -150, 6);
    shine(g, -3, -118, 3.5);
    // Knuckle bow (outline pass then gold pass) and cross guard.
    const bow = svg('M 30 -24 C 52 -2 48 32 8 42');
    line(g, bow, 16);
    line(g, bow, 7, PALETTE.gold);
    ink(g, rrect(-36, -32, 72, 16, 8), { fill: PALETTE.gold, shade: PALETTE.mustardDark, shadeOffset: [3, 3], line: 5.5 });
    ink(g, rrect(-9, -18, 18, 44, 5), { fill: PALETTE.woodDark, line: 5 });
    ink(g, circle(0, 32, 10), { fill: PALETTE.gold, line: 5 });
  });
  hand(g, 92, 350, 24, skin, -0.2);
}

export function drawCaptain(g: Ctx): void {
  const hy = 188;

  // Coat, lapels, shirt and cravat.
  const coat = torsoPath(CX, 298, 364);
  ink(g, coat, { fill: COAT, shade: darken(COAT, 0.3), shadeOffset: [14, 0] });
  const shirt = svg(`M ${CX - 44} 290 L ${CX + 44} 290 L ${CX} 430 Z`);
  ink(g, shirt, { fill: PALETTE.paper, line: 6 });
  for (const s of [-1, 1]) {
    const lapel = svg(`M ${CX + s * 44} 292 L ${CX + s * 12} 430 L ${CX + s * 70} 430 L ${CX + s * 88} 300 Z`);
    ink(g, lapel, { fill: col.main, shade: COAT, shadeOffset: [0, 0], line: 6 });
    for (const y of [352, 396]) {
      ink(g, circle(CX + s * 62, y, 8), { fill: PALETTE.gold, line: 4.5 });
    }
  }
  const cravat = union(circle(CX - 14, 302, 16), circle(CX + 14, 302, 16), circle(CX, 324, 17), circle(CX, 346, 13));
  ink(g, cravat, { fill: PALETTE.paper, shade: '#DDE6F5', shadeOffset: [4, 4], line: 5.5, behind: true });
  // Epaulettes with fringe.
  for (const s of [-1, 1]) {
    const x = CX + s * 150;
    for (let i = -3; i <= 3; i++) line(g, svg(`M ${x + i * 10} 318 l 0 22`), 5.5, PALETTE.mustardDark);
    ink(g, ellipse(x, 314, 44, 18, s * 0.12), { fill: PALETTE.gold, shade: PALETTE.mustardDark, shadeOffset: [3, 5], line: 6 });
  }

  // Head and hair tufts under the hat.
  ears(g, CX, hy + 12, 84, skin);
  head(g, CX, hy, 84, 86, skin);
  for (const s of [-1, 1]) {
    const tuft = svg(
      `M ${CX + s * 82} ${hy - 44} Q ${CX + s * 98} ${hy - 20} ${CX + s * 90} ${hy + 6} Q ${CX + s * 80} ${hy - 6} ${CX + s * 72} ${hy + 6} Q ${CX + s * 64} ${hy - 30} ${CX + s * 62} ${hy - 48} Z`,
    );
    ink(g, tuft, { fill: HAIR, shade: HAIR_SHADE, shadeOffset: [0, 3], line: 5.5 });
  }

  // Face: confident brows, grin and a big handlebar moustache.
  eyes(g, CX, hy + 4, 32, { look: [0, 0] });
  brows(g, CX, hy - 22, 32, 4, HAIR, 8, 15);
  blush(g, CX, hy + 34, 54, skin);
  // Stubble.
  g.save();
  g.clip(svg(`M ${CX - 60} ${hy + 50} Q ${CX} ${hy + 104} ${CX + 60} ${hy + 50} L ${CX + 60} ${hy + 90} L ${CX - 60} ${hy + 90} Z`));
  for (let i = 0; i < 16; i++) {
    const a = (i * 2.399) % (Math.PI * 2);
    const rr = 10 + ((i * 13) % 36);
    fill(g, circle(CX + Math.cos(a) * rr * 1.2, hy + 70 + Math.sin(a) * rr * 0.4, 2.2), skin.shade);
  }
  g.restore();
  openSmile(g, CX, hy + 48, 20, 22);
  // Teeth.
  fill(g, rrect(CX - 14, hy + 47, 28, 7, 3), PALETTE.paper);
  const stache = svg('M 0 34 C -16 26 -40 26 -54 34 C -66 40 -74 30 -70 18 C -84 32 -76 56 -52 52 C -34 50 -12 46 0 46 Z');
  for (const s of [-1, 1]) {
    at(g, CX, hy, 0, 1, () => {
      g.scale(s, 1);
      ink(g, stache, { fill: HAIR, shade: HAIR_SHADE, shadeOffset: [0, 4], line: 5.5 });
    });
  }
  nose(g, CX, hy + 22, skin, 12);

  hat(g, hy);
  cutlass(g);
}
