/**
 * One seated animal: chair, body rig, head with blinking eyes + expressive mouth, arms,
 * highlight hulls for targeting, and its nameplate. Motion lives in `rig.ts` and the DOM
 * label sync in `labels/labelSync.ts`, both driven from this component's useFrame.
 */
import { memo, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import { BoxGeometry, PlaneGeometry, type Group, type Mesh, type PerspectiveCamera, type Sprite } from 'three';
import type { SceneMode, SeatModel } from '../sceneModel';
import { CARD_RADIUS, HEAD_Y, HIT_BOX_CENTER, HIT_BOX_SIZE, SEAT_RADIUS, TABLE, frameAt } from '../layout';
import { animalParts, antennaGeometry, mouthGeometries, RIG } from './animalGeometry';
import { ghostMat, hitMat, hoverHullMat, hoverRingMat, targetHullMat, targetRingMat, toonMat } from '../materials';
import { chooseTarget, hoverEnter, hoverLeave, seatPointerHandlers, useHovered, useTargetable } from '../interaction';
import { Nameplate } from '../labels/Nameplate';
import { createLabelMemory, syncLabel, type LabelRefs } from '../labels/labelSync';
import { useDeferredMount } from '../useDeferredMount';
import { animateRig, createRigMemory, type RigRefs } from './rig';

export interface CharacterProps {
  seat: SeatModel;
  /** Relative seat angle (radians) around the table. */
  angle: number;
  mode: SceneMode;
  deciding: boolean;
  isActor: boolean;
  isWinner: boolean;
  wins: number;
  showPlate: boolean;
  /** Nameplate sits a row higher on narrow screens, so neighbouring plates do not overlap. */
  raised?: boolean;
}

const hitGeo = new BoxGeometry(...HIT_BOX_SIZE);
const ringGeo = new PlaneGeometry(0.95, 0.95);
/** Target ring sits around the player's cards (seat-local z). */
const RING_Z = SEAT_RADIUS - CARD_RADIUS;

export const Character = memo(function Character(props: CharacterProps) {
  const { seat, angle, mode, deciding, isActor, isWinner, wins, showPlate, raised = false } = props;
  const id = seat.id;
  const parts = animalParts(seat.avatar, seat.eliminated);
  const sp = parts.species;
  const targetable = useTargetable(id);
  const hovered = useHovered(id);
  const labelsReady = useDeferredMount();

  const refs: RigRefs = {
    root: useRef<Group>(null),
    rig: useRef<Group>(null),
    body: useRef<Mesh>(null),
    head: useRef<Group>(null),
    eyes: useRef<Mesh>(null),
    mouth: useRef<Mesh>(null),
    armL: useRef<Group>(null),
    armR: useRef<Group>(null),
    ghost: useRef<Sprite>(null),
    bodyHull: useRef<Mesh>(null),
    headHull: useRef<Mesh>(null),
    ring: useRef<Mesh>(null),
  };
  const labelRefs: LabelRefs = {
    anchor: useRef<HTMLDivElement>(null),
    ring: useRef<SVGCircleElement>(null),
    sec: useRef<HTMLSpanElement>(null),
  };
  const rigMemory = useMemo(createRigMemory, []);
  const labelMemory = useMemo(createLabelMemory, []);
  const frame = useMemo(() => frameAt(angle, SEAT_RADIUS), [angle]);

  useFrame((state, delta) => {
    animateRig(
      refs,
      rigMemory,
      { id, mode, frame, parts, dead: seat.eliminated, asleep: seat.offline && !seat.eliminated, isWinner },
      state,
      delta,
    );
    const root = refs.root.current;
    if (root) {
      syncLabel(labelRefs, labelMemory, root.position.x, HEAD_Y, root.position.z, deciding, state.camera as PerspectiveCamera, state.size.height);
    }
  });

  const interactive = mode === 'game';
  const handlers = useMemo(() => (interactive ? seatPointerHandlers(id) : {}), [interactive, id]);

  const highlight = interactive && (targetable || hovered);
  const hullMat = targetable ? targetHullMat() : hoverHullMat();
  const eyePos: [number, number, number] = [0, RIG.head[1] + sp.eyes.y, RIG.head[2] + sp.eyes.z];

  return (
    <group ref={refs.root}>
      <mesh geometry={parts.base} material={toonMat()} castShadow />
      <group ref={refs.rig} position={RIG.hips}>
        <mesh ref={refs.body} geometry={parts.body} material={toonMat()} position={RIG.body} castShadow />
        {highlight && <mesh ref={refs.bodyHull} geometry={parts.body} material={hullMat} position={RIG.body} />}
        <group ref={refs.armL} position={RIG.shoulderL} rotation={[RIG.armRest, 0.2, 0, 'ZXY']}>
          <mesh geometry={parts.arm} material={toonMat()} />
        </group>
        <group ref={refs.armR} position={RIG.shoulderR} rotation={[RIG.armRest, -0.2, 0, 'ZXY']}>
          <mesh geometry={parts.arm} material={toonMat()} />
        </group>
        <group ref={refs.head} position={RIG.neck} rotation={[0, 0, 0, 'YXZ']}>
          <mesh geometry={parts.head} material={toonMat()} position={RIG.head} castShadow />
          {highlight && <mesh ref={refs.headHull} geometry={parts.head} material={hullMat} position={RIG.head} />}
          <mesh ref={refs.eyes} geometry={parts.eyes} material={toonMat()} position={eyePos} />
          {sp.mouth && (
            <mesh
              ref={refs.mouth}
              geometry={mouthGeometries().smile}
              material={toonMat()}
              position={[sp.mouth[0], RIG.head[1] + sp.mouth[1], RIG.head[2] + sp.mouth[2]]}
              scale={[sp.mouthScale, 1, 1]}
            />
          )}
          {seat.botBadge && (
            <mesh
              geometry={antennaGeometry()}
              material={toonMat()}
              position={[0.1, RIG.head[1] + sp.crown * 0.92, RIG.head[2] - 0.04]}
              rotation={[0, 0, -0.25]}
            />
          )}
        </group>
      </group>
      <sprite ref={refs.ghost} material={ghostMat()} scale={[0.42, 0.42, 0.42]} visible={false} />
      {highlight && (
        <mesh
          ref={refs.ring}
          geometry={ringGeo}
          material={targetable ? targetRingMat() : hoverRingMat()}
          position={[0, TABLE.feltY + 0.004, RING_Z]}
          rotation={[-Math.PI / 2, 0, 0]}
          renderOrder={3}
        />
      )}
      <mesh geometry={hitGeo} material={hitMat()} position={HIT_BOX_CENTER} {...handlers} />
      {showPlate && labelsReady && (
        <Html position={[0, HEAD_Y, 0]} zIndexRange={[40, 10]} wrapperClass="sc-html">
          <Nameplate
            seat={seat}
            mode={mode}
            deciding={deciding}
            targetable={targetable}
            hovered={hovered}
            isActor={isActor}
            isWinner={isWinner}
            wins={wins}
            raised={raised}
            anchorRef={labelRefs.anchor}
            ringRef={labelRefs.ring}
            secRef={labelRefs.sec}
            onEnter={() => hoverEnter(id)}
            onLeave={() => hoverLeave(id)}
            onPick={() => chooseTarget(id)}
          />
        </Html>
      )}
    </group>
  );
});
