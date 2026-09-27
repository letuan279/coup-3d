import { describe, expect, it } from 'vitest';
import { PerspectiveCamera, Vector3 } from 'three';
import { SEAT_RADIUS, frameAt, opponentAngles, slotAngle } from './layout';
import {
  fitFraming,
  gameFovRange,
  gameInsets,
  gameMargin,
  lobbyFovRange,
  lobbyFramePoints,
  lobbyInsets,
  lobbyPose,
  seatFramePoints,
  seatPose,
  type Insets,
} from './framing';

describe('seat layout', () => {
  it('puts a single opponent straight across the table', () => {
    expect(opponentAngles(1)).toEqual([Math.PI]);
  });

  it('spreads opponents symmetrically over the far arc, next player on the left', () => {
    for (let n = 2; n <= 5; n++) {
      const a = opponentAngles(n);
      expect(a).toHaveLength(n);
      for (let i = 1; i < n; i++) expect(a[i]).toBeGreaterThan(a[i - 1]);
      expect(a[0] + a[n - 1]).toBeCloseTo(2 * Math.PI);
      // Far arc only: never beside the camera.
      expect(a[0]).toBeGreaterThan(Math.PI / 2);
      // Slot 1 (next in turn order) sits on the local player's left (-x).
      expect(frameAt(slotAngle(1, n + 1)).x).toBeLessThan(0);
    }
  });

  it('builds seat frames that face the table centre', () => {
    for (const angle of [0, 1, 2.5, Math.PI, 4]) {
      const f = frameAt(angle);
      expect(Math.hypot(f.x, f.z)).toBeCloseTo(SEAT_RADIUS);
      // Model forward (+z) rotated by yaw must point at the centre (-out).
      expect(Math.sin(f.yaw)).toBeCloseTo(-f.outX);
      expect(Math.cos(f.yaw)).toBeCloseTo(-f.outZ);
      // right = facing × up
      expect(f.rightX * f.outX + f.rightZ * f.outZ).toBeCloseTo(0);
    }
    const local = frameAt(0);
    expect(local.rightX).toBeCloseTo(1); // local player's right is screen right
  });
});

function project(pose: ReturnType<typeof seatPose>, fov: number, ox: number, oy: number, w: number, h: number) {
  const cam = new PerspectiveCamera(fov, w / h, 0.1, 50);
  cam.position.copy(pose.position);
  cam.lookAt(pose.target);
  cam.setViewOffset(w, h, ox, oy, w, h);
  cam.updateMatrixWorld();
  return (p: Vector3) => {
    const q = p.clone().project(cam);
    return { x: ((q.x + 1) / 2) * w, y: ((1 - q.y) / 2) * h };
  };
}

function expectInside(pt: { x: number; y: number }, w: number, h: number, ins: Insets) {
  expect(pt.x).toBeGreaterThanOrEqual(ins.left - 0.5);
  expect(pt.x).toBeLessThanOrEqual(w - ins.right + 0.5);
  expect(pt.y).toBeGreaterThanOrEqual(ins.top - 0.5);
  expect(pt.y).toBeLessThanOrEqual(h - ins.bottom + 0.5);
}

describe('camera framing', () => {
  const screens: [number, number][] = [
    [1366, 768],
    [1920, 1080],
  ];

  it('keeps every opponent, the table centre and own cards inside the HUD-free area', () => {
    for (const [w, h] of screens) {
      for (const showLog of [true, false]) {
        for (let n = 2; n <= 6; n++) {
          const pose = seatPose(n);
          const pts = seatFramePoints(n);
          const ins = gameInsets(showLog, w);
          const fr = fitFraming(pose, pts, w, h, ins);
          expect(fr.fov).toBeGreaterThan(30);
          expect(fr.fov).toBeLessThan(75);
          const proj = project(pose, fr.fov, fr.offsetX, fr.offsetY, w, h);
          for (const p of pts) expectInside(proj(p), w, h, ins);
        }
      }
    }
  });

  it('centres the table in the clear area', () => {
    const [w, h] = [1366, 768];
    const pose = seatPose(4);
    const ins = gameInsets(true, w);
    const fr = fitFraming(pose, seatFramePoints(4), w, h, ins);
    const c = project(pose, fr.fov, fr.offsetX, fr.offsetY, w, h)(new Vector3(0, 0.79, 0));
    expect(Math.abs(c.x - (w - ins.right) / 2)).toBeLessThan(40);
  });

  it('keeps the whole table in view on phones, tablets and small laptops (both orientations)', () => {
    const small: [number, number][] = [
      [390, 844],
      [375, 667],
      [844, 390],
      [667, 375],
      [768, 1024],
      [1024, 768],
      [1280, 720],
    ];
    for (const [w, h] of small) {
      for (let n = 2; n <= 6; n++) {
        const pose = seatPose(n);
        const pts = seatFramePoints(n);
        const ins = gameInsets(false, w, h);
        const fr = fitFraming(pose, pts, w, h, ins, gameMargin(w, h), gameFovRange(w, h));
        const proj = project(pose, fr.fov, fr.offsetX, fr.offsetY, w, h);
        for (const p of pts) expectInside(proj(p), w, h, ins);
      }
      const lp = lobbyPose();
      const lins = lobbyInsets(w, h);
      const lpts = lobbyFramePoints();
      const lfr = fitFraming(lp, lpts, w, h, lins, 0.03, lobbyFovRange(w, h));
      const lproj = project(lp, lfr.fov, lfr.offsetX, lfr.offsetY, w, h);
      for (const p of lpts) expectInside(lproj(p), w, h, lins);
    }
  });

  it('frames the lobby between the side panels', () => {
    for (const [w, h] of screens) {
      const pose = lobbyPose();
      const ins = lobbyInsets(w);
      const pts = lobbyFramePoints();
      const fr = fitFraming(pose, pts, w, h, ins, 0.03, [30, 70]);
      const proj = project(pose, fr.fov, fr.offsetX, fr.offsetY, w, h);
      for (const p of pts) expectInside(proj(p), w, h, ins);
    }
  });
});
