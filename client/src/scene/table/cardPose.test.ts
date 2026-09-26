/**
 * What the first-person camera sees of the cards on the felt (regression for perf3d-4:
 * revealed opponent cards used to lie flat and project 11–19 px tall at 1366×768), and how
 * they get there (SCN-4: the reveal flip must not dip a standing card through the felt).
 */
import { describe, expect, it } from 'vitest';
import { Euler, Group, Matrix4, PerspectiveCamera, Quaternion, Vector3 } from 'three';
import { fitFraming, gameInsets, seatFramePoints, seatPose } from '../framing';
import { CARD_H, CARD_W, HEAD_Y, SEAT_RADIUS, TABLE, frameAt, slotAngle } from '../layout';
import { PROP, SHOWN_PROP, homePose, settleCard, type Pose } from './cardPose';
import { seatCoinSlot } from './coinLayout';

/** Same hierarchy as Cards.tsx (face up: the flipper adds nothing). */
function cardMatrix(p: Pose): Matrix4 {
  const outer = new Matrix4().compose(new Vector3(p.x, p.y, p.z), new Quaternion().setFromEuler(new Euler(0, p.yaw, 0)), new Vector3(1, 1, 1));
  return outer.multiply(new Matrix4().makeRotationX(-Math.PI / 2 + p.prop));
}

function corners(p: Pose): Vector3[] {
  const m = cardMatrix(p);
  return [
    [-CARD_W / 2, 0],
    [CARD_W / 2, 0],
    [-CARD_W / 2, CARD_H],
    [CARD_W / 2, CARD_H],
  ].map(([x, y]) => new Vector3(x, y, 0).applyMatrix4(m));
}

