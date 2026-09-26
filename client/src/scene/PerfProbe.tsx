/**
 * Dev overlay (?perf=1): FPS + draw calls + triangles, written straight into a DOM node
 * twice a second (no React updates).
 */
import { useRef, type RefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import { t } from '../i18n';

export function PerfProbe({ target }: { target: RefObject<HTMLDivElement | null> }) {
  const acc = useRef({ frames: 0, since: performance.now(), maxCalls: 0, maxTris: 0 });

  useFrame(({ gl }) => {
    const a = acc.current;
    a.frames++;
    // info reflects the previous frame (auto-reset at the start of each render).
    a.maxCalls = Math.max(a.maxCalls, gl.info.render.calls);
    a.maxTris = Math.max(a.maxTris, gl.info.render.triangles);
    const now = performance.now();
    if (now - a.since < 500) return;
    const fps = (a.frames * 1000) / (now - a.since);
    const el = target.current;
    if (el) {
      el.textContent =
        `${t('scene.perf.fps')}: ${fps.toFixed(0)}\n` +
        `${t('scene.perf.calls')}: ${a.maxCalls}\n` +
        `${t('scene.perf.tris')}: ${(a.maxTris / 1000).toFixed(1)}k\n` +
        `dpr: ${gl.getPixelRatio().toFixed(2)} · geo ${gl.info.memory.geometries} · tex ${gl.info.memory.textures} · prg ${gl.info.programs?.length ?? 0}`;
    }
    a.frames = 0;
    a.since = now;
    a.maxCalls = 0;
    a.maxTris = 0;
  });

  return null;
}
