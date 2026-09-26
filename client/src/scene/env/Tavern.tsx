/**
 * The static Sunny Tavern room: ~11 draw calls for the whole environment (merged shell,
 * textured walls/floor/sky, additive light shafts + motes, instanced bottles and bulbs).
 */
import { memo, useLayoutEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import {
  CircleGeometry,
  InstancedMesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  type BufferGeometry,
  type Material,
  type Points,
} from 'three';
import { useGame } from '../../store/useGame';
import { floorMat, floorPatchMat, moteMat, propMat, rugMat, shaftMat, signMat, skyMat, wallMat } from '../materials';
import {
  ROOM,
  SIGN_Y,
  bottleGeometry,
  bottleInstances,
  bulbGeometry,
  bulbInstances,
  buildFloorPatches,
  buildMotes,
  buildShafts,
  buildShell,
  buildSkyPanels,
  buildWalls,
  type InstanceSpec,
} from './tavernGeometry';

let geoCache: ReturnType<typeof buildAll> | null = null;

function buildAll() {
  return {
    shell: buildShell(),
    walls: buildWalls(),
    sky: buildSkyPanels(),
    shafts: buildShafts(),
    patches: buildFloorPatches(),
    motes: buildMotes(),
    floor: new PlaneGeometry(ROOM.halfX * 2, ROOM.halfZ * 2),
    rug: new CircleGeometry(3.1, 48),
    sign: new PlaneGeometry(3.5, 0.875),
    bottle: bottleGeometry(),
    bottles: bottleInstances(),
    bulb: bulbGeometry(),
    bulbs: bulbInstances(),
  };
}

function geometry() {
  return (geoCache ??= buildAll());
}

const bottleMat = new MeshStandardMaterial({ roughness: 0.18, metalness: 0.05, emissive: '#221100', emissiveIntensity: 0.4 });
const bulbMat = new MeshBasicMaterial({ toneMapped: false });

function Instanced({ spec, geo, mat }: { spec: InstanceSpec; geo: BufferGeometry; mat: Material }) {
  const ref = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    const m = ref.current;
    if (!m) return;
    spec.matrices.forEach((mx, i) => {
      m.setMatrixAt(i, mx);
      m.setColorAt(i, spec.colors[i]);
    });
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    m.computeBoundingSphere();
  }, [spec]);
  return <instancedMesh ref={ref} args={[geo, mat, spec.matrices.length]} />;
}

function SignBoard() {
  const lang = useGame((s) => s.ui.lang);
  return <mesh geometry={geometry().sign} material={signMat(lang)} position={[0, SIGN_Y, -ROOM.halfZ + 0.09]} />;
}

/** Sun-lit dust drifting slowly (one draw call; the whole cloud moves, no per-vertex CPU work). */
function Motes() {
  const ref = useRef<Points>(null);
  useFrame((state) => {
    const p = ref.current;
    if (!p) return;
    const t = state.clock.elapsedTime;
    p.position.set(Math.sin(t * 0.07) * 0.35, Math.sin(t * 0.11) * 0.18, Math.cos(t * 0.05) * 0.3);
    p.rotation.y = Math.sin(t * 0.03) * 0.04;
  });
  return <points ref={ref} geometry={geometry().motes} material={moteMat()} frustumCulled={false} />;
}

export const Tavern = memo(function Tavern() {
  const g = geometry();
  return (
    <group>
      <mesh geometry={g.floor} material={floorMat()} rotation-x={-Math.PI / 2} receiveShadow />
      <mesh geometry={g.rug} material={rugMat()} rotation-x={-Math.PI / 2} position-y={0.006} receiveShadow />
      <mesh geometry={g.walls} material={wallMat()} />
      <mesh geometry={g.shell} material={propMat()} />
      <mesh geometry={g.sky} material={skyMat()} />
      <mesh geometry={g.patches} material={floorPatchMat()} />
      <mesh geometry={g.shafts} material={shaftMat()} renderOrder={5} />
      <Motes />
      <SignBoard />
      <Instanced spec={g.bottles} geo={g.bottle} mat={bottleMat} />
      <Instanced spec={g.bulbs} geo={g.bulb} mat={bulbMat} />
    </group>
  );
});
