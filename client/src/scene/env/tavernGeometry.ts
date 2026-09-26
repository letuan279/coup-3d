/**
 * Builds the static "Sunny Tavern" room. Almost everything is baked into a single
 * vertex-coloured geometry (one draw call); textured surfaces (walls, sky, shafts) get their
 * own merged geometries, and repeated small props (bottles, bulbs) are instanced.
 */
import {
  BoxGeometry,
  BufferGeometry,
  CatmullRomCurve3,
  Color,
  ConeGeometry,
  CylinderGeometry,
  Euler,
  Float32BufferAttribute,
  IcosahedronGeometry,
  Matrix4,
  PlaneGeometry,
  Quaternion,
  SphereGeometry,
  TorusGeometry,
  TubeGeometry,
  Vector3,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { PALETTE } from '../../art/palette';
import { GeoBuilder, type Vec3 } from '../geo';
import { createRng } from '@shared/rng';

export const ROOM = { halfX: 8, halfZ: 7, height: 4.3 } as const;

/** Shelf heights (bottles stand on them). */
export const SHELF_Y = [1.55, 2.1, 2.65];
export const SIGN_Y = 3.5;
export const TABLE_LAMP_Y = 3.62;

/** Direction the sunlight travels (from the west windows, down and slightly north). */
export const SUN_DIR = new Vector3(7, -7, -3.5).normalize();
/** Soft skylight beams falling into the room from the far (north) windows. */
export const SKY_DIR = new Vector3(0.3, -0.6, 0.75).normalize();
/** Where the directional light sits (relative to its target at the table). */
export const SUN_POS: Vec3 = [-7, 7, 3.5];

interface WindowDef {
  wall: 'north' | 'west' | 'east' | 'south';
  /** Horizontal centre along the wall (x for north/south, z for east/west). */
  at: number;
  w: number;
  h: number;
  /** Bottom edge height. */
  y0: number;
}

export const WINDOWS: WindowDef[] = [
  { wall: 'north', at: -5.5, w: 2.1, h: 2.2, y0: 1.2 },
  { wall: 'north', at: 5.5, w: 2.1, h: 2.2, y0: 1.2 },
  { wall: 'west', at: -3.0, w: 2.3, h: 2.3, y0: 1.1 },
  { wall: 'west', at: 1.6, w: 2.3, h: 2.3, y0: 1.1 },
  { wall: 'east', at: -1.2, w: 2.3, h: 2.3, y0: 1.1 },
  { wall: 'south', at: -3.2, w: 2.2, h: 2.2, y0: 1.2 },
];

const WOOD = '#C9803F';
const WOOD_DARK = '#8E5220';
const WOOD_LIGHT = '#E3A566';
const CREAM: string = PALETTE.cream;
const TERRACOTTA = '#DD7A4E';
const LEAF = ['#43B75A', '#5CCB5F', '#2E9E57', '#7DD35B'];

/** Wall placement helper: returns world position + y-rotation for a point on a wall. */
function onWall(wall: WindowDef['wall'], along: number, y: number, inset: number): { p: Vec3; ry: number } {
  const { halfX, halfZ } = ROOM;
  switch (wall) {
    case 'north':
      return { p: [along, y, -halfZ + inset], ry: 0 };
    case 'south':
      return { p: [along, y, halfZ - inset], ry: Math.PI };
    case 'west':
      return { p: [-halfX + inset, y, along], ry: Math.PI / 2 };
    case 'east':
      return { p: [halfX - inset, y, along], ry: -Math.PI / 2 };
  }
}

const tmpM = new Matrix4();
const tmpE = new Euler();

/** Adds a geometry positioned in a wall's local frame (x along the wall, z out of the wall). */
function addOnWall(
  b: GeoBuilder,
  wall: WindowDef['wall'],
  geo: BufferGeometry,
  color: string,
  along: number,
  y: number,
  inset: number,
  rot: Vec3 = [0, 0, 0],
) {
  const w = onWall(wall, along, y, inset);
  // Orient the part in the wall's own frame first, then place it on the wall.
  if (rot[0] || rot[1] || rot[2]) geo.applyMatrix4(tmpM.makeRotationFromEuler(tmpE.set(rot[0], rot[1], rot[2])));
  b.add(geo, color, { p: w.p, r: [0, w.ry, 0] });
}

function windowFrame(b: GeoBuilder, win: WindowDef) {
  const t = 0.13;
  const d = 0.16;
  const cy = win.y0 + win.h / 2;
  const add = (geo: BufferGeometry, along: number, y: number, inset = d / 2, color = CREAM) =>
    addOnWall(b, win.wall, geo, color, win.at + along, y, inset);
  add(new BoxGeometry(win.w + 2 * t, t, d), 0, win.y0 + win.h + t / 2);
  add(new BoxGeometry(win.w + 2 * t, t, d), 0, win.y0 - t / 2);
  add(new BoxGeometry(t, win.h, d), -win.w / 2 - t / 2, cy);
  add(new BoxGeometry(t, win.h, d), win.w / 2 + t / 2, cy);
  add(new BoxGeometry(0.06, win.h, 0.08), 0, cy, 0.05);
  add(new BoxGeometry(win.w, 0.06, 0.08), 0, cy + win.h * 0.12, 0.05);
  // sill with a tiny potted plant
  add(new BoxGeometry(win.w + 0.5, 0.07, 0.32), 0, win.y0 - t - 0.02, 0.16, WOOD_LIGHT);
  add(new CylinderGeometry(0.11, 0.08, 0.18, 8), win.w * 0.3, win.y0 - 0.02, 0.18, TERRACOTTA);
  add(new SphereGeometry(0.15, 8, 6), win.w * 0.3, win.y0 + 0.14, 0.18, LEAF[1]);
  add(new SphereGeometry(0.1, 7, 5), win.w * 0.3 + 0.08, win.y0 + 0.24, 0.16, LEAF[3]);
  // curtains: three soft folds each side
  for (const side of [-1, 1]) {
    for (let k = 0; k < 3; k++) {
      const along = side * (win.w / 2 + 0.22 + k * 0.1);
      addOnWall(
        b,
        win.wall,
        new CylinderGeometry(0.075, 0.1, win.h + 0.5, 7, 1, true),
        k === 1 ? '#FF8577' : PALETTE.coral,
        win.at + along,
        cy + 0.05,
        0.2,
      );
    }
    // tie-back
    add(new TorusGeometry(0.2, 0.03, 4, 10), side * (win.w / 2 + 0.32), cy - 0.3, 0.22, PALETTE.mustard);
  }
  // curtain rod (cylinder laid along the wall)
  addOnWall(b, win.wall, new CylinderGeometry(0.035, 0.035, win.w + 1.3, 6, 1, true), WOOD_DARK, win.at, win.y0 + win.h + 0.28, 0.2, [
    0,
    0,
    Math.PI / 2,
  ]);
}

function plant(b: GeoBuilder, x: number, z: number, scale: number, seed: number) {
  const rand = createRng(seed);
  b.add(new CylinderGeometry(0.34 * scale, 0.26 * scale, 0.62 * scale, 12, 1, true), TERRACOTTA, { p: [x, 0.31 * scale, z] });
  b.add(new TorusGeometry(0.33 * scale, 0.05 * scale, 4, 12), '#C9653C', { p: [x, 0.6 * scale, z], r: [Math.PI / 2, 0, 0] });
  b.add(new CylinderGeometry(0.3 * scale, 0.3 * scale, 0.04, 10), '#6B4226', { p: [x, 0.6 * scale, z] });
  const leaves = 9;
  for (let i = 0; i < leaves; i++) {
    const a = (i / leaves) * Math.PI * 2 + rand() * 0.4;
    const tilt = 0.5 + rand() * 0.5;
    const len = (0.55 + rand() * 0.35) * scale;
    b.add(new SphereGeometry(1, 7, 5), LEAF[i % LEAF.length], {
      p: [x + Math.sin(a) * len * 0.45, 0.62 * scale + len * 0.75, z + Math.cos(a) * len * 0.45],
      r: [tilt * Math.cos(a), 0, -tilt * Math.sin(a)],
      s: [0.16 * scale, len, 0.07 * scale],
    });
  }
  b.add(new SphereGeometry(0.28 * scale, 8, 6), LEAF[2], { p: [x, 0.95 * scale, z] });
}

function stool(b: GeoBuilder, x: number, z: number) {
  b.add(new CylinderGeometry(0.25, 0.23, 0.1, 12), PALETTE.coral, { p: [x, 0.78, z] });
  b.add(new CylinderGeometry(0.2, 0.2, 0.04, 12), '#FF8577', { p: [x, 0.84, z] });
  b.add(new CylinderGeometry(0.045, 0.06, 0.74, 6, 1, true), WOOD_DARK, { p: [x, 0.37, z] });
  b.add(new TorusGeometry(0.17, 0.025, 4, 10), WOOD_DARK, { p: [x, 0.3, z], r: [Math.PI / 2, 0, 0] });
  b.add(new CylinderGeometry(0.22, 0.26, 0.05, 10), WOOD_DARK, { p: [x, 0.025, z] });
}

function barrel(b: GeoBuilder, x: number, z: number, y = 0) {
  b.add(new CylinderGeometry(0.4, 0.4, 0.95, 12, 1, true), WOOD, { p: [x, y + 0.475, z] });
  b.add(new SphereGeometry(0.45, 12, 6), WOOD, { p: [x, y + 0.475, z], s: [1, 0.9, 1] });
  for (const h of [0.16, 0.79]) {
    b.add(new TorusGeometry(0.42, 0.025, 4, 14), '#5E3A1E', { p: [x, y + h, z], r: [Math.PI / 2, 0, 0] });
  }
  b.add(new CylinderGeometry(0.36, 0.36, 0.02, 12), WOOD_LIGHT, { p: [x, y + 0.96, z] });
}

function lampShade(b: GeoBuilder, x: number, y: number, z: number, color: string, big = false) {
  const r = big ? 0.42 : 0.3;
  b.add(new CylinderGeometry(0.012, 0.012, ROOM.height - y, 4), '#3A2A1E', { p: [x, (ROOM.height + y) / 2 + 0.1, z] });
  b.add(new ConeGeometry(r, r * 0.8, 16, 1, true), color, { p: [x, y + 0.02, z] });
  b.add(new SphereGeometry(r * 0.28, 8, 3, 0, Math.PI * 2, 0, Math.PI / 2), color, { p: [x, y + r * 0.38, z] });
  b.add(new TorusGeometry(r, 0.02, 4, 16), CREAM, { p: [x, y - r * 0.4 + 0.02, z], r: [Math.PI / 2, 0, 0] });
}

/** Catenary-ish curves for string lights (shared by wires and bulbs). */
export function stringCurves(): CatmullRomCurve3[] {
  const curves: CatmullRomCurve3[] = [];
  const zs = [-5.4, -2.2, 1.0, 4.2];
  zs.forEach((z, i) => {
    const pts: Vector3[] = [];
    const n = 9;
    for (let k = 0; k <= n; k++) {
      const u = k / n;
      const x = -ROOM.halfX + 0.1 + u * (2 * ROOM.halfX - 0.2);
      const sag = Math.sin(u * Math.PI * 2) ** 2 * 0.45 + 0.08;
      pts.push(new Vector3(x, ROOM.height - 0.25 - sag, z + (i % 2 ? u : 1 - u) * 1.4));
    }
    curves.push(new CatmullRomCurve3(pts));
  });
  return curves;
}

function bunting(b: GeoBuilder) {
  const colors = [PALETTE.coral, PALETTE.mustard, PALETTE.teal, PALETTE.pink, PALETTE.violet, '#FFFFFF'];
  const z = -ROOM.halfZ + 0.12;
  const x0 = -3.9;
  const x1 = 3.9;
  const segs = 2;
  let ci = 0;
  for (let s = 0; s < segs; s++) {
    const a = x0 + ((x1 - x0) * s) / segs;
    const c = x0 + ((x1 - x0) * (s + 1)) / segs;
    const flags = 11;
    for (let i = 0; i < flags; i++) {
      const u = (i + 0.5) / flags;
      const x = a + (c - a) * u;
      const y = 3.98 - Math.sin(u * Math.PI) * 0.35;
      b.add(new ConeGeometry(0.11, 0.26, 3), colors[ci++ % colors.length], {
        p: [x, y - 0.12, z],
        r: [Math.PI, 0, 0],
        s: [1, 1, 0.25],
      });
    }
  }
}

function picture(b: GeoBuilder, wall: WindowDef['wall'], along: number, y: number, w: number, h: number, fill: string, accent: string) {
  addOnWall(b, wall, new BoxGeometry(w + 0.12, h + 0.12, 0.06), WOOD_DARK, along, y, 0.03);
  addOnWall(b, wall, new BoxGeometry(w, h, 0.02), fill, along, y, 0.07);
  addOnWall(b, wall, new SphereGeometry(Math.min(w, h) * 0.28, 8, 6), accent, along, y + h * 0.05, 0.08, [0, 0, 0]);
}

function dartboard(b: GeoBuilder, wall: WindowDef['wall'], along: number, y: number) {
  const rings = ['#2B2140', PALETTE.coral, CREAM, PALETTE.teal, PALETTE.coral];
  rings.forEach((c, i) => {
    addOnWall(b, wall, new CylinderGeometry(0.34 - i * 0.065, 0.34 - i * 0.065, 0.03, 16), c, along, y, 0.04 + i * 0.006, [
      Math.PI / 2,
      0,
      0,
    ]);
  });
}

/** Everything static and vertex-coloured, as ONE geometry. */
export function buildShell(): BufferGeometry {
  const b = new GeoBuilder();
  const { halfX, halfZ, height } = ROOM;

  // Ceiling + beams.
  b.add(new PlaneGeometry(2 * halfX, 2 * halfZ), '#F2D2A2', { p: [0, height, 0], r: [Math.PI / 2, 0, 0] });
  for (let z = -5.6; z <= 5.7; z += 2.8) {
    b.add(new BoxGeometry(2 * halfX, 0.2, 0.24), WOOD_DARK, { p: [0, height - 0.1, z] });
  }

  // Wainscoting (lower wood panels) + rail + skirting on all four walls.
  const walls: [WindowDef['wall'], number][] = [
    ['north', 2 * halfX],
    ['south', 2 * halfX],
    ['west', 2 * halfZ],
    ['east', 2 * halfZ],
  ];
  for (const [wall, len] of walls) {
    addOnWall(b, wall, new BoxGeometry(len, 1.0, 0.05), WOOD, 0, 0.5, 0.025);
    addOnWall(b, wall, new BoxGeometry(len, 0.08, 0.1), WOOD_DARK, 0, 1.02, 0.05);
    addOnWall(b, wall, new BoxGeometry(len, 0.12, 0.08), WOOD_DARK, 0, 0.06, 0.04);
    // vertical panel battens
    for (let a = -len / 2 + 0.6; a < len / 2; a += 1.2) {
      addOnWall(b, wall, new BoxGeometry(0.06, 0.9, 0.07), WOOD_LIGHT, a, 0.5, 0.05);
    }
    // corner posts
    addOnWall(b, wall, new BoxGeometry(0.22, height, 0.22), WOOD_DARK, len / 2 - 0.11, height / 2, 0.11);
  }

  for (const w of WINDOWS) windowFrame(b, w);

  // ── Bar (north wall) ──
  const barZ = -halfZ + 1.35;
  b.add(new BoxGeometry(7.4, 1.02, 0.7), WOOD, { p: [0, 0.51, barZ] });
  for (let x = -3.35; x <= 3.4; x += 0.67) {
    b.add(new BoxGeometry(0.5, 0.68, 0.04), (Math.round((x + 3.35) / 0.67) % 2 ? PALETTE.teal : PALETTE.mustard), {
      p: [x, 0.52, barZ + 0.36],
    });
  }
  b.add(new BoxGeometry(7.7, 0.09, 0.95), WOOD_DARK, { p: [0, 1.06, barZ + 0.05] });
  b.add(new BoxGeometry(7.4, 0.08, 0.06), '#E0A05C', { p: [0, 0.12, barZ + 0.4] });
  // mugs + jar on the counter
  for (const [x, c] of [
    [-2.6, CREAM],
    [-2.35, PALETTE.coral],
    [1.9, PALETTE.teal],
    [2.2, CREAM],
  ] as [number, string][]) {
    b.add(new CylinderGeometry(0.08, 0.08, 0.17, 8), c, { p: [x, 1.2, barZ] });
    b.add(new TorusGeometry(0.05, 0.015, 4, 8), c, { p: [x + 0.09, 1.2, barZ] });
  }
  b.add(new CylinderGeometry(0.13, 0.13, 0.3, 12), '#BDEBFF', { p: [0.4, 1.26, barZ - 0.1] });
  b.add(new CylinderGeometry(0.14, 0.14, 0.05, 12), WOOD_DARK, { p: [0.4, 1.43, barZ - 0.1] });
  // back wall panel + shelves
  b.add(new BoxGeometry(7.6, 2.1, 0.06), '#A8632E', { p: [0, 2.25, -halfZ + 0.04] });
  for (const y of SHELF_Y) {
    b.add(new BoxGeometry(7.2, 0.06, 0.34), WOOD_LIGHT, { p: [0, y - 0.03, -halfZ + 0.2] });
    for (const x of [-3.3, 0, 3.3]) b.add(new BoxGeometry(0.06, 0.16, 0.26), WOOD_DARK, { p: [x, y - 0.14, -halfZ + 0.15] });
  }
  for (let x = -2.4; x <= 2.4; x += 1.6) stool(b, x, barZ + 0.95);
  barrel(b, -4.35, -halfZ + 0.75);
  barrel(b, -4.35, -halfZ + 1.7);
  barrel(b, 4.35, -halfZ + 0.75);
  b.add(new BoxGeometry(0.9, 0.08, 0.9), WOOD_DARK, { p: [4.35, 0.99, -halfZ + 0.75] });
  b.add(new CylinderGeometry(0.1, 0.1, 0.3, 10), PALETTE.coral, { p: [4.2, 1.18, -halfZ + 0.75] });
  b.add(new CylinderGeometry(0.1, 0.1, 0.22, 10), PALETTE.teal, { p: [4.5, 1.14, -halfZ + 0.9] });

  // Sign frame (the sign face is a textured plane).
  b.add(new BoxGeometry(3.7, 0.95, 0.06), WOOD_DARK, { p: [0, SIGN_Y, -halfZ + 0.05] });

  // Hanging lamps.
  lampShade(b, -2.3, 2.95, barZ + 0.1, PALETTE.mustard);
  lampShade(b, 0, 2.95, barZ + 0.1, PALETTE.teal);
  lampShade(b, 2.3, 2.95, barZ + 0.1, PALETTE.coral);
  lampShade(b, 0, TABLE_LAMP_Y, 0, PALETTE.mustard, true);

  bunting(b);

  // Plants in the corners and by the windows.
  plant(b, -halfX + 0.6, -halfZ + 0.6, 1.25, 1);
  plant(b, halfX - 0.6, -halfZ + 0.6, 1.1, 2);
  plant(b, halfX - 0.6, halfZ - 0.6, 1.3, 3);
  plant(b, -halfX + 0.6, halfZ - 0.6, 1.0, 4);
  plant(b, -halfX + 0.55, -0.7, 0.8, 5);
  plant(b, halfX - 0.55, 1.4, 0.9, 6);

  // Walls decor.
  picture(b, 'east', 1.9, 2.3, 1.1, 0.8, '#FFE7BF', PALETTE.coral);
  picture(b, 'east', 3.6, 2.1, 0.7, 0.9, '#9BE7C4', PALETTE.mustard);
  dartboard(b, 'east', -3.9, 2.2);
  picture(b, 'west', 4.6, 2.3, 1.0, 0.75, '#FFD1A9', PALETTE.teal);

  // South wall: door with a round window, coat pegs.
  addOnWall(b, 'south', new BoxGeometry(1.3, 2.3, 0.1), WOOD, 3.2, 1.15, 0.05);
  addOnWall(b, 'south', new BoxGeometry(1.5, 0.12, 0.14), WOOD_DARK, 3.2, 2.36, 0.07);
  addOnWall(b, 'south', new CylinderGeometry(0.25, 0.25, 0.04, 16), PALETTE.sky, 3.2, 1.75, 0.11, [Math.PI / 2, 0, 0]);
  addOnWall(b, 'south', new SphereGeometry(0.06, 8, 6), PALETTE.mustard, 2.75, 1.1, 0.14);
  for (let k = 0; k < 4; k++) addOnWall(b, 'south', new SphereGeometry(0.05, 8, 6), WOOD_DARK, 0.2 + k * 0.35, 1.8, 0.1);

  // String-light wires.
  for (const c of stringCurves()) {
    b.add(new TubeGeometry(c, 40, 0.008, 3, false), '#3A2A1E');
  }

  return b.build();
}


/** Wallpapered walls (UV-mapped), merged. */
export function buildWalls(): BufferGeometry {
  const { halfX, halfZ, height } = ROOM;
  const parts: BufferGeometry[] = [];
  const mk = (len: number, p: Vec3, ry: number) => {
    const g = new PlaneGeometry(len, height);
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * (len / 2));
    g.applyMatrix4(new Matrix4().makeRotationY(ry).setPosition(p[0], p[1], p[2]));
    parts.push(g);
  };
  mk(2 * halfX, [0, height / 2, -halfZ], 0);
  mk(2 * halfX, [0, height / 2, halfZ], Math.PI);
  mk(2 * halfZ, [-halfX, height / 2, 0], Math.PI / 2);
  mk(2 * halfZ, [halfX, height / 2, 0], -Math.PI / 2);
  return mergeGeometries(parts)!;
}

