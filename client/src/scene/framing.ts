/**
 * Camera framing: fits a set of world points into the part of the screen the HUD leaves free,
 * by choosing a vertical FOV and a projection offset (PerspectiveCamera.setViewOffset).
 * Pure three.js math — safe to run in tests (no WebGL).
 */
import { Matrix4, Vector3 } from 'three';
import { LOBBY_PORTRAIT_STRIP, LOBBY_SIDE_W, PORTRAIT_HUD, SHORT_DOCK_H, hudLayout, lobbyLayout } from '../ui/responsive';
import { CARD_RADIUS, HEAD_Y, LOCAL_CARD_RADIUS, PLATE_Y, TABLE, frameAt, seatCamera, slotAngle } from './layout';

export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface Framing {
  /** Vertical field of view in degrees for the full canvas. */
  fov: number;
  /** setViewOffset(width, height, offsetX, offsetY, width, height). */
  offsetX: number;
  offsetY: number;
}

export interface CameraPose {
  position: Vector3;
  target: Vector3;
}

const UP = new Vector3(0, 1, 0);
const mat = new Matrix4();
const inv = new Matrix4();
const tmp = new Vector3();

/**
 * Chooses fov + principal-point offset so that every point projects inside the clear rectangle
 * (canvas minus insets), shrunk by `margin` (fraction of the clear size on each side).
 */
export function fitFraming(
  pose: CameraPose,
  points: readonly Vector3[],
  width: number,
  height: number,
  insets: Insets,
  margin = 0.05,
  fovRange: [number, number] = [34, 72],
): Framing {
  mat.lookAt(pose.position, pose.target, UP);
  mat.setPosition(pose.position);
  inv.copy(mat).invert();

  let umin = Infinity;
  let umax = -Infinity;
  let vmin = Infinity;
  let vmax = -Infinity;
  for (const p of points) {
    tmp.copy(p).applyMatrix4(inv);
    if (tmp.z > -0.05) continue; // behind the camera — cannot be framed
    const u = tmp.x / -tmp.z;
    const v = tmp.y / -tmp.z;
    if (u < umin) umin = u;
    if (u > umax) umax = u;
    if (v < vmin) vmin = v;
    if (v > vmax) vmax = v;
  }

  const clearW = Math.max(80, width - insets.left - insets.right);
  const clearH = Math.max(80, height - insets.top - insets.bottom);
  const usableW = clearW * (1 - 2 * margin);
  const usableH = clearH * (1 - 2 * margin);
  const clearCx = insets.left + clearW / 2;
  const clearCy = insets.top + clearH / 2;

  if (!Number.isFinite(umin)) return { fov: 50, offsetX: width / 2 - clearCx, offsetY: height / 2 - clearCy };

  // Focal length (px) that fits the bounding box of the projected points.
  let f = Math.min(usableW / Math.max(1e-3, umax - umin), usableH / Math.max(1e-3, vmax - vmin));
  const fMin = height / 2 / Math.tan((fovRange[1] * Math.PI) / 360);
  const fMax = height / 2 / Math.tan((fovRange[0] * Math.PI) / 360);
  f = Math.min(fMax, Math.max(fMin, f));

  // Principal point so the bbox centre lands on the clear-rect centre.
  const px = clearCx - f * ((umin + umax) / 2);
  const py = clearCy + f * ((vmin + vmax) / 2);
  return {
    fov: (2 * Math.atan(height / 2 / f) * 180) / Math.PI,
    offsetX: width / 2 - px,
    offsetY: height / 2 - py,
  };
}

/**
 * HUD zones from docs/SPEC.md §4.1 (top bar, bottom hand/action bar, right log panel), per
 * screen mode (ui/responsive.ts): scaled with the HUD, or the stacked phone-portrait layout.
 * A log drawn over the table (phones) reserves nothing.
 */
