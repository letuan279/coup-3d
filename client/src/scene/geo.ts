/**
 * Tiny helper to bake many primitives into ONE vertex-coloured BufferGeometry, so a whole
 * prop (a character's head, the tavern shell, a chair) costs a single draw call.
 */
import { BufferAttribute, BufferGeometry, Color, Euler, Matrix4, Quaternion, Vector3 } from 'three';
import type { ColorRepresentation } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export type Vec3 = readonly [number, number, number];

export interface PartOpts {
  /** Position. */
  p?: Vec3;
  /** Euler rotation (radians, XYZ). */
  r?: Vec3;
  /** Scale (uniform or per axis). */
  s?: number | Vec3;
}

const m = new Matrix4();
const q = new Quaternion();
const e = new Euler();
const pos = new Vector3();
const scl = new Vector3();
const col = new Color();

/** Maps a colour (in linear working space) to the colour actually baked — e.g. greyscale. */
export type Tint = (c: Color) => Color;

export class GeoBuilder {
  private parts: BufferGeometry[] = [];

  constructor(private readonly tint?: Tint) {}

  add(geo: BufferGeometry, color: ColorRepresentation, o: PartOpts = {}): this {
    col.set(color);
    if (this.tint) this.tint(col);
    const count = geo.attributes.position.count;
    const colors = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      colors[i * 3] = col.r;
      colors[i * 3 + 1] = col.g;
      colors[i * 3 + 2] = col.b;
    }
    for (const name of Object.keys(geo.attributes)) {
      if (name !== 'position' && name !== 'normal') geo.deleteAttribute(name);
    }
    geo.setAttribute('color', new BufferAttribute(colors, 3));
    e.set(o.r?.[0] ?? 0, o.r?.[1] ?? 0, o.r?.[2] ?? 0);
    q.setFromEuler(e);
    pos.set(o.p?.[0] ?? 0, o.p?.[1] ?? 0, o.p?.[2] ?? 0);
    if (typeof o.s === 'number') scl.setScalar(o.s);
    else scl.set(o.s?.[0] ?? 1, o.s?.[1] ?? 1, o.s?.[2] ?? 1);
    m.compose(pos, q, scl);
    geo.applyMatrix4(m);
    geo.clearGroups();
    this.parts.push(geo);
    return this;
  }

  /** Adds an already-coloured geometry (e.g. another builder's result) with a transform. */
  addBaked(geo: BufferGeometry, o: PartOpts = {}): this {
    const g = geo.clone();
    e.set(o.r?.[0] ?? 0, o.r?.[1] ?? 0, o.r?.[2] ?? 0);
    q.setFromEuler(e);
    pos.set(o.p?.[0] ?? 0, o.p?.[1] ?? 0, o.p?.[2] ?? 0);
    if (typeof o.s === 'number') scl.setScalar(o.s);
    else scl.set(o.s?.[0] ?? 1, o.s?.[1] ?? 1, o.s?.[2] ?? 1);
    m.compose(pos, q, scl);
    g.applyMatrix4(m);
    this.parts.push(g);
    return this;
  }

  get isEmpty(): boolean {
    return this.parts.length === 0;
  }

  build(): BufferGeometry {
    const allIndexed = this.parts.every((g) => g.index !== null);
    const parts = allIndexed ? this.parts : this.parts.map((g) => (g.index ? g.toNonIndexed() : g));
    const merged = mergeGeometries(parts, false);
    for (const g of this.parts) g.dispose();
    this.parts = [];
    if (!merged) throw new Error('GeoBuilder: merge failed');
    merged.computeBoundingSphere();
    merged.computeBoundingBox();
    return merged;
  }
}

/** Greyscale (slightly cool) tint used for eliminated characters. */
export const greyTint: Tint = (c) => {
  const l = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
  const v = 0.08 + l * 0.75;
  return c.setRGB(v * 0.96, v * 0.98, v * 1.06);
};