/** Sky panels behind every window frame. */
export function buildSkyPanels(): BufferGeometry {
  const parts: BufferGeometry[] = [];
  for (const w of WINDOWS) {
    const g = new PlaneGeometry(w.w, w.h);
    const pl = onWall(w.wall, w.at, w.y0 + w.h / 2, 0.012);
    g.applyMatrix4(new Matrix4().makeRotationY(pl.ry).setPosition(pl.p[0], pl.p[1], pl.p[2]));
    parts.push(g);
  }
  return mergeGeometries(parts)!;
}

/**
 * Light blades: sun streaming through the west windows along SUN_DIR, plus softer skylight
 * beams from the far windows (seen behind the opponents in first person).
 */
export function buildShafts(): BufferGeometry {
  const positions: number[] = [];
  const uvs: number[] = [];
  const quad = (a: Vector3, b: Vector3, dir: Vector3, len: number) => {
    const c = b.clone().addScaledVector(dir, len);
    const d = a.clone().addScaledVector(dir, len);
    // two triangles a-b-c, a-c-d; v=1 at the window, 0 at the far end
    for (const p of [a, b, c, a, c, d]) positions.push(p.x, p.y, p.z);
    uvs.push(0, 1, 1, 1, 1, 0, 0, 1, 1, 0, 0, 0);
  };
  for (const w of WINDOWS.filter((w) => w.wall === 'west')) {
    const x = -ROOM.halfX + 0.05;
    for (const f of [-0.3, 0.05, 0.35]) {
      const z = w.at + f * w.w;
      quad(new Vector3(x, w.y0 + w.h, z), new Vector3(x, w.y0, z), SUN_DIR, 7.5);
    }
    for (const f of [0.3, 0.7]) {
      const y = w.y0 + f * w.h;
      quad(new Vector3(x, y, w.at - w.w / 2), new Vector3(x, y, w.at + w.w / 2), SUN_DIR, 7.5);
    }
  }
  for (const w of WINDOWS.filter((w) => w.wall === 'north')) {
    const z = -ROOM.halfZ + 0.05;
    for (const f of [-0.28, 0.12]) {
      const x = w.at + f * w.w;
      quad(new Vector3(x, w.y0 + w.h, z), new Vector3(x, w.y0, z), SKY_DIR, 4.2);
    }
    quad(new Vector3(w.at - w.w / 2, w.y0 + w.h * 0.6, z), new Vector3(w.at + w.w / 2, w.y0 + w.h * 0.6, z), SKY_DIR, 4.2);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(positions, 3));
  g.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
  g.computeVertexNormals();
  return g;
}

