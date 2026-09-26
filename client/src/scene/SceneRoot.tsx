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
import './scene.css';

const DPR_RANGE: [number, number] = [1, 1.75];

function perfEnabled(): boolean {
  try {
    return new URLSearchParams(window.location.search).get('perf') === '1';
  } catch {
    return false;
  }
}

export function SceneRoot() {
  const [dpr, setDpr] = useState<number | [number, number]>(DPR_RANGE);
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
        <PerformanceMonitor
          flipflops={3}
          onDecline={() => setDpr(1)}
          onIncline={() => setDpr(DPR_RANGE)}
          onFallback={() => setDpr(1)}
        >
          <SceneContent perfTarget={perf ? perfRef : null} />
        </PerformanceMonitor>
      </Canvas>
      {perf && <div ref={perfRef} className="sc-perf" />}
    </div>
  );
}
