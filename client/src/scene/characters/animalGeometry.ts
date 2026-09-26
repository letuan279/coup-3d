/**
 * Chunky cartoon animals built from primitives and baked into a few vertex-coloured meshes
 * per species (cached): base (chair + legs + tail), body, head, eyes, arm.
 *
 * Local frame: origin on the floor at the chair centre, +z towards the table, y up.
 */
import {
  BoxGeometry,
  CapsuleGeometry,
  ConeGeometry,
  CylinderGeometry,
  SphereGeometry,
  TorusGeometry,
  type BufferGeometry,
} from 'three';
import type { AvatarId } from '@shared/types';
import { AVATAR_COLORS, PALETTE } from '../../art/palette';
import { GeoBuilder, greyTint, type Vec3 } from '../geo';

/** Rig pivots (local seat space). */
export const RIG = {
  hips: [0, 0.56, 0] as Vec3,
  /** Relative to hips. */
  body: [0, 0.31, 0] as Vec3,
  neck: [0, 0.6, 0.03] as Vec3,
  shoulderL: [-0.3, 0.5, 0.07] as Vec3,
  shoulderR: [0.3, 0.5, 0.07] as Vec3,
  /** Relative to neck. */
  head: [0, 0.29, 0.02] as Vec3,
  /** Arm rest pitch (radians, pointing down-forward onto the table). */
  armRest: 0.3,
  headRadius: 0.33,
} as const;

const INK = PALETTE.ink;
const NOSE = '#3A2233';
const BLUSH = '#FF8FA3';
const WHITE = '#FFFFFF';

interface EyeStyle {
  /** Eye centre relative to head centre. */
  y: number;
  z: number;
  spacing: number;
  radius: number;
  iris?: string;
  /** Horizontal pupils (frog). */
  wide?: boolean;
}

export interface Species {
  eyes: EyeStyle;
  /** Mouth centre relative to head centre; null = no mouth (beak). */
  mouth: Vec3 | null;
  mouthScale: number;
  /** Height of the top of the head (+ ears) above the head centre — for the bot antenna. */
  crown: number;
  bow: string;
  headScale: Vec3;
  features(b: GeoBuilder, body: string, accent: string): void;
  extras?(b: GeoBuilder, body: string, accent: string): void;
  tail?(b: GeoBuilder, body: string, accent: string): void;
}

const R = RIG.headRadius;