export function gameInsets(showLog: boolean, width: number, height = 900): Insets {
  const hud = hudLayout(width, height);
  if (hud.mode === 'portrait') return { top: PORTRAIT_HUD.top, right: 0, bottom: PORTRAIT_HUD.dock, left: 0 };
  const s = hud.scale;
  // The phase banner takes the top centre; the table is framed below it.
  if (hud.mode === 'short') return { top: 92 * s, right: 0, bottom: (SHORT_DOCK_H + 20) * s, left: 0 };
  const right = showLog && !hud.logOverlay ? Math.min(320 * s, width * 0.25) : 0;
  return { top: 64 * s, right, bottom: 230 * s, left: 0 };
}

/** Framing margin: name plates stick out sideways from the framed points — more room on a narrow screen. */
export function gameMargin(width: number, height: number): number {
  return hudLayout(width, height).mode === 'portrait' ? 0.15 : 0.05;
}

/** FOV range for the game camera: a phone held upright needs a much taller view to fit the table's width. */
export function gameFovRange(width: number, height: number): [number, number] {
  return width < height ? [34, 125] : [34, 72];
}

/**
 * Lobby HUD: room code + seat list on the left, settings on the right, title on top (desktop);
 * one scrolling column on the right (side); a strip on top under the title (portrait).
 */
export function lobbyInsets(width: number, height = 900): Insets {
  const mode = lobbyLayout(width, height);
  if (mode === 'portrait') return { top: 58, right: 0, bottom: height * (1 - LOBBY_PORTRAIT_STRIP) - 58, left: 0 };
  if (mode === 'side') return { top: 8, right: Math.min(LOBBY_SIDE_W, width * 0.55) + 16, bottom: 8, left: 0 };
  return { top: 90, right: Math.min(360, width * 0.27), bottom: 16, left: Math.min(375, width * 0.28) };
}

export function lobbyFovRange(width: number, height: number): [number, number] {
  return width < height ? [30, 125] : [30, 70];
}

/** First-person seat pose for the local player at a table of `total` seats. */
export function seatPose(total: number, out?: CameraPose): CameraPose {
  const c = seatCamera(total);
  const pose = out ?? { position: new Vector3(), target: new Vector3() };
  pose.position.set(0, c.height, c.radius);
  pose.target.set(0, c.lookY, -c.lookIn);
  return pose;
}

/** Elevated lobby pose looking over the table at the seated players. */
export function lobbyPose(out?: CameraPose): CameraPose {
  const pose = out ?? { position: new Vector3(), target: new Vector3() };
  pose.position.set(0, 3.9, 4.3);
  pose.target.set(0, 0.85, -0.3);
  return pose;
}

/** Key points that must stay visible in the first-person view of a `total`-seat table. */
export function seatFramePoints(total: number): Vector3[] {
  const pts: Vector3[] = [];
  const f = frameAt(0);
  for (let slot = 1; slot < total; slot++) {
    frameAt(slotAngle(slot, total), undefined, f);
    // Nameplate (+ a little room for its height) and both shoulders.
    pts.push(new Vector3(f.x, PLATE_Y + 0.22, f.z));
    pts.push(new Vector3(f.x + f.rightX * 0.55, HEAD_Y, f.z + f.rightZ * 0.55));
    pts.push(new Vector3(f.x - f.rightX * 0.55, HEAD_Y, f.z - f.rightZ * 0.55));
    // Their cards on the felt.
    pts.push(new Vector3(f.outX * CARD_RADIUS, TABLE.feltY, f.outZ * CARD_RADIUS));
  }
  // Table centre (deck, treasury) and the local player's own cards.
  pts.push(new Vector3(0, TABLE.feltY, 0));
  pts.push(new Vector3(-0.2, TABLE.feltY, LOCAL_CARD_RADIUS + 0.12));
  pts.push(new Vector3(0.2, TABLE.feltY, LOCAL_CARD_RADIUS + 0.12));
  return pts;
}

/** Key points for the lobby view (all five opponent slots of a 6-seat table). */
export function lobbyFramePoints(): Vector3[] {
  const pts = seatFramePoints(6);
  pts.push(new Vector3(-TABLE.radius, TABLE.feltY, 0), new Vector3(TABLE.radius, TABLE.feltY, 0));
  return pts;
}