/** Dust motes drifting in the sunlight (positions only; animated as a whole). */
export function buildMotes(count = 160): BufferGeometry {
  const rand = createRng(5);
  const pos = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const inShaft = i % 3 !== 0;
    // Most motes float in the west sunbeams, the rest drift around the table and bar.
    const x = inShaft ? -7.4 + rand() * 5.5 : -4 + rand() * 8;
    const y = inShaft ? 0.3 + rand() * 3.2 : 1.2 + rand() * 2.4;
    const z = inShaft ? -4.2 + rand() * 6.8 : -6 + rand() * 7.5;
    pos[i * 3] = x;
    pos[i * 3 + 1] = y;
    pos[i * 3 + 2] = z;
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  return g;
}

/** Sunlit window-shaped patches on the floor (where the west shafts land). */
export function buildFloorPatches(): BufferGeometry {
  const parts: BufferGeometry[] = [];
  for (const w of WINDOWS.filter((w) => w.wall === 'west')) {
    // Where the window centre's ray hits the floor.
    const cy = w.y0 + w.h / 2;
    const t = cy / -SUN_DIR.y;
    const x = -ROOM.halfX + SUN_DIR.x * t;
    const z = w.at + SUN_DIR.z * t;
    const g = new PlaneGeometry(w.h * 1.3, w.w * 1.25);
    g.applyMatrix4(new Matrix4().makeRotationX(-Math.PI / 2).setPosition(x, 0.012, z));
    parts.push(g);
  }
  return mergeGeometries(parts)!;
}