const SPECIES: Record<AvatarId, Species> = {
  pig: {
    eyes: { y: 0.08, z: 0.265, spacing: 0.125, radius: 0.088 },
    mouth: [0, -0.18, 0.285],
    mouthScale: 1,
    crown: 0.36,
    bow: PALETTE.teal,
    headScale: [1.06, 0.97, 1],
    features(b, body, accent) {
      for (const s of [-1, 1]) {
        b.add(new ConeGeometry(0.1, 0.17, 12), body, { p: [s * 0.2, 0.27, 0.02], r: [0.45, 0, -s * 0.55] });
        b.add(new ConeGeometry(0.06, 0.1, 10), accent, { p: [s * 0.2, 0.26, 0.07], r: [0.45, 0, -s * 0.55] });
        b.add(new SphereGeometry(0.06, 9, 6), BLUSH, { p: [s * 0.21, -0.09, 0.24], s: [1, 0.6, 0.4] });
      }
      b.add(new CylinderGeometry(0.105, 0.115, 0.1, 18), '#FFB8CC', { p: [0, -0.06, 0.33], r: [Math.PI / 2, 0, 0] });
      for (const s of [-1, 1]) b.add(new SphereGeometry(0.022, 8, 6), '#C24D72', { p: [s * 0.038, -0.06, 0.38], s: [1, 1.4, 0.6] });
    },
    tail(b, body) {
      b.add(new TorusGeometry(0.05, 0.018, 6, 12), body, { p: [0, 0.62, -0.33], r: [0, Math.PI / 2, 0] });
    },
  },
  fox: {
    eyes: { y: 0.07, z: 0.26, spacing: 0.13, radius: 0.088 },
    mouth: [0, -0.2, 0.36],
    mouthScale: 0.8,
    crown: 0.5,
    bow: PALETTE.teal,
    headScale: [1.08, 0.95, 1],
    features(b, body, accent) {
      for (const s of [-1, 1]) {
        b.add(new ConeGeometry(0.12, 0.3, 4), body, { p: [s * 0.19, 0.33, -0.02], r: [0, Math.PI / 4, -s * 0.32] });
        b.add(new ConeGeometry(0.07, 0.2, 4), accent, { p: [s * 0.185, 0.31, 0.03], r: [0, Math.PI / 4, -s * 0.32] });
        b.add(new ConeGeometry(0.04, 0.08, 4), NOSE, { p: [s * 0.24, 0.47, -0.02], r: [0, Math.PI / 4, -s * 0.32] });
        b.add(new SphereGeometry(0.12, 10, 7), accent, { p: [s * 0.19, -0.12, 0.17], s: [1, 0.8, 0.9] });
      }
      b.add(new SphereGeometry(0.15, 10, 7), accent, { p: [0, -0.1, 0.26], s: [1.05, 0.72, 1.25] });
      b.add(new SphereGeometry(0.045, 9, 6), NOSE, { p: [0, -0.07, 0.44] });
    },
    tail(b, body, accent) {
      b.add(new SphereGeometry(0.2, 9, 6), body, { p: [0.28, 0.72, -0.4], r: [0.6, 0, -0.5], s: [0.8, 1.6, 0.8] });
      b.add(new SphereGeometry(0.12, 9, 6), accent, { p: [0.45, 0.98, -0.52], s: [1, 1.2, 1] });
    },
  },
  bulldog: {
    eyes: { y: 0.08, z: 0.265, spacing: 0.13, radius: 0.086 },
    mouth: [0, -0.24, 0.3],
    mouthScale: 1.2,
    crown: 0.33,
    bow: PALETTE.coral,
    headScale: [1.14, 0.93, 1],
    features(b, body, accent) {
      for (const s of [-1, 1]) {
        b.add(new SphereGeometry(0.12, 10, 7), accent, { p: [s * 0.31, 0.13, -0.02], r: [0, 0, s * 0.7], s: [0.55, 1.25, 0.9] });
        b.add(new SphereGeometry(0.11, 10, 7), '#F0CFA8', { p: [s * 0.1, -0.16, 0.27], s: [1, 0.9, 0.8] });
      }
      b.add(new SphereGeometry(0.13, 10, 7), accent, { p: [0.13, 0.07, 0.2], s: [1, 1, 0.55] });
      b.add(new SphereGeometry(0.16, 10, 7), '#F0CFA8', { p: [0, -0.1, 0.24], s: [1.35, 0.85, 0.85] });
      b.add(new SphereGeometry(0.07, 9, 6), NOSE, { p: [0, -0.04, 0.37], s: [1.1, 0.7, 0.6] });
      for (const s of [-1, 1]) b.add(new BoxGeometry(0.035, 0.05, 0.03), WHITE, { p: [s * 0.07, -0.21, 0.35] });
    },
    extras(b) {
      b.add(new TorusGeometry(0.24, 0.045, 8, 20), PALETTE.coral, { p: [0, 0.3, 0.04], r: [Math.PI / 2 - 0.15, 0, 0] });
      b.add(new CylinderGeometry(0.05, 0.05, 0.02, 12), PALETTE.gold, { p: [0, 0.22, 0.28], r: [Math.PI / 2 - 0.3, 0, 0] });
    },
    tail(b, body) {
      b.add(new SphereGeometry(0.05, 8, 6), body, { p: [0, 0.62, -0.33] });
    },
  },
  bunny: {
    eyes: { y: 0.06, z: 0.27, spacing: 0.12, radius: 0.09 },
    mouth: [0, -0.16, 0.3],
    mouthScale: 0.7,
    crown: 0.78,
    bow: PALETTE.violet,
    headScale: [1.02, 1, 1],
    features(b, body, accent) {
      for (const s of [-1, 1]) {
        const tilt = -s * 0.16;
        b.add(new CapsuleGeometry(0.075, 0.34, 6, 12), body, { p: [s * 0.13, 0.5, -0.04], r: [-0.12, 0, tilt] });
        b.add(new CapsuleGeometry(0.042, 0.26, 4, 10), accent, { p: [s * 0.132, 0.49, 0.01], r: [-0.12, 0, tilt], s: [1, 1, 0.5] });
        b.add(new SphereGeometry(0.06, 9, 6), BLUSH, { p: [s * 0.2, -0.08, 0.25], s: [1, 0.6, 0.4] });
        b.add(new SphereGeometry(0.07, 9, 6), WHITE, { p: [s * 0.05, -0.09, 0.3] });
      }
      b.add(new SphereGeometry(0.035, 9, 6), accent, { p: [0, -0.04, 0.35], s: [1.2, 0.9, 1] });
      for (const s of [-1, 1]) b.add(new BoxGeometry(0.034, 0.055, 0.02), WHITE, { p: [s * 0.019, -0.18, 0.33] });
    },
    tail(b) {
      b.add(new SphereGeometry(0.1, 9, 6), WHITE, { p: [0, 0.62, -0.34] });
    },
  },
  frog: {
    eyes: { y: 0.24, z: 0.18, spacing: 0.15, radius: 0.094, wide: true },
    mouth: [0, -0.08, 0.3],
    mouthScale: 2.1,
    crown: 0.4,
    bow: PALETTE.mustard,
    headScale: [1.2, 0.84, 1.02],
    features(b, body, accent) {
      for (const s of [-1, 1]) {
        b.add(new SphereGeometry(0.125, 10, 7), body, { p: [s * 0.15, 0.2, 0.12] });
        b.add(new SphereGeometry(0.06, 9, 6), BLUSH, { p: [s * 0.23, -0.06, 0.24], s: [1, 0.6, 0.4] });
        b.add(new SphereGeometry(0.014, 6, 4), NOSE, { p: [s * 0.035, 0.02, 0.33] });
      }
      b.add(new SphereGeometry(0.2, 10, 7), accent, { p: [0, -0.14, 0.14], s: [1.25, 0.6, 1] });
    },
    tail() {},
  },
  bear: {
    eyes: { y: 0.07, z: 0.27, spacing: 0.125, radius: 0.086 },
    mouth: [0, -0.19, 0.33],
    mouthScale: 0.9,
    crown: 0.36,
    bow: PALETTE.coral,
    headScale: [1.07, 0.98, 1],
    features(b, body, accent) {
      for (const s of [-1, 1]) {
        b.add(new SphereGeometry(0.11, 9, 6), body, { p: [s * 0.23, 0.25, -0.02] });
        b.add(new SphereGeometry(0.065, 9, 6), accent, { p: [s * 0.23, 0.25, 0.04], s: [1, 1, 0.5] });
        b.add(new SphereGeometry(0.055, 9, 6), BLUSH, { p: [s * 0.21, -0.08, 0.25], s: [1, 0.6, 0.4] });
      }
      b.add(new SphereGeometry(0.14, 10, 7), accent, { p: [0, -0.1, 0.26], s: [1.1, 0.8, 0.9] });
      b.add(new SphereGeometry(0.055, 9, 6), NOSE, { p: [0, -0.05, 0.38], s: [1.2, 0.8, 0.7] });
    },
    tail(b, body) {
      b.add(new SphereGeometry(0.07, 8, 6), body, { p: [0, 0.62, -0.33] });
    },
  },
  cat: {
    eyes: { y: 0.07, z: 0.265, spacing: 0.13, radius: 0.09 },
    mouth: [0, -0.16, 0.31],
    mouthScale: 0.75,
    crown: 0.42,
    bow: PALETTE.pink,
    headScale: [1.1, 0.95, 1],
    features(b, body, accent) {
      for (const s of [-1, 1]) {
        b.add(new ConeGeometry(0.12, 0.22, 4), body, { p: [s * 0.2, 0.3, 0], r: [0, Math.PI / 4, -s * 0.38] });
        b.add(new ConeGeometry(0.07, 0.14, 4), accent, { p: [s * 0.195, 0.29, 0.04], r: [0, Math.PI / 4, -s * 0.38] });
        b.add(new SphereGeometry(0.075, 9, 6), accent, { p: [s * 0.05, -0.1, 0.29] });
        b.add(new SphereGeometry(0.055, 9, 6), BLUSH, { p: [s * 0.22, -0.07, 0.24], s: [1, 0.6, 0.4] });
        for (let k = -1; k <= 1; k++) {
          b.add(new BoxGeometry(0.17, 0.008, 0.008), INK, { p: [s * 0.22, -0.1 + k * 0.028, 0.27], r: [0, 0, s * k * 0.12] });
        }
      }
      b.add(new ConeGeometry(0.032, 0.03, 3), BLUSH, { p: [0, -0.05, 0.345], r: [Math.PI / 2 + 0.3, 0, Math.PI] });
      for (const x of [-0.06, 0, 0.06]) b.add(new BoxGeometry(0.025, 0.1, 0.02), '#7C8499', { p: [x, 0.26, 0.21], r: [-0.7, 0, 0] });
    },
    tail(b, body) {
      b.add(new CapsuleGeometry(0.05, 0.5, 4, 8), body, { p: [0.2, 0.85, -0.38], r: [0.2, 0, -0.35] });
      b.add(new SphereGeometry(0.065, 8, 6), '#7C8499', { p: [0.3, 1.12, -0.42] });
    },
  },
  owl: {
    eyes: { y: 0.06, z: 0.255, spacing: 0.135, radius: 0.1, iris: '#FFD34D' },
    mouth: null,
    mouthScale: 1,
    crown: 0.42,
    bow: PALETTE.coral,
    headScale: [1.1, 1, 1],
    features(b, body, accent) {
      for (const s of [-1, 1]) {
        b.add(new ConeGeometry(0.07, 0.2, 8), body, { p: [s * 0.22, 0.3, -0.02], r: [0, 0, -s * 0.65] });
        b.add(new SphereGeometry(0.15, 10, 7), '#E7DAFF', { p: [s * 0.13, 0.05, 0.215], s: [1, 1, 0.45] });
      }
      b.add(new ConeGeometry(0.055, 0.14, 10), accent, { p: [0, -0.08, 0.32], r: [Math.PI - 0.5, 0, 0] });
      b.add(new SphereGeometry(0.1, 9, 6), '#A58AD6', { p: [0, 0.22, 0.18], s: [1.4, 0.5, 0.6] });
    },
    extras(b) {
      for (const [x, y] of [
        [-0.07, 0.02],
        [0.07, 0.02],
        [0, -0.08],
        [-0.08, -0.14],
        [0.08, -0.14],
      ]) {
        b.add(new ConeGeometry(0.03, 0.05, 3), '#8C6BC2', { p: [x, y, 0.3], r: [Math.PI, 0, 0], s: [1, 1, 0.4] });
      }
    },
  },
};

