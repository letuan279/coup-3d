/**
 * Court deck in the middle of the table: a card-stack block whose height follows deckCount,
 * with the card back on top.
 */
import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { damp } from 'maath/easing';
import { BoxGeometry, PlaneGeometry, type Group, type Mesh } from 'three';
import { CARD_H, CARD_W, DECK_POS, TABLE } from '../layout';
import { cardBackMat, deckSideMat } from '../materials';
import { deckTop } from './tableState';

const CARD_T = 0.011;
const blockGeo = new BoxGeometry(CARD_W * 0.98, 1, CARD_H * 0.98);
blockGeo.translate(0, 0.5, 0);
const topGeo = new PlaneGeometry(CARD_W, CARD_H);
const YAW = 0.28;

export function CenterPile({ deckCount }: { deckCount: number }) {
  const block = useRef<Mesh>(null);
  const top = useRef<Group>(null);
  const cur = useRef({ h: Math.max(1, deckCount) * CARD_T });

  useFrame((_, delta) => {
    const target = Math.max(0.0001, deckCount * CARD_T);
    damp(cur.current, 'h', target, 0.3, Math.min(delta, 0.1));
    const h = cur.current.h;
    if (block.current) {
      block.current.scale.y = h;
      block.current.visible = deckCount > 0 || h > 0.002;
    }
    if (top.current) {
      top.current.position.y = TABLE.feltY + h + 0.001;
      top.current.visible = deckCount > 0;
    }
    deckTop.y = TABLE.feltY + h;
  });

  return (
    <group position={[DECK_POS[0], 0, DECK_POS[1]]} rotation-y={YAW}>
      <mesh ref={block} geometry={blockGeo} material={deckSideMat()} position-y={TABLE.feltY} castShadow />
      <group ref={top}>
        <mesh geometry={topGeo} material={cardBackMat()} rotation-x={-Math.PI / 2} />
      </group>
    </group>
  );
}
