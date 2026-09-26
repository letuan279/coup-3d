/**
 * Shared materials (module-level singletons) so the whole scene compiles a handful of shader
 * programs and objects can share them freely.
 */
import {
  AdditiveBlending,
  BackSide,
  Color,
  DoubleSide,
  MeshBasicMaterial,
  MeshLambertMaterial,
  MeshStandardMaterial,
  MeshToonMaterial,
  PointsMaterial,
  SpriteMaterial,
  type Texture,
} from 'three';
import type { Character } from '@shared/types';
import type { Lang } from '../store/useGame';
import { PALETTE } from '../art/palette';
import {
  cardBackTexture,
  cardFaceTexture,
  feltTexture,
  floorTexture,
  ghostTexture,
  glowTexture,
  ringTexture,
  rugTexture,
  shaftTexture,
  signTexture,
  skyTexture,
  toonRamp,
  wallTexture,
} from './textures';

function once<T>(make: () => T): () => T {
  let v: T | undefined;
  return () => (v ??= make());
}

/** Cartoon shading for characters (vertex colours). */
export const toonMat = once(() => new MeshToonMaterial({ vertexColors: true, gradientMap: toonRamp() }));

/** Matte lit material for the baked tavern props (vertex colours). */
export const propMat = once(() => new MeshLambertMaterial({ vertexColors: true }));

/** Wooden table / furniture with a soft sheen (vertex colours). */
export const woodMat = once(() => new MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0 }));

const signMats = new Map<Lang, MeshBasicMaterial>();

/** The tavern's painted name board (one material per language). */
export function signMat(lang: Lang): MeshBasicMaterial {
  let m = signMats.get(lang);
  if (!m) {
    m = new MeshBasicMaterial({ map: signTexture(lang), toneMapped: false });
    signMats.set(lang, m);
  }
  return m;
}

export const floorMat = once(() => new MeshLambertMaterial({ map: floorTexture() }));
export const wallMat = once(() => new MeshLambertMaterial({ map: wallTexture() }));
export const feltMat = once(() => new MeshLambertMaterial({ map: feltTexture() }));
export const rugMat = once(() => new MeshLambertMaterial({ map: rugTexture() }));
export const skyMat = once(() => new MeshBasicMaterial({ map: skyTexture(), toneMapped: false }));

export const shaftMat = once(
  () =>
    new MeshBasicMaterial({
      map: shaftTexture(),
      color: new Color('#FFD98A'),
      transparent: true,
      opacity: 0.22,
      blending: AdditiveBlending,
      depthWrite: false,
      side: DoubleSide,
      toneMapped: false,
    }),
);

export const moteMat = once(
  () =>
    new PointsMaterial({
      map: glowTexture(),
      color: new Color('#FFE9A8'),
      size: 0.05,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.8,
      blending: AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    }),
);

export const floorPatchMat = once(
  () =>
    new MeshBasicMaterial({
      map: glowTexture(),
      color: new Color('#FFE3A0'),
      transparent: true,
      opacity: 0.35,
      blending: AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    }),
);

export const coinMat = once(
  () =>
    new MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.35,
      metalness: 0.25,
      emissive: new Color('#6B3F00'),
      emissiveIntensity: 0.35,
    }),
);

/** Additive glowing ring decal; colour set per mesh via a cloned material. */
export function ringMat(color: string): MeshBasicMaterial {
  return new MeshBasicMaterial({
    map: ringTexture(),
    color: new Color(color),
    transparent: true,
    blending: AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  });
}

export const actorRingMat = once(() => ringMat('#FFB23E'));
export const targetRingMat = once(() => ringMat('#FF5A4A'));
export const hoverRingMat = once(() => ringMat('#FFFFFF'));

/** Inverted-hull outline for highlighted characters. */
export const targetHullMat = once(
  () => new MeshBasicMaterial({ color: new Color('#FF6B5B'), side: BackSide, toneMapped: false }),
);
export const hoverHullMat = once(
  () => new MeshBasicMaterial({ color: new Color('#FFF6E5'), side: BackSide, toneMapped: false }),
);

export const ghostMat = once(
  () => new SpriteMaterial({ map: ghostTexture(), transparent: true, depthWrite: false, opacity: 0.9, toneMapped: false }),
);

/** Invisible but raycastable (hit boxes cost no draw call: material.visible = false). */
export const hitMat = once(() => new MeshBasicMaterial({ visible: false }));

// ── Cards ──
const cardMats = new Map<string, MeshBasicMaterial>();

/** Card face material; `dead` = revealed (lost) influence, drawn darker. */
export function cardFaceMat(character: Character, lang: Lang, dead: boolean): MeshBasicMaterial {
  const key = `${character}:${lang}:${dead ? 1 : 0}`;
  let mat = cardMats.get(key);
  if (!mat) {
    mat = new MeshBasicMaterial({
      map: cardFaceTexture(character, lang),
      color: new Color(dead ? '#8C8496' : '#FFFFFF'),
      toneMapped: false,
    });
    cardMats.set(key, mat);
  }
  return mat;
}

export const cardBackMat = once(
  () => new MeshBasicMaterial({ map: cardBackTexture() as Texture, color: new Color('#F4F0FF'), toneMapped: false }),
);

export const deckSideMat = once(() => new MeshLambertMaterial({ color: new Color(PALETTE.cream) }));