interface Box {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

function camera(n: number, w: number, h: number, showLog: boolean) {
  const pose = seatPose(n);
  const fr = fitFraming(pose, seatFramePoints(n), w, h, gameInsets(showLog, w));
  const cam = new PerspectiveCamera(fr.fov, w / h, 0.1, 60);
  cam.position.copy(pose.position);
  cam.lookAt(pose.target);
  cam.setViewOffset(w, h, fr.offsetX, fr.offsetY, w, h);
  cam.updateProjectionMatrix();
  cam.updateMatrixWorld();
  const project = (v: Vector3) => {
    const q = v.clone().project(cam);
    return { x: ((q.x + 1) / 2) * w, y: ((1 - q.y) / 2) * h };
  };
  const box = (pts: Vector3[]): Box => {
    const s = pts.map(project);
    return { x0: Math.min(...s.map((p) => p.x)), x1: Math.max(...s.map((p) => p.x)), y0: Math.min(...s.map((p) => p.y)), y1: Math.max(...s.map((p) => p.y)) };
  };
  return { cam, project, box };
}

const pose = (): Pose => ({ x: 0, y: 0, z: 0, yaw: 0, prop: 0 });

function insidePolygon(pt: { x: number; y: number }, poly: { x: number; y: number }[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > pt.y !== b.y > pt.y && pt.x < ((b.x - a.x) * (pt.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}
const SCREENS: [number, number][] = [
  [1366, 768],
  [1920, 1080],
];

describe('revealed opponent cards', () => {
  it('stand up facing the camera and are readable (≥ 30 px tall at 1366×768, up to 6 players)', () => {
    for (const [w, h] of SCREENS) {
      for (const showLog of [true, false]) {
        for (let n = 2; n <= 6; n++) {
          const { cam, box } = camera(n, w, h, showLog);
          for (let slot = 1; slot < n; slot++) {
            const f = frameAt(slotAngle(slot, n), SEAT_RADIUS);
            for (const s of [0, 1]) {
              const p = homePose({ slot: s, isLocal: false, revealed: true }, f, pose());
              expect(p.prop).toBe(SHOWN_PROP);
              const b = box(corners(p));
              expect(b.y1 - b.y0, `${w}x${h} n=${n} seat ${slot} card ${s}`).toBeGreaterThanOrEqual(w === 1366 ? 30 : 45);
              // The printed face (plane +z) points at the camera, not away from it.
              const m = cardMatrix(p);
              const normal = new Vector3(0, 0, 1).transformDirection(m);
              const centre = new Vector3(0, CARD_H / 2, 0).applyMatrix4(m);
              expect(normal.dot(cam.position.clone().sub(centre).normalize())).toBeGreaterThan(0.6);
            }
          }
        }
      }
    }
  });

  it("don't hide each other or the owner's face", () => {
    const [w, h] = [1366, 768];
    for (let n = 2; n <= 6; n++) {
      const { project, box } = camera(n, w, h, true);
      for (let slot = 1; slot < n; slot++) {
        const f = frameAt(slotAngle(slot, n), SEAT_RADIUS);
        const [a, b] = [0, 1].map((s) => box(corners(homePose({ slot: s, isLocal: false, revealed: true }, f, pose()))));
        expect(Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0), `n=${n} seat ${slot} pair`).toBeLessThanOrEqual(0);
        // Card tops stay below the character's face.
        const face = project(new Vector3(f.x, HEAD_Y - 0.2, f.z));
        expect(Math.min(a.y0, b.y0)).toBeGreaterThan(face.y);
      }
    }
  });

  it("never hide anyone's coin stack, even with every card revealed at a full table", () => {
    for (const [w, h] of SCREENS) {
      for (let n = 2; n <= 6; n++) {
        const { cam, project } = camera(n, w, h, true);
        const cards = [];
        for (let slot = 1; slot < n; slot++) {
          const f = frameAt(slotAngle(slot, n), SEAT_RADIUS);
          for (const s of [0, 1]) {
            const c = corners(homePose({ slot: s, isLocal: false, revealed: true }, f, pose()));
            const quad = [c[0], c[1], c[3], c[2]]; // outline order
            const normal = new Vector3().subVectors(c[1], c[0]).cross(new Vector3().subVectors(c[2], c[0]));
            cards.push({ seat: slot, screen: quad.map(project), normal, at: c[0] });
          }
        }
        for (let slot = 1; slot < n; slot++) {
          for (let i = 0; i < 12; i++) {
            const top = seatCoinSlot(slotAngle(slot, n), false, i, new Vector3());
            top.y += 0.009;
            const sp = project(top);
            for (const c of cards) {
              if (!insidePolygon(sp, c.screen)) continue;
              // Covered only if the card plane separates the coin from the camera.
              const camSide = Math.sign(c.normal.dot(cam.position.clone().sub(c.at)));
              const coinSide = Math.sign(c.normal.dot(top.clone().sub(c.at)));
              expect(coinSide, `${w}x${h} n=${n}: seat ${slot} coin ${i} behind seat ${c.seat}'s card`).toBe(camSide);
            }
          }
        }
      }
    }
  });

  it("barely touch the neighbouring seats' revealed cards, even at a full table", () => {
    for (const [w, h] of SCREENS) {
      for (let n = 3; n <= 6; n++) {
        const { box } = camera(n, w, h, true);
        const spans = [];
        for (let slot = 1; slot < n; slot++) {
          const f = frameAt(slotAngle(slot, n), SEAT_RADIUS);
          const b = [0, 1].map((s) => box(corners(homePose({ slot: s, isLocal: false, revealed: true }, f, pose()))));
          spans.push({ x0: Math.min(b[0].x0, b[1].x0), x1: Math.max(b[0].x1, b[1].x1) });
        }
        for (let i = 1; i < spans.length; i++) {
          expect(spans[i - 1].x1 - spans[i].x0, `${w}x${h} n=${n} seats ${i}/${i + 1}`).toBeLessThanOrEqual(6);
        }
      }
    }
  });

  it('keep the same screen side as when they lay face down', () => {
    const [w, h] = [1366, 768];
    for (let n = 2; n <= 6; n++) {
      const { project } = camera(n, w, h, true);
      for (let slot = 1; slot < n; slot++) {
        const f = frameAt(slotAngle(slot, n), SEAT_RADIUS);
        const x = (s: number, revealed: boolean) => {
          const p = homePose({ slot: s, isLocal: false, revealed }, f, pose());
          return project(corners(p).reduce((acc, v) => acc.add(v), new Vector3()).multiplyScalar(0.25)).x;
        };
        expect(Math.sign(x(1, false) - x(0, false))).toBe(Math.sign(x(1, true) - x(0, true)));
      }
    }
  });
});

describe('other card poses', () => {
  it('hidden opponent cards lie flat; own cards keep their prop', () => {
    const f = frameAt(slotAngle(2, 4), SEAT_RADIUS);
    expect(homePose({ slot: 0, isLocal: false, revealed: false }, f, pose()).prop).toBe(0);
    const own = frameAt(0, SEAT_RADIUS);
    expect(homePose({ slot: 1, isLocal: true, revealed: false }, own, pose()).prop).toBe(PROP);
    expect(homePose({ slot: 1, isLocal: true, revealed: true }, own, pose()).prop).toBe(0);
  });
});

describe('card flips', () => {
  /**
   * Runs Cards.tsx's per-frame easing from `from` to `to`; returns the lowest corner (m above
   * the felt), the highest hop of the pivot above the resting height, and the final pose.
   */
  function lowestCorner(from: Pose, fromUp: boolean, to: Pose, toUp: boolean, fps: number): { min: number; hop: number; end: Pose } {
    const outer = new Group();
    const flipper = new Group();
    const inner = new Group();
    const plane = new Group();
    outer.add(flipper);
    flipper.add(inner);
    inner.add(plane);
    // Resting at `from` (the placed pose in Cards.tsx).
    outer.position.set(from.x, from.y, from.z);
    outer.rotation.y = from.yaw;
    flipper.rotation.z = fromUp ? 0 : Math.PI;
    inner.rotation.x = -Math.PI / 2 + from.prop;
    const pts = [
      [-CARD_W / 2, 0],
      [CARD_W / 2, 0],
      [-CARD_W / 2, CARD_H],
      [CARD_W / 2, CARD_H],
    ].map(([x, y]) => new Vector3(x, y, 0));
    const v = new Vector3();
    let min = Infinity;
    let hop = 0;
    for (let i = 0; i < fps * 2; i++) {
      settleCard({ outer, flipper, inner }, to, toUp, 1 / fps);
      hop = Math.max(hop, outer.position.y - to.y);
      outer.updateMatrixWorld(true);
      for (const p of pts) min = Math.min(min, v.copy(p).applyMatrix4(plane.matrixWorld).y - TABLE.feltY);
    }
    const end = { x: outer.position.x, y: outer.position.y, z: outer.position.z, yaw: outer.rotation.y, prop: inner.rotation.x + Math.PI / 2 };
    return { min, hop, end };
  }

  it('a revealed opponent card turns face up, then stands, without dipping into the felt', () => {
    for (const fps of [30, 60, 144]) {
      for (let n = 2; n <= 6; n++) {
        for (let seat = 1; seat < n; seat++) {
          const f = frameAt(slotAngle(seat, n), SEAT_RADIUS);
          for (const slot of [0, 1]) {
            const down = homePose({ slot, isLocal: false, revealed: false }, f, pose());
            const up = homePose({ slot, isLocal: false, revealed: true }, f, pose());
            const where = `${fps} FPS n=${n} seat ${seat} card ${slot}`;
            const reveal = lowestCorner(down, false, up, true, fps);
            expect(reveal.min, `reveal ${where}`).toBeGreaterThanOrEqual(0);
            // A plain flip: it does not have to jump to clear a card already standing up.
            expect(reveal.hop, `reveal ${where}`).toBeLessThan(0.17);
            // …and still ends standing where it should.
            expect(reveal.end.prop, where).toBeCloseTo(SHOWN_PROP, 2);
            expect(reveal.end.y, where).toBeCloseTo(up.y, 3);
            // The other way (a resync straight into a new game keeps the component).
            expect(lowestCorner(up, true, down, false, fps).min, `hide ${where}`).toBeGreaterThanOrEqual(0);
          }
        }
      }
    }
  });

  it("the local player's own cards keep their prop and stay above the felt when revealed", () => {
    const own = frameAt(0, SEAT_RADIUS);
    for (const slot of [0, 1]) {
      const hidden = homePose({ slot, isLocal: true, revealed: false }, own, pose());
      const shown = homePose({ slot, isLocal: true, revealed: true }, own, pose());
      const r = lowestCorner(hidden, true, shown, true, 60);
      expect(r.min).toBeGreaterThanOrEqual(0);
      expect(r.end.prop).toBeCloseTo(0, 2);
    }
  });
});
