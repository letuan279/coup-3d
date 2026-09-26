import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import { emit } from '../net/bus';

/**
 * Dev-only: exposes the renderer on `window.__coupScene` so the scene can be inspected (and
 * stepped with `advance()` while the tab is hidden, or fed bus events with `emit()`) from the
 * browser console.
 */
export function DevHandle() {
  const get = useThree((s) => s.get);
  useEffect(() => {
    const w = window as unknown as { __coupScene?: unknown };
    const st = get();
    w.__coupScene = { scene: st.scene, gl: st.gl, camera: () => get().camera, advance: (t: number) => get().advance(t), emit };
    return () => {
      delete w.__coupScene;
    };
  }, [get]);
  return null;
}