export function species(avatar: AvatarId): Species {
  return SPECIES[avatar];
}

export interface AnimalParts {
  base: BufferGeometry;
  body: BufferGeometry;
  head: BufferGeometry;
  arm: BufferGeometry;
  eyes: BufferGeometry;
  eyesX: BufferGeometry;
  species: Species;
}

const partsCache = new Map<string, AnimalParts>();

export function animalParts(avatar: AvatarId, grey: boolean): AnimalParts {
  const key = `${avatar}:${grey ? 1 : 0}`;
  let p = partsCache.get(key);
  if (!p) {
    p = buildParts(avatar, grey);
    partsCache.set(key, p);
  }
  return p;
}

function buildParts(avatar: AvatarId, grey: boolean): AnimalParts {
  const tint = grey ? greyTint : undefined;
  const sp = SPECIES[avatar];
  const { body, accent } = AVATAR_COLORS[avatar];
  const belly = BELLY[avatar];

  // Base: chair + legs + tail (stays put while the upper body animates).
  const base = new GeoBuilder(tint);
  chair(base, CUSHIONS[avatar]);
  for (const s of [-1, 1]) {
    base.add(new CapsuleGeometry(0.11, 0.22, 3, 8), body, { p: [s * 0.15, 0.62, 0.2], r: [Math.PI / 2, 0, 0] });
    base.add(new CapsuleGeometry(0.09, 0.26, 3, 8), body, { p: [s * 0.16, 0.34, 0.37] });
    base.add(new SphereGeometry(0.11, 8, 6), avatar === 'owl' ? PALETTE.mustard : accent, {
      p: [s * 0.16, 0.08, 0.45],
      s: [1, 0.6, 1.3],
    });
  }
  sp.tail?.(base, body, accent);

  // Torso (centred on its own origin so the highlight hull can scale around it).
  const torso = new GeoBuilder(tint);
  torso.add(new SphereGeometry(0.36, 18, 12), body, { s: [1, 1.02, 0.88] });
  torso.add(new SphereGeometry(0.25, 10, 7), belly, { p: [0, -0.06, 0.2], s: [1, 1.05, 0.55] });
  sp.extras?.(torso, body, accent);
  // Bow tie at the collar.
  for (const s of [-1, 1]) {
    torso.add(new ConeGeometry(0.07, 0.12, 8), sp.bow, { p: [s * 0.065, 0.24, 0.27], r: [0, 0, (s * Math.PI) / 2] });
  }
  torso.add(new SphereGeometry(0.035, 8, 6), sp.bow, { p: [0, 0.24, 0.29] });

  // Head.
  const head = new GeoBuilder(tint);
  head.add(new SphereGeometry(R, 22, 14), body, { s: sp.headScale });
  sp.features(head, body, accent);

  // Arm: from the shoulder along +z, paw at the end.
  const arm = new GeoBuilder(tint);
  arm.add(new CapsuleGeometry(0.078, 0.44, 3, 8), body, { p: [0, 0, 0.27], r: [Math.PI / 2, 0, 0] });
  arm.add(new SphereGeometry(0.1, 10, 6), avatar === 'owl' ? '#A58AD6' : body, { p: [0, 0, 0.58], s: [1.05, 0.8, 1] });

  return {
    base: base.build(),
    body: torso.build(),
    head: head.build(),
    arm: arm.build(),
    eyes: eyesGeometry(sp.eyes, tint),
    eyesX: eyesXGeometry(sp.eyes),
    species: sp,
  };
}

