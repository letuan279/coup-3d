/**
 * Keeps a seat's DOM label in sync with the 3D view (called from the character's useFrame):
 * `--u` (screen px per metre at the head) so the plate/bubble scale with distance, which side
 * the speech bubble opens to, and the countdown ring. DOM is only touched on change.
 */
import type { RefObject } from 'react';
import type { PerspectiveCamera } from 'three';
import { Vector3 } from 'three';
import { serverNow, useGame } from '../../store/useGame';
import { TABLE } from '../layout';
import { RING_C } from './Nameplate';

export interface LabelRefs {
  anchor: RefObject<HTMLDivElement | null>;
  ring: RefObject<SVGCircleElement | null>;
  sec: RefObject<HTMLSpanElement | null>;
}

export interface LabelMemory {
  u: number;
  side: number;
  lastSec: number;
  lastDash: number;
  urgent: boolean;
}

export function createLabelMemory(): LabelMemory {
  return { u: 0, side: 0, lastSec: -1, lastDash: -1, urgent: false };
}

const head = new Vector3();
const view = new Vector3();
const centre = new Vector3();

export function syncLabel(
  refs: LabelRefs,
  m: LabelMemory,
  headX: number,
  headY: number,
  headZ: number,
  deciding: boolean,
  cam: PerspectiveCamera,
  viewportHeight: number,
): void {
  const el = refs.anchor.current;
  if (el) {
    head.set(headX, headY, headZ);
    view.copy(head).applyMatrix4(cam.matrixWorldInverse);
    const depth = Math.max(0.5, -view.z);
    const u = Math.max(30, Math.min(420, viewportHeight / 2 / Math.tan((cam.fov * Math.PI) / 360) / depth));
    if (Math.abs(u - m.u) > m.u * 0.01) {
      m.u = u;
      el.style.setProperty('--u', u.toFixed(1));
    }
    // Bubbles open towards the table centre so they stay on screen.
    const side = head.project(cam).x < centre.set(0, TABLE.feltY, 0).project(cam).x ? 1 : -1;
    if (side !== m.side) {
      m.side = side;
      el.classList.toggle('is-left', side < 0);
    }
  }

  const ring = refs.ring.current;
  if (!deciding || !ring) {
    m.lastSec = -1;
    m.lastDash = -1;
    m.urgent = false;
    return;
  }
  const g = useGame.getState().game;
  if (!g || g.deadline == null || !g.phaseDurationMs) return;
  const left = Math.max(0, g.deadline - serverNow());
  const dash = Math.round(RING_C * (1 - Math.min(1, left / g.phaseDurationMs)) * 10) / 10;
  if (dash !== m.lastDash) {
    m.lastDash = dash;
    ring.style.strokeDashoffset = String(dash);
  }
  const sec = Math.ceil(left / 1000);
  if (sec !== m.lastSec) {
    m.lastSec = sec;
    if (refs.sec.current) refs.sec.current.textContent = String(sec);
    const urgent = sec <= 5;
    if (urgent !== m.urgent) {
      m.urgent = urgent;
      ring.closest('.sc-ring')?.classList.toggle('is-urgent', urgent);
    }
  }
}
