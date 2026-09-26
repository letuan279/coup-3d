/**
 * Golden-hour sun (the only shadow caster, tight frustum around the table) + sky/floor fill.
 */
import { memo, useLayoutEffect, useRef } from 'react';
import type { DirectionalLight } from 'three';
import { SUN_POS } from './tavernGeometry';

export const Lights = memo(function Lights() {
  const sun = useRef<DirectionalLight>(null);

  useLayoutEffect(() => {
    const l = sun.current;
    if (!l) return;
    const cam = l.shadow.camera;
    cam.left = -3.4;
    cam.right = 3.4;
    cam.top = 3.4;
    cam.bottom = -3.4;
    cam.near = 4;
    cam.far = 17;
    cam.updateProjectionMatrix();
    l.shadow.mapSize.set(1024, 1024);
    l.shadow.bias = -0.0006;
    l.shadow.normalBias = 0.02;
    l.shadow.radius = 3;
    l.target.position.set(0, 0.6, 0);
    l.target.updateMatrixWorld();
  }, []);

  return (
    <>
      <hemisphereLight args={['#D6EEFF', '#E8A866', 0.95]} />
      <directionalLight ref={sun} color="#FFDCA3" intensity={2.1} position={SUN_POS} castShadow />
      {/* soft cool bounce from behind the camera so faces turned towards it never go flat */}
      <directionalLight color="#CFEAFF" intensity={0.45} position={[2, 3, 8]} />
    </>
  );
});
