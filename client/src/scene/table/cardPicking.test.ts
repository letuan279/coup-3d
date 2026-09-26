/**
 * Picking a target through the cards on the felt (regression for SCN-1): an eliminated
 * player's revealed cards stand up and, at a 5–6 player table, cover part of the neighbouring
 * seat's hit box. Hovering such a card highlights the eliminated player, so a click there must
 * not fall through R3F's bubbling to the neighbour behind and send an irreversible action.
 *
 * Rebuilds the pickable meshes exactly as Cards.tsx / Character.tsx do (cardPose poses, the
 * seat hit box, the real framing camera) and dispatches pointer events the way R3F does: hits in
 * distance order, each handler in turn until one stops propagation.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BoxGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Raycaster,
  Vector2,
  type Intersection,
  type Object3D,
} from 'three';
import type { ActionOption, GameView, PlayerPublic } from '@shared/types';

const sent: unknown[] = [];
let ack: ((r: { ok: boolean }) => void) | null = null;
vi.mock('../../net/socket', () => ({
  api: {
    move: (m: unknown) => {
      sent.push(m);
      return new Promise((r) => (ack = r));
    },
  },
}));

import { useGame } from '../../store/useGame';
import { useHud } from '../../ui/hudStore';
import { registerCursorElement, resetPointer, seatPointerHandlers, type SeatPointerHandlers } from '../interaction';
import { fitFraming, gameInsets, seatFramePoints, seatPose } from '../framing';
import { CARD_H, CARD_W, HIT_BOX_CENTER, HIT_BOX_SIZE, SEAT_RADIUS, frameAt, slotAngle } from '../layout';
import { homePose, type Pose } from './cardPose';

const id = (slot: number) => `p${slot}`;

function player(slot: number, dead: boolean): PlayerPublic {
  return {
    id: id(slot),
    name: id(slot),
    seat: slot,
    coins: slot === 0 ? 8 : 2,
    influences: [
      { slot: 0, revealed: dead, character: dead ? 'duke' : null },
      { slot: 1, revealed: dead, character: dead ? 'captain' : null },
    ],
    hiddenCount: dead ? 0 : 2,
    eliminated: dead,
  };
}

/** The local player (seat 0) is about to Coup; `dead` is out, every other opponent a target. */
function view(n: number, dead: number): GameView {
  const players = Array.from({ length: n }, (_, s) => player(s, s === dead));
  const coup: ActionOption = { action: 'coup', enabled: true, targets: players.filter((p) => p.seat !== 0 && !p.eliminated).map((p) => p.id), cost: 7 };
  return {
    viewerId: id(0),
    players,
    deckCount: 5,
    treasury: 30,
    turn: 9,
    actorId: id(0),
    pendingAction: null,
    pendingBlock: null,
    phase: { kind: 'turn', actorId: id(0) },
    phaseSeq: 40,
    prompt: { kind: 'choose_action', options: [coup], mustCoup: false },
    winnerId: null,
    log: [],
    deadline: null,
    phaseDurationMs: null,
    serverNow: 0,
  };
}

const cardGeo = (() => {
  const g = new PlaneGeometry(CARD_W, CARD_H);
  g.translate(0, CARD_H / 2, 0);
  return g;
})();
const hitGeo = new BoxGeometry(...HIT_BOX_SIZE);
const mat = new MeshBasicMaterial();

interface Pickable {
  kind: 'card' | 'char';
  seat: number;
  handlers: SeatPointerHandlers;
}

/** Opponents' hit boxes and cards, as in game mode (every opponent card is interactive). */
function buildTable(n: number, dead: number) {
  const scene = new Group();
  const tags = new Map<Object3D, Pickable>();
  for (let s = 1; s < n; s++) {
    const handlers = seatPointerHandlers(id(s));
    const f = frameAt(slotAngle(s, n), SEAT_RADIUS);
    const root = new Group();
    root.position.set(f.x, 0, f.z);
    root.rotation.y = f.yaw;
    const hit = new Mesh(hitGeo, mat);
    hit.position.set(...HIT_BOX_CENTER);
    root.add(hit);
    scene.add(root);
    tags.set(hit, { kind: 'char', seat: s, handlers });
    for (const slot of [0, 1]) {
      const revealed = s === dead;
      const p = homePose({ slot, isLocal: false, revealed }, f, { x: 0, y: 0, z: 0, yaw: 0, prop: 0 } as Pose);
      const outer = new Group();
      outer.position.set(p.x, p.y, p.z);
      outer.rotation.y = p.yaw;
      const flipper = new Group();
      flipper.rotation.z = revealed ? 0 : Math.PI;
      const inner = new Group();
      inner.rotation.x = -Math.PI / 2 + p.prop;
      const front = new Mesh(cardGeo, mat);
      const back = new Mesh(cardGeo, mat);
      back.rotation.y = Math.PI;
      inner.add(front, back);
      flipper.add(inner);
      outer.add(flipper);
      scene.add(outer);
      tags.set(front, { kind: 'card', seat: s, handlers });
      tags.set(back, { kind: 'card', seat: s, handlers });
    }
  }
  scene.updateMatrixWorld(true);
  return { scene, tags };
}

