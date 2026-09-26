/**
 * Influence cards on the felt: opponents' cards face-down in front of them, revealed ones
 * flipped face-up and stood up towards the camera (greyed), the local player's own cards
 * propped up near the camera. Poses live in cardPose.ts. Animations (flip on reveal,
 * card_replaced round trip to the deck, exchange draws) run in useFrame against module-level
 * queues.
 */
import { memo, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { DoubleSide, MeshBasicMaterial, PlaneGeometry, type Group, type Mesh, type Vector3 } from 'three';
import type { Character } from '@shared/types';
import type { Lang } from '../../store/useGame';
import { CARD_H, CARD_RADIUS, CARD_W, LOCAL_CARD_RADIUS, SEAT_RADIUS, TABLE, frameAt } from '../layout';
import { cardBackMat, cardFaceMat } from '../materials';
import { cardBackTexture } from '../textures';
import { nowSec } from '../reactions';
import { seatPointerHandlers } from '../interaction';
import { REPLACE_DURATION, deckTop, easeInOut, exchangeFlights, replaceAnims } from './tableState';
import { flipLift, homePose, settleCard, type Pose } from './cardPose';

export interface CardSpec {
  key: string;
  playerId: string;
  slot: number;
  /** Seat angle of the owner. */
  angle: number;
  isLocal: boolean;
  revealed: boolean;
  character: Character | null;
}

/** Plane with its origin on the bottom edge (so cards pivot/prop on that edge). */
const cardGeo = (() => {
  const g = new PlaneGeometry(CARD_W, CARD_H);
  g.translate(0, CARD_H / 2, 0);
  return g;
})();

export const TableCard = memo(function TableCard({
  spec,
  lang,
  interactive,
}: {
  spec: CardSpec;
  lang: Lang;
  /** An opponent's card in game mode: hovering it highlights its owner, a click picks them. */
  interactive: boolean;
}) {
  const outer = useRef<Group>(null);
  const flipper = useRef<Group>(null);
  const inner = useRef<Group>(null);
  const front = useRef<Mesh>(null);
  const f = useMemo(() => frameAt(spec.angle, SEAT_RADIUS), [spec.angle]);
  const anim = useMemo(() => ({ placed: false, pose: { x: 0, y: 0, z: 0, yaw: 0, prop: 0 } as Pose }), []);

  const faceMat = spec.character ? cardFaceMat(spec.character, lang, spec.revealed) : null;

  useFrame((state, delta) => {
    const o = outer.current;
    const fl = flipper.current;
    const inn = inner.current;
    const fr = front.current;
    if (!o || !fl || !inn || !fr) return;
    const dt = Math.min(delta, 0.1);
    const home = homePose(spec, f, anim.pose);
    const faceUp = spec.isLocal || spec.revealed;

    const rep = replaceAnims.get(`${spec.playerId}:${spec.slot}`);
    if (rep) {
      const t = nowSec() - rep.start;
      if (t >= REPLACE_DURATION) {
        replaceAnims.delete(`${spec.playerId}:${spec.slot}`);
      } else {
        runReplace(t, rep.character, home, state.camera.position, o, fl, inn, fr, lang, faceMat);
        return;
      }
    }

    o.visible = true;
    if (!anim.placed) {
      o.position.set(home.x, home.y, home.z);
      o.rotation.y = home.yaw;
      fl.rotation.z = faceUp ? 0 : Math.PI;
      inn.rotation.x = -Math.PI / 2 + home.prop;
      anim.placed = true;
    } else {
      // Flip with a hop; a revealed card stands up only once it has turned face up.
      settleCard({ outer: o, flipper: fl, inner: inn }, home, faceUp, dt);
    }
    if (faceMat) {
      if (fr.material !== faceMat) fr.material = faceMat;
      fr.visible = true;
    } else {
      fr.visible = false;
    }
  });

  // Always attached while interactive, targetable or not (like the character's hit box): if
  // they came and went with targeting, R3F would never send pointer-out for a card that stops
  // being a target under the pointer, leaving its owner highlighted. And the click must stop at
  // the card whatever it targets, as the hover does — else it falls through to a neighbour's
  // hit box behind an eliminated player's standing card (SCN-1).
  const handlers = useMemo(() => (interactive ? seatPointerHandlers(spec.playerId) : {}), [interactive, spec.playerId]);

  return (
    <group ref={outer}>
      <group ref={flipper}>
        <group ref={inner} rotation-x={-Math.PI / 2}>
          <mesh ref={front} geometry={cardGeo} material={faceMat ?? cardBackMat()} {...handlers} />
          <mesh geometry={cardGeo} material={cardBackMat()} rotation-y={Math.PI} {...handlers} />
        </group>
      </group>
    </group>
  );
});

/** card_replaced: show the proven card to the table, slide it into the deck, bring a fresh one back. */
function runReplace(
  t: number,
  character: Character,
  home: Pose,
  camera: Vector3,
  o: Group,
  fl: Group,
  inn: Group,
  fr: Mesh,
  lang: Lang,
  stateMat: MeshBasicMaterial | null,
) {
  const reveal = cardFaceMat(character, lang, false);
  const lift = 0.3;
  // Yaw that makes the card's top point away from the camera, so a propped card faces it.
  const showYaw = Math.atan2(-(home.x - camera.x), -(home.z - camera.z));
  o.visible = true;
  if (t < 0.4) {
    const k = easeInOut(t / 0.4);
    o.rotation.y = lerpAngle(home.yaw, showYaw, k);
    fl.rotation.z = fl.rotation.z * (1 - k);
    const prop = home.prop + (SHOW_PROP - home.prop) * k;
    inn.rotation.x = -Math.PI / 2 + prop;
    // Lift at least as much as the turning card needs so its edge never dips into the felt.
    o.position.set(home.x, home.y + Math.max(lift * k, flipLift(fl.rotation.z, prop)), home.z);
    setFront(fr, reveal);
  } else if (t < 0.8) {
    o.position.set(home.x, home.y + lift + Math.sin((t - 0.4) * 8) * 0.01, home.z);
    o.rotation.y = showYaw;
    fl.rotation.z = 0;
    inn.rotation.x = -Math.PI / 2 + SHOW_PROP;
    setFront(fr, reveal);
  } else if (t < 1.25) {
    const k = easeInOut((t - 0.8) / 0.45);
    o.position.set(
      home.x + (deckTop.x - home.x) * k,
      home.y + lift + (deckTop.y + 0.02 - home.y - lift) * k + Math.sin(k * Math.PI) * 0.12,
      home.z + (deckTop.z - home.z) * k,
    );
    o.rotation.y = lerpAngle(showYaw, home.yaw, k);
    inn.rotation.x = -Math.PI / 2 + SHOW_PROP * (1 - k);
    fl.rotation.z = Math.PI * k;
    setFront(fr, reveal);
  } else if (t < 1.4) {
    o.visible = false;
  } else {
    const k = easeInOut((t - 1.4) / (REPLACE_DURATION - 1.4));
    o.position.set(
      deckTop.x + (home.x - deckTop.x) * k,
      deckTop.y + 0.02 + (home.y - deckTop.y - 0.02) * k + Math.sin(k * Math.PI) * 0.18,
      deckTop.z + (home.z - deckTop.z) * k,
    );
    o.rotation.y = home.yaw;
    fl.rotation.z = Math.PI;
    inn.rotation.x = -Math.PI / 2;
    if (stateMat) setFront(fr, stateMat);
    else fr.visible = false;
  }
}

const SHOW_PROP = 1.05;

function lerpAngle(a: number, b: number, k: number): number {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * k;
}

function setFront(fr: Mesh, mat: MeshBasicMaterial) {
  if (fr.material !== mat) fr.material = mat;
  fr.visible = true;
}

// ── Exchange: two court cards fly to the ambassador and back ──

const flightMat = new MeshBasicMaterial({ toneMapped: false, side: DoubleSide });
const FLIGHT_TIME = 0.6;
const held = { x: 0, y: 0, z: 0 };

export function ExchangeFlights({ angleOf }: { angleOf: (playerId: string) => { angle: number; isLocal: boolean } | null }) {
  const refs = [useRef<Mesh>(null), useRef<Mesh>(null)];
  const frame = useMemo(() => frameAt(0), []);
  useFrame(() => {
    if (!flightMat.map) flightMat.map = cardBackTexture();
    const now = nowSec();
    for (let i = 0; i < refs.length; i++) {
      const m = refs[i].current;
      if (!m) continue;
      const fl = exchangeFlights[i];
      const seat = fl ? angleOf(fl.playerId) : null;
      if (!fl || !seat || now < fl.start) {
        m.visible = false;
        continue;
      }
      frameAt(seat.angle, SEAT_RADIUS, frame);
      // Held position: fanned just above the player's cards.
      const r = seat.isLocal ? LOCAL_CARD_RADIUS - 0.25 : CARD_RADIUS - 0.2;
      const hx = frame.outX * r + frame.rightX * (fl.index ? 0.12 : -0.12);
      const hz = frame.outZ * r + frame.rightZ * (fl.index ? 0.12 : -0.12);
      const hy = TABLE.feltY + 0.3 + fl.index * 0.01;
      const k = easeInOut((now - fl.start) / FLIGHT_TIME);
      held.x = hx;
      held.y = hy;
      held.z = hz;
      const from = fl.dir === 'out' ? deckTop : held;
      const to = fl.dir === 'out' ? held : deckTop;
      if (fl.dir === 'back' && k >= 1) {
        m.visible = false;
        continue;
      }
      if (fl.dir === 'out' && now - fl.start > 25) {
        m.visible = false;
        continue;
      }
      m.visible = true;
      m.position.set(from.x + (to.x - from.x) * k, from.y + (to.y - from.y) * k + Math.sin(k * Math.PI) * 0.25, from.z + (to.z - from.z) * k);
      m.rotation.set(-Math.PI / 2 + 0.5, Math.atan2(-frame.outX, -frame.outZ) + (fl.index ? -0.2 : 0.2), 0, 'YXZ');
    }
  });
  return (
    <>
      {refs.map((r, i) => (
        <mesh key={i} ref={r} geometry={cardGeo} material={flightMat} visible={false} />
      ))}
    </>
  );
}
