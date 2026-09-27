/**
 * Camera director:
 *  - home: slow orbit over the table;
 *  - lobby: slightly elevated view of the seated players;
 *  - game: first-person seat camera framed into the HUD-free part of the screen (FOV +
 *    projection offset), gentle idle sway, subtle glance towards the active actor.
 * Everything is damped in useFrame; the projection is only rebuilt when it actually changes.
 */
import { useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { damp, damp3 } from 'maath/easing';
import { Vector3, type PerspectiveCamera } from 'three';
import { useGame } from '../../store/useGame';
import type { SceneMode } from '../sceneModel';
import {
  fitFraming,
  gameFovRange,
  gameMargin,
  gameInsets,
  lobbyFovRange,
  lobbyFramePoints,
  lobbyInsets,
  lobbyPose,
  seatFramePoints,
  seatPose,
  type CameraPose,
  type Framing,
} from '../framing';
import { headPosition, nowSec, reactionLevel } from '../reactions';

const HOME_FRAMING: Framing = { fov: 44, offsetX: 0, offsetY: 0 };

const goalPos = new Vector3();
const goalTarget = new Vector3();

export function CameraRig({ mode, layoutCount }: { mode: SceneMode; layoutCount: number }) {
  const size = useThree((s) => s.size);
  const showLog = useGame((s) => s.ui.showLog);

  const plan = useMemo((): { pose: CameraPose | null; framing: Framing } => {
    if (mode === 'game') {
      const pose = seatPose(Math.max(2, layoutCount));
      return {
        pose,
        framing: fitFraming(
          pose,
          seatFramePoints(Math.max(2, layoutCount)),
          size.width,
          size.height,
          gameInsets(showLog, size.width, size.height),
          gameMargin(size.width, size.height),
          gameFovRange(size.width, size.height),
        ),
      };
    }
    if (mode === 'lobby') {
      const pose = lobbyPose();
      return {
        pose,
        framing: fitFraming(
          pose,
          lobbyFramePoints(),
          size.width,
          size.height,
          lobbyInsets(size.width, size.height),
          0.03,
          lobbyFovRange(size.width, size.height),
        ),
      };
    }
    return { pose: null, framing: HOME_FRAMING };
  }, [mode, layoutCount, size.width, size.height, showLog]);

  const cur = useRef({
    init: false,
    pos: new Vector3(0, 3, 6),
    target: new Vector3(0, 0.8, 0),
    fov: 44,
    offsetX: 0,
    offsetY: 0,
    applied: { fov: 0, offsetX: NaN, offsetY: NaN, w: 0, h: 0 },
  });

  useFrame((state, delta) => {
    const cam = state.camera as PerspectiveCamera;
    const c = cur.current;
    const dt = Math.min(delta, 0.1);
    const t = state.clock.elapsedTime;

    if (plan.pose) {
      goalPos.copy(plan.pose.position);
      goalTarget.copy(plan.pose.target);
    } else {
      const a = t * 0.06 + 0.6;
      goalPos.set(Math.sin(a) * 5.4, 3.05, Math.cos(a) * 5.4);
      goalTarget.set(0, 0.85, 0);
    }

    const store = useGame.getState();
    const localId = store.room?.youId ?? null;
    if (mode === 'game') {
      const g = store.game;
      const actor = g ? (g.phase.kind === 'game_over' ? g.winnerId : g.actorId) : null;
      if (actor && actor !== localId) {
        const h = headPosition(actor);
        goalTarget.x += (h.x - goalTarget.x) * 0.09;
        goalTarget.z += (h.z - goalTarget.z) * 0.04;
      }
      // Idle sway: a breathing, seated feel.
      goalPos.x += Math.sin(t * 0.37) * 0.025;
      goalPos.y += Math.sin(t * 0.53) * 0.014;
    }

    if (!c.init) {
      c.pos.copy(goalPos);
      c.target.copy(goalTarget);
      c.fov = plan.framing.fov;
      c.offsetX = plan.framing.offsetX;
      c.offsetY = plan.framing.offsetY;
      c.init = true;
    } else {
      const smooth = mode === 'home' ? 0.6 : 0.75;
      damp3(c.pos, goalPos, smooth, dt);
      damp3(c.target, goalTarget, smooth * 0.8, dt);
      damp(c, 'fov', plan.framing.fov, smooth, dt);
      damp(c, 'offsetX', plan.framing.offsetX, smooth, dt);
      damp(c, 'offsetY', plan.framing.offsetY, smooth, dt);
    }

    cam.position.copy(c.pos);
    if (localId) {
      const hurt = reactionLevel(localId, 'hurt', nowSec());
      if (hurt > 0) {
        cam.position.x += Math.sin(t * 47) * 0.03 * hurt;
        cam.position.y += Math.sin(t * 39) * 0.02 * hurt;
      }
    }
    cam.lookAt(c.target);

    const w = state.size.width;
    const h = state.size.height;
    const a = c.applied;
    if (
      Math.abs(a.fov - c.fov) > 0.01 ||
      Math.abs(a.offsetX - c.offsetX) > 0.2 ||
      Math.abs(a.offsetY - c.offsetY) > 0.2 ||
      a.w !== w ||
      a.h !== h ||
      Number.isNaN(a.offsetX)
    ) {
      a.fov = c.fov;
      a.offsetX = c.offsetX;
      a.offsetY = c.offsetY;
      a.w = w;
      a.h = h;
      cam.fov = c.fov;
      cam.aspect = w / h;
      cam.setViewOffset(w, h, c.offsetX, c.offsetY, w, h);
      cam.updateProjectionMatrix();
    }
  });

  return null;
}