const BELLY: Record<AvatarId, string> = {
  pig: '#FFD0DC',
  fox: '#FFF1E0',
  bulldog: '#F0CFA8',
  bunny: '#FFE3EF',
  frog: '#F6FFC9',
  bear: '#E8C8A0',
  cat: '#FFD1A9',
  owl: '#E7DAFF',
};

const CUSHIONS: Record<AvatarId, string> = {
  pig: PALETTE.teal,
  fox: PALETTE.mustard,
  bulldog: PALETTE.violet,
  bunny: PALETTE.coral,
  frog: PALETTE.pink,
  bear: PALETTE.teal,
  cat: PALETTE.coral,
  owl: PALETTE.mustard,
};

function chair(b: GeoBuilder, cushion: string) {
  const wood = '#B8702F';
  const dark = '#8E5220';
  b.add(new BoxGeometry(0.66, 0.08, 0.6), wood, { p: [0, 0.48, 0] });
  b.add(new CylinderGeometry(0.28, 0.3, 0.07, 14), cushion, { p: [0, 0.55, 0.02], s: [1.05, 1, 0.95] });
  for (const x of [-0.27, 0.27]) {
    for (const z of [-0.24, 0.24]) b.add(new CylinderGeometry(0.035, 0.03, 0.46, 6, 1, true), dark, { p: [x, 0.23, z] });
    b.add(new CylinderGeometry(0.035, 0.035, 0.75, 6, 1, true), dark, { p: [x, 0.88, -0.27] });
  }
  b.add(new BoxGeometry(0.66, 0.2, 0.06), wood, { p: [0, 1.17, -0.27] });
  b.add(new CylinderGeometry(0.1, 0.1, 0.061, 12), cushion, { p: [0, 1.17, -0.25], r: [Math.PI / 2, 0, 0] });
  b.add(new BoxGeometry(0.6, 0.05, 0.05), dark, { p: [0, 0.83, -0.27] });
}

