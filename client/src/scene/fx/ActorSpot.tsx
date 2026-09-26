/**
 * Warm spotlight pool + glowing ring on the felt in front of the active actor (or the winner).
 */
import { useLayoutEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { damp } from 'maath/easing';
import { Object3D, PlaneGeometry, type Mesh, type SpotLight } from 'three';
import { CARD_RADIUS, LOCAL_CARD_RADIUS, SEAT_RADIUS, TABLE, frameAt } from '../layout';
import { actorRingMat } from '../materials';

const ringGeo = new PlaneGeometry(1.15, 1.15);
const f = frameAt(0);

export interface SpotTarget {
  angle: number;
  isLocal: boolean;
}

export function ActorSpot({ target }: { target: SpotTarget | null }) {
  const light = useRef<SpotLight>(null);
  const ring = useRef<Mesh>(null);
  const aim = useRef(new Object3D());
  const s = useRef({ x: 0, z: 0, lx: 0, lz: 0, i: 0, placed: false });

  useLayoutEffect(() => {
    if (light.current) light.current.target = aim.current;
  }, []);

  useFrame((state, delta) => {
    const dt = Math.min(delta, 0.1);
    const st = s.current;
    const on = target !== null;
    let rx = 0;
    let rz = 0;
    let lx = 0;
    let lz = 0;
    if (target) {
      frameAt(target.angle, SEAT_RADIUS, f);
      const r = target.isLocal ? LOCAL_CARD_RADIUS + 0.05 : CARD_RADIUS;
      rx = f.outX * r;
      rz = f.outZ * r;
      lx = f.outX * (target.isLocal ? 1.2 : SEAT_RADIUS - 0.3);
      lz = f.outZ * (target.isLocal ? 1.2 : SEAT_RADIUS - 0.3);
    }
    if (!st.placed && on) {
      st.x = rx;
      st.z = rz;
      st.lx = lx;
      st.lz = lz;
      st.placed = true;
    }
    damp(st, 'x', rx, 0.3, dt);
    damp(st, 'z', rz, 0.3, dt);
    damp(st, 'lx', lx, 0.3, dt);
    damp(st, 'lz', lz, 0.3, dt);
    damp(st, 'i', on ? 1 : 0, 0.25, dt);

    const pulse = 1 + Math.sin(state.clock.elapsedTime * 3.2) * 0.05;
    if (ring.current) {
      ring.current.position.set(st.x, TABLE.feltY + 0.003, st.z);
      ring.current.scale.setScalar(pulse);
      (ring.current.material as { opacity: number }).opacity = 0.85 * st.i;
      ring.current.visible = st.i > 0.02;
    }
    if (light.current) {
      light.current.position.set(st.lx * 0.55, 3.6, st.lz * 0.55);
      aim.current.position.set(st.lx, 0.9, st.lz);
      aim.current.updateMatrixWorld();
      // Keep the light in the scene at all times (toggling visibility would recompile shaders).
      light.current.intensity = 26 * st.i;
    }
  });

  return (
    <>
      <mesh ref={ring} geometry={ringGeo} material={actorRingMat()} rotation-x={-Math.PI / 2} renderOrder={2} />
      <spotLight ref={light} color="#FFC873" angle={0.42} penumbra={0.7} distance={9} decay={1.6} intensity={0} />
    </>
  );
}
