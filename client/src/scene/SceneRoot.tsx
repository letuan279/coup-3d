/**
 * Entry of the 3D scene (owned by client/src/scene): one persistent <Canvas> for home, lobby
 * and game — the "Sunny Tavern".
 */
import { useMemo, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { PerformanceMonitor } from '@react-three/drei';
import { ACESFilmicToneMapping, SRGBColorSpace } from 'three';
import { SceneContent } from './SceneContent';
import { registerCursorElement } from './interaction';
import { DPR_RANGE, createDprGovernor, dprBounds, type Dpr } from './dprGovernor';
import './scene.css';

function perfEnabled(): boolean {
  try {
    return new URLSearchParams(window.location.search).get('perf') === '1';
  } catch {
    return false;
  }
}

export function SceneRoot() {
  const [dpr, setDpr] = useState<Dpr>(DPR_RANGE);
  // Lowers the resolution while the scene misses the 60 FPS target; see dprGovernor.ts.
  const governor = useMemo(() => createDprGovernor({ setDpr }), []);
  const perf = useMemo(perfEnabled, []);
  const perfRef = useRef<HTMLDivElement>(null);

  return (
    <div className="sc-root">
      <Canvas
        className="sc-canvas"
        dpr={dpr}
        shadows="percentage"
        frameloop="always"
        gl={{ antialias: true, powerPreference: 'high-performance' }}
        camera={{ fov: 44, near: 0.1, far: 60, position: [0, 3, 6] }}
        onCreated={({ gl }) => {
          gl.toneMapping = ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.0;
          gl.outputColorSpace = SRGBColorSpace;
          registerCursorElement(gl.domElement);
        }}
      >
        <PerformanceMonitor bounds={dprBounds} onDecline={governor.onDecline} onIncline={governor.onIncline}>
          <SceneContent perfTarget={perf ? perfRef : null} />
        </PerformanceMonitor>
      </Canvas>
      {perf && <div ref={perfRef} className="sc-perf" />}
    </div>
  );
}