/** Big glossy cartoon eyes (both), centred on the eye line so they can blink by scaling y. */
function eyesGeometry(e: EyeStyle, tint?: (c: import('three').Color) => import('three').Color): BufferGeometry {
  const b = new GeoBuilder(tint);
  for (const s of [-1, 1]) {
    const x = s * e.spacing;
    b.add(new SphereGeometry(e.radius, 14, 8, 0, Math.PI * 2, 0, Math.PI), WHITE, { p: [x, 0, 0], s: [1, 1.08, 0.62] });
    if (e.iris) b.add(new SphereGeometry(e.radius * 0.72, 10, 6), e.iris, { p: [x, 0, e.radius * 0.28], s: [1, 1, 0.5] });
    const pr = e.radius * (e.iris ? 0.5 : 0.62);
    b.add(new SphereGeometry(pr, 10, 6), INK, {
      p: [x + s * -0.008, -0.004, e.radius * 0.42],
      s: e.wide ? [1.35, 0.7, 0.5] : [1, 1.08, 0.5],
    });
    b.add(new SphereGeometry(e.radius * 0.22, 6, 4), WHITE, { p: [x + 0.018, e.radius * 0.32, e.radius * 0.66] });
    b.add(new SphereGeometry(e.radius * 0.1, 5, 3), WHITE, { p: [x - 0.02, -e.radius * 0.22, e.radius * 0.66] });
  }
  return b.build();
}

