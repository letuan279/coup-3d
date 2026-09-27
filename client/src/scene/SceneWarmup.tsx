/**
 * Pays the one-off GPU costs up front, while idle, instead of mid-game:
 *  - uploads the card-face textures of the current language (otherwise uploaded — and drawn,
 *    if the HUD had not needed them yet — on the frame a card is first revealed);
 *  - compiles the shader programs of objects that only appear later (hover / target hulls,
 *    the elimination ghost), in parallel where the browser supports it.
 */
import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import { BoxGeometry, Group, Mesh, Sprite } from 'three';
import { CHARACTERS } from '@shared/types';
import type { Lang } from '../store/useGame';
import { cardFaceTexture } from './textures';
import { ghostMat, hoverHullMat, hoverRingMat, targetHullMat, targetRingMat } from './materials';

function idle(fn: () => void): () => void {
  if (typeof requestIdleCallback === 'function') {
    const id = requestIdleCallback(fn, { timeout: 1000 });
    return () => cancelIdleCallback(id);
  }
  const id = setTimeout(fn, 50);
  return () => clearTimeout(id);
}

let compiled = false;

export function SceneWarmup({ lang }: { lang: Lang }) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);

  useEffect(() => {
    if (compiled) return;
    return idle(() => {
      compiled = true;
      const geo = new BoxGeometry(0.01, 0.01, 0.01);
      const group = new Group();
      for (const mat of [targetHullMat(), hoverHullMat(), targetRingMat(), hoverRingMat()]) group.add(new Mesh(geo, mat));
      group.add(new Sprite(ghostMat()));
      // Lights come from the real scene, so the programs match what the render will ask for.
      void gl
        .compileAsync(group, camera, scene)
        .catch(() => undefined)
        .finally(() => geo.dispose());
    });
  }, [gl, scene, camera]);

  useEffect(() => {
    let cancel = () => {};
    let i = 0;
    const next = () => {
      if (i >= CHARACTERS.length) return;
      gl.initTexture(cardFaceTexture(CHARACTERS[i++], lang));
      cancel = idle(next);
    };
    cancel = idle(next);
    return () => cancel();
  }, [gl, lang]);

  return null;
}