function camera(n: number, w: number, h: number) {
  const pose = seatPose(n);
  const fr = fitFraming(pose, seatFramePoints(n), w, h, gameInsets(true, w));
  const cam = new PerspectiveCamera(fr.fov, w / h, 0.1, 60);
  cam.position.copy(pose.position);
  cam.lookAt(pose.target);
  cam.setViewOffset(w, h, fr.offsetX, fr.offsetY, w, h);
  cam.updateProjectionMatrix();
  cam.updateMatrixWorld();
  return cam;
}

/** R3F's dispatch: nearest hit first, on to the next until a handler stops propagation. */
function dispatch(hits: Pickable[], kind: 'onClick' | 'onPointerOver') {
  let stopped = false;
  const e = { stopPropagation: () => void (stopped = true) };
  for (const h of hits) {
    h.handlers[kind](e);
    if (stopped) break;
  }
}

const cursorEl = { style: { cursor: '' } } as unknown as HTMLElement;
const hover = () => useGame.getState().ui.hoverPlayerId;

function startTargeting(n: number, dead: number) {
  useHud.setState({ moveInFlight: false, moveSeq: null });
  useGame.setState((s) => ({ game: view(n, dead), ui: { ...s.ui, targeting: null, hoverPlayerId: null } }));
  useGame.getState().beginTargeting('coup');
  resetPointer();
}

beforeEach(async () => {
  sent.length = 0;
  ack?.({ ok: true });
  await Promise.resolve();
  ack = null;
  registerCursorElement(cursorEl);
});

describe("an eliminated player's standing cards", () => {
  it('swallow the click like the hover: no action goes to the neighbour behind', () => {
    let overlapping = 0;
    const rc = new Raycaster();
    for (const [w, h] of [
      [1366, 768],
      [1920, 1080],
    ]) {
      for (const n of [5, 6]) {
        const cam = camera(n, w, h);
        for (let dead = 1; dead < n; dead++) {
          const { scene, tags } = buildTable(n, dead);
          startTargeting(n, dead);
          for (let y = 0; y < h; y += 6) {
            for (let x = 0; x < w; x += 6) {
              rc.setFromCamera(new Vector2((x / w) * 2 - 1, 1 - (y / h) * 2), cam);
              const hits = rc.intersectObjects(scene.children, true).map((i: Intersection) => tags.get(i.object)!);
              if (!hits.length || hits[0].kind !== 'card' || hits[0].seat !== dead) continue;
              if (!hits.some((t) => t.kind === 'char' && t.seat !== dead)) continue;
              overlapping++;
              const where = `${w}x${h} n=${n} dead seat ${dead} at (${x},${y})`;
              dispatch(hits, 'onPointerOver');
              expect(hover(), where).toBe(id(dead));
              expect(cursorEl.style.cursor, where).toBe('');
              dispatch(hits, 'onClick');
              expect(sent, where).toEqual([]);
              expect(useGame.getState().ui.targeting, where).toBe('coup');
            }
          }
        }
      }
    }
    // The setup really puts dead cards in front of a live neighbour's hit box.
    expect(overlapping).toBeGreaterThan(50);
  });

  it('a click on the card of a live target still picks it, and on its hit box too', () => {
    const [w, h, n, dead] = [1920, 1080, 6, 1];
    const cam = camera(n, w, h);
    const { scene, tags } = buildTable(n, dead);
    const rc = new Raycaster();
    const firstHitAt = (want: (t: Pickable) => boolean): Pickable[] | null => {
      for (let y = 0; y < h; y += 8) {
        for (let x = 0; x < w; x += 8) {
          rc.setFromCamera(new Vector2((x / w) * 2 - 1, 1 - (y / h) * 2), cam);
          const hits = rc.intersectObjects(scene.children, true).map((i: Intersection) => tags.get(i.object)!);
          if (hits.length && want(hits[0])) return hits;
        }
      }
      return null;
    };
    const onLiveCard = firstHitAt((t) => t.kind === 'card' && t.seat === 3)!;
    const onLiveBox = firstHitAt((t) => t.kind === 'char' && t.seat === 2)!;
    expect(onLiveCard).not.toBeNull();
    expect(onLiveBox).not.toBeNull();

    startTargeting(n, dead);
    dispatch(onLiveCard, 'onClick');
    expect(sent).toEqual([{ type: 'action', action: 'coup', targetId: id(3) }]);

    ack!({ ok: true });
    sent.length = 0;
    startTargeting(n, dead);
    dispatch(onLiveBox, 'onClick');
    expect(sent).toEqual([{ type: 'action', action: 'coup', targetId: id(2) }]);
  });

  it('a click on a non-target stops at it even without any geometry', () => {
    startTargeting(6, 1);
    const deadCard: Pickable = { kind: 'card', seat: 1, handlers: seatPointerHandlers(id(1)) };
    const neighbour: Pickable = { kind: 'char', seat: 2, handlers: seatPointerHandlers(id(2)) };
    dispatch([deadCard, neighbour], 'onClick');
    expect(sent).toEqual([]);
    dispatch([neighbour, deadCard], 'onClick');
    expect(sent).toEqual([{ type: 'action', action: 'coup', targetId: id(2) }]);
  });
});
