/**
 * Per-frame animation of a seated character (called from its useFrame): seat placement,
 * pop-in, breathing, reactions, head look-at, arms, blinking eyes, mouth, ghost, highlight
 * pulse. Pure ref mutation — no allocation, no React state.
 */
import type { RefObject } from 'react';
import type { RootState } from '@react-three/fiber';
import { damp, dampAngle } from 'maath/easing';
import { Vector3, type Group, type Mesh, type Sprite } from 'three';
import { useGame } from '../../store/useGame';
import type { SceneMode } from '../sceneModel';
import { HEAD_Y, TABLE, type SeatFrame } from '../layout';
import { focus, headPosition, nowSec, reactionLevel } from '../reactions';
import { mouthGeometries, RIG, type AnimalParts } from './animalGeometry';

export interface RigRefs {
  root: RefObject<Group | null>;
  rig: RefObject<Group | null>;
  body: RefObject<Mesh | null>;
  head: RefObject<Group | null>;
  eyes: RefObject<Mesh | null>;
  mouth: RefObject<Mesh | null>;
  armL: RefObject<Group | null>;
  armR: RefObject<Group | null>;
  ghost: RefObject<Sprite | null>;
  bodyHull: RefObject<Mesh | null>;
  headHull: RefObject<Mesh | null>;
  ring: RefObject<Mesh | null>;
}

export interface RigInput {
  id: string;
  mode: SceneMode;
  frame: SeatFrame;
  parts: AnimalParts;
  dead: boolean;
  asleep: boolean;
  isWinner: boolean;
}

export interface RigMemory {
  born: number;
  phase: number;
  nextBlink: number;
  blinkAt: number;
  placed: boolean;
}

export function createRigMemory(): RigMemory {
  const now = nowSec();
  return { born: now, phase: Math.random() * Math.PI * 2, nextBlink: now + 1 + Math.random() * 3, blinkAt: -10, placed: false };
}

const tmp = new Vector3();
const headOffset = new Vector3(0, RIG.hips[1] + RIG.neck[1] + RIG.head[1], RIG.neck[2]);
const tableCentre = new Vector3(0, TABLE.feltY + 0.1, 0);

/** Overshooting pop-in scale (0 → 1). */
function spring(t: number): number {
  if (t <= 0) return 0.001;
  return 1 - Math.exp(-6.5 * t) * Math.cos(10 * t);
}