export interface InstanceSpec {
  matrices: Matrix4[];
  colors: Color[];
}

const BOTTLE_COLORS = ['#FF6B5B', '#1FB5A8', '#FFC24B', '#7B61FF', '#35C27A', '#FF9EC7', '#8FD8FF', '#E9A21F', '#FFFFFF'];

/** One bottle model (base at y=0): body, shoulder, neck, cap. White so instance colours tint it. */
export function bottleGeometry(): BufferGeometry {
  const b = new GeoBuilder();
  b.add(new CylinderGeometry(0.065, 0.065, 0.22, 7, 1, true), '#FFFFFF', { p: [0, 0.11, 0] });
  b.add(new ConeGeometry(0.065, 0.08, 7, 1, true), '#FFFFFF', { p: [0, 0.26, 0] });
  b.add(new CylinderGeometry(0.024, 0.028, 0.12, 5, 1, true), '#FFFFFF', { p: [0, 0.34, 0] });
  b.add(new CylinderGeometry(0.03, 0.03, 0.03, 5), '#C9A080', { p: [0, 0.4, 0] });
  b.add(new CylinderGeometry(0.066, 0.066, 0.08, 7, 1, true), '#FFF6E5', { p: [0, 0.12, 0] });
  return b.build();
}

export function bottleInstances(): InstanceSpec {
  const rand = createRng(21);
  const matrices: Matrix4[] = [];
  const colors: Color[] = [];
  const q = new Quaternion();
  for (const y of SHELF_Y) {
    let x = -3.45;
    while (x < 3.45) {
      const s = 0.8 + rand() * 0.5;
      const w = 0.16 * (0.8 + rand() * 0.4);
      if (Math.abs(x) > 0.05 || rand() < 0.5) {
        matrices.push(
          new Matrix4().compose(new Vector3(x, y, -ROOM.halfZ + 0.2 + (rand() - 0.5) * 0.08), q, new Vector3(w / 0.13, s, w / 0.13)),
        );
        colors.push(new Color(BOTTLE_COLORS[Math.floor(rand() * BOTTLE_COLORS.length)]));
      }
      x += w + 0.06 + rand() * 0.12;
    }
  }
  // a few on the bar counter
  for (const x of [-1.2, -1.0, 1.3]) {
    matrices.push(new Matrix4().compose(new Vector3(x, 1.1, -ROOM.halfZ + 1.3), q, new Vector3(1, 1.1, 1)));
    colors.push(new Color(BOTTLE_COLORS[Math.floor(rand() * BOTTLE_COLORS.length)]));
  }
  return { matrices, colors };
}