/** "X X" eyes for eliminated characters. */
function eyesXGeometry(e: EyeStyle): BufferGeometry {
  const b = new GeoBuilder();
  for (const s of [-1, 1]) {
    for (const a of [-1, 1]) {
      b.add(new BoxGeometry(e.radius * 1.7, 0.028, 0.03), INK, { p: [s * e.spacing, 0, e.radius * 0.45], r: [0, 0, a * 0.785] });
    }
  }
  return b.build();
}

// ── Shared small meshes ──

let mouths: { smile: BufferGeometry; sad: BufferGeometry; open: BufferGeometry; grin: BufferGeometry } | null = null;

export function mouthGeometries() {
  if (mouths) return mouths;
  const arc = (rot: number, r = 0.05) => new GeoBuilder().add(new TorusGeometry(r, 0.014, 6, 14, Math.PI), NOSE, { r: [0, 0, rot] }).build();
  const open = new GeoBuilder()
    .add(new SphereGeometry(0.04, 10, 7), NOSE, { s: [1, 1.15, 0.45] })
    .add(new SphereGeometry(0.022, 8, 6), '#FF7A8A', { p: [0, -0.018, 0.012], s: [1, 0.6, 0.4] })
    .build();
  const grin = new GeoBuilder()
    .add(new SphereGeometry(0.055, 14, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), NOSE, { s: [1, 0.9, 0.4] })
    .add(new SphereGeometry(0.03, 8, 6), '#FF7A8A', { p: [0, -0.03, 0.006], s: [1, 0.5, 0.4] })
    .build();
  mouths = { smile: arc(Math.PI), sad: arc(0), open, grin };
  return mouths;
}

let antenna: BufferGeometry | null = null;

/** Little robot antenna + ear bolts for bot-controlled seats. */
export function antennaGeometry(): BufferGeometry {
  if (antenna) return antenna;
  antenna = new GeoBuilder()
    .add(new CylinderGeometry(0.012, 0.012, 0.2, 6), INK, { p: [0, 0.1, 0] })
    .add(new SphereGeometry(0.042, 9, 6), PALETTE.coral, { p: [0, 0.22, 0] })
    .add(new CylinderGeometry(0.05, 0.06, 0.03, 12), '#9AA3B5', { p: [0, 0.01, 0] })
    .build();
  return antenna;
}

let emptyChairs: BufferGeometry | null = null;

export function emptyChairGeometry(): BufferGeometry {
  if (emptyChairs) return emptyChairs;
  const b = new GeoBuilder();
  chair(b, PALETTE.cream);
  emptyChairs = b.build();
  return emptyChairs;
}