export function animateRig(refs: RigRefs, m: RigMemory, input: RigInput, state: RootState, delta: number): void {
  const r = refs.root.current;
  const rig = refs.rig.current;
  const head = refs.head.current;
  if (!r || !rig || !head) return;
  const { id, frame, parts, dead, asleep } = input;
  const dt = Math.min(delta, 0.1);
  const now = nowSec();
  const t = state.clock.elapsedTime + m.phase;

  // ── Seat placement (glides when the table layout changes) + pop-in ──
  if (!m.placed) {
    r.position.set(frame.x, 0, frame.z);
    r.rotation.y = frame.yaw;
    m.placed = true;
  } else {
    damp(r.position, 'x', frame.x, 0.45, dt);
    damp(r.position, 'z', frame.z, 0.45, dt);
    dampAngle(r.rotation, 'y', frame.yaw, 0.45, dt);
  }
  const age = now - m.born;
  r.scale.setScalar(age > 1.5 ? 1 : spring(age));
  headPosition(id).set(r.position.x, HEAD_Y, r.position.z);

  // ── Reaction envelopes ──
  const act = reactionLevel(id, 'act', now);
  const challenge = reactionLevel(id, 'challenge', now);
  const block = reactionLevel(id, 'block', now);
  const hurt = reactionLevel(id, 'hurt', now);
  const win = Math.max(reactionLevel(id, 'win', now), input.isWinner ? 1 : 0);
  const surprise = reactionLevel(id, 'surprise', now);
  const sad = reactionLevel(id, 'sad', now);

  // ── Body: breathing, lean, shake, bounce, slump ──
  const breathe = Math.sin(t * (asleep ? 1.2 : 2.1));
  const lean = dead ? 0.34 : 0.2 * act + 0.3 * challenge + 0.06 * block + (asleep ? 0.12 : 0);
  damp(rig.rotation, 'x', lean, 0.18, dt);
  rig.rotation.z = hurt * Math.sin(t * 38) * 0.09 + (dead ? 0.08 : Math.sin(t * 0.7) * 0.018);
  const bounce = win > 0 ? Math.abs(Math.sin(t * 8.5)) * 0.13 * win : 0;
  rig.position.y = RIG.hips[1] + bounce + (dead ? -0.07 : 0);
  refs.body.current?.scale.set(1 - breathe * 0.008, 1 + breathe * 0.022, 1 + breathe * 0.01);

  // ── Head: glance at whoever matters right now ──
  let yaw = 0;
  let pitch = 0;
  if (dead) {
    pitch = 0.5;
    yaw = 0.25;
  } else if (asleep) {
    pitch = 0.42 + Math.sin(t * 1.2) * 0.04;
    yaw = -0.2;
  } else {
    tmp.copy(lookTarget(id, input.mode, now, state.camera.position));
    r.worldToLocal(tmp).sub(headOffset);
    // Glance rather than turn fully away, so faces stay readable from the camera.
    yaw = Math.max(-0.8, Math.min(0.8, Math.atan2(tmp.x, tmp.z) * 0.75));
    pitch = Math.max(-0.35, Math.min(0.45, -Math.atan2(tmp.y, Math.hypot(tmp.x, tmp.z))));
    yaw += hurt * Math.sin(t * 30) * 0.25;
    pitch += sad * 0.25 - win * 0.15;
  }
  damp(head.rotation, 'y', yaw, 0.25, dt);
  damp(head.rotation, 'x', pitch, 0.25, dt);
  head.rotation.z = Math.sin(t * 0.9) * 0.035;
  head.position.y = RIG.neck[1] + breathe * 0.008;
  damp(rig.rotation, 'y', yaw * 0.18, 0.4, dt);

  // ── Arms (Euler order ZXY: inward yaw, then pitch, then an outward roll when raised) ──
  const rest = RIG.armRest - lean * 0.9;
  const armR = refs.armR.current;
  if (armR) {
    const raise = Math.max(block, win * 0.8);
    const wave = block > 0 ? Math.sin(t * 11) * 0.22 * block : 0;
    damp(armR.rotation, 'x', dead ? 1.25 : rest - raise * 1.95, 0.12, dt);
    damp(armR.rotation, 'z', -raise * 0.5 + wave, 0.12, dt);
  }
  const armL = refs.armL.current;
  if (armL) {
    const cheer = win * 0.8 * (0.5 + 0.5 * Math.sin(t * 8.5));
    damp(armL.rotation, 'x', dead ? 1.25 : rest - challenge * 0.6 - cheer * 1.8, 0.12, dt);
    damp(armL.rotation, 'y', 0.2 - challenge * 0.25, 0.12, dt);
    damp(armL.rotation, 'z', cheer * 0.5, 0.12, dt);
  }

  // ── Eyes: blink / sleepy / X ──
  const eyes = refs.eyes.current;
  if (eyes) {
    const eyeGeo = dead ? parts.eyesX : parts.eyes;
    if (eyes.geometry !== eyeGeo) eyes.geometry = eyeGeo;
    if (dead) {
      eyes.scale.set(1, 1, 1);
    } else {
      if (now > m.nextBlink) {
        m.blinkAt = now;
        m.nextBlink = now + 1.8 + Math.random() * 3.5;
      }
      const b = (now - m.blinkAt) / 0.16;
      const blink = b >= 0 && b < 1 ? Math.sin(b * Math.PI) : 0;
      const wide = surprise * 0.25 + challenge * 0.15;
      eyes.scale.set(1 + wide * 0.3, asleep ? 0.1 : Math.max(0.08, 1 + wide - blink * 0.95), 1);
    }
  }

  // ── Mouth ──
  const mouth = refs.mouth.current;
  if (mouth) {
    const mouths = mouthGeometries();
    const g =
      dead || sad > 0.1 || hurt > 0.1
        ? mouths.sad
        : surprise > 0.1 || challenge > 0.2
          ? mouths.open
          : win > 0.1 || block > 0.2
            ? mouths.grin
            : mouths.smile;
    if (mouth.geometry !== g) mouth.geometry = g;
  }

  // ── Ghost for eliminated seats ──
  const ghost = refs.ghost.current;
  if (ghost) {
    ghost.visible = dead;
    if (dead) ghost.position.set(0.46 + Math.sin(t * 0.9) * 0.05, HEAD_Y + 0.28 + Math.sin(t * 1.8) * 0.07, 0);
  }

  // ── Highlight pulse (targeting / hover) ──
  const pulse = 1.05 + Math.sin(now * 7) * 0.018;
  refs.bodyHull.current?.scale.setScalar(pulse);
  refs.headHull.current?.scale.setScalar(pulse);
  refs.ring.current?.scale.setScalar(1 + Math.sin(now * 6) * 0.06);
}

/** Where a seated character should look this frame. */
function lookTarget(id: string, mode: SceneMode, now: number, camera: Vector3): Vector3 {
  if (focus.id && focus.id !== id && now < focus.until) return pointFor(focus.id, camera);
  if (mode === 'game') {
    const g = useGame.getState().game;
    if (g) {
      const actor = g.phase.kind === 'game_over' ? g.winnerId : g.actorId;
      if (actor && actor !== id) return pointFor(actor, camera);
      return tableCentre;
    }
  }
  return mode === 'lobby' ? camera : tableCentre;
}

/** The local player "is" the camera; everyone else is their head. */
function pointFor(playerId: string, camera: Vector3): Vector3 {
  const s = useGame.getState();
  const local = s.room?.youId ?? s.game?.viewerId;
  return playerId === local ? camera : headPosition(playerId);
}
