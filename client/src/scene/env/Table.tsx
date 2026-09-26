/**
 * Round wooden card table with bright emerald felt (2 draw calls + shadow).
 */
import { memo } from 'react';
import { CircleGeometry, CylinderGeometry, SphereGeometry, TorusGeometry, type BufferGeometry } from 'three';
import { GeoBuilder } from '../geo';
import { feltMat, woodMat } from '../materials';
import { TABLE } from '../layout';

let woodGeo: BufferGeometry | null = null;
let feltGeo: BufferGeometry | null = null;

function tableWood(): BufferGeometry {
  if (woodGeo) return woodGeo;
  const b = new GeoBuilder();
  const top = TABLE.feltY;
  // Top slab + padded wooden rail.
  b.add(new CylinderGeometry(TABLE.radius, TABLE.radius - 0.04, 0.09, 48), '#B8702F', { p: [0, top - 0.055, 0] });
  b.add(new TorusGeometry(TABLE.radius - 0.1, 0.1, 10, 56), '#C9803F', { p: [0, top + 0.005, 0], r: [Math.PI / 2, 0, 0], s: [1, 1, 0.75] });
  b.add(new TorusGeometry(TABLE.feltRadius + 0.01, 0.022, 6, 56), '#FFD34D', { p: [0, top + 0.004, 0], r: [Math.PI / 2, 0, 0] });
  // Pedestal.
  b.add(new CylinderGeometry(0.22, 0.3, top - 0.12, 20), '#8E5220', { p: [0, (top - 0.12) / 2 + 0.06, 0] });
  b.add(new SphereGeometry(0.34, 20, 10), '#A8632E', { p: [0, 0.42, 0], s: [1, 0.45, 1] });
  b.add(new CylinderGeometry(0.75, 0.85, 0.08, 28), '#8E5220', { p: [0, 0.04, 0] });
  b.add(new CylinderGeometry(0.55, 0.6, 0.06, 28), '#A8632E', { p: [0, 0.1, 0] });
  woodGeo = b.build();
  return woodGeo;
}

function tableFelt(): BufferGeometry {
  return (feltGeo ??= new CircleGeometry(TABLE.feltRadius, 64));
}

export const Table = memo(function Table() {
  return (
    <group>
      <mesh geometry={tableWood()} material={woodMat()} castShadow receiveShadow />
      <mesh geometry={tableFelt()} material={feltMat()} rotation-x={-Math.PI / 2} position-y={TABLE.feltY} receiveShadow />
    </group>
  );
});