export function bulbGeometry(): BufferGeometry {
  return new IcosahedronGeometry(0.045, 0);
}

const BULB_COLORS = ['#FFE08A', '#FFB86B', '#FF9EC7', '#FFF3C4', '#9BE7C4', '#FFD34D'];

export function bulbInstances(): InstanceSpec {
  const matrices: Matrix4[] = [];
  const colors: Color[] = [];
  const q = new Quaternion();
  let i = 0;
  for (const c of stringCurves()) {
    const count = 34;
    for (let k = 1; k < count; k++) {
      const p = c.getPoint(k / count);
      matrices.push(new Matrix4().compose(p.add(new Vector3(0, -0.05, 0)), q, new Vector3(1, 1.3, 1)));
      colors.push(new Color(BULB_COLORS[i++ % BULB_COLORS.length]).multiplyScalar(1.4));
    }
  }
  // Lamp bulbs (bigger).
  const lamps: Vec3[] = [
    [-2.3, 2.84, -ROOM.halfZ + 1.45],
    [0, 2.84, -ROOM.halfZ + 1.45],
    [2.3, 2.84, -ROOM.halfZ + 1.45],
    [0, TABLE_LAMP_Y - 0.15, 0],
  ];
  for (const l of lamps) {
    matrices.push(new Matrix4().compose(new Vector3(...l), q, new Vector3(2.4, 2.4, 2.4)));
    colors.push(new Color('#FFF1C4').multiplyScalar(1.6));
  }
  return { matrices, colors };
}

