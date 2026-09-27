/**
 * Opponents around the table (lobby + game), empty chairs in the lobby, and the local
 * player's speech-bubble anchor above their own cards.
 */
import { memo } from 'react';
import { Html } from '@react-three/drei';
import type { GameView, RoomView } from '@shared/types';
import { Character } from './characters/Character';
import { emptyChairGeometry } from './characters/animalGeometry';
import { toonMat } from './materials';
import { currentDeciders, type SceneModel } from './sceneModel';
import { LOCAL_CARD_RADIUS, SEAT_RADIUS, TABLE, frameAt, slotAngle } from './layout';
import { SpeechBubble } from './labels/SpeechBubble';
import { useDeferredMount } from './useDeferredMount';

export const Seats = memo(function Seats({
  model,
  game,
  room,
}: {
  model: SceneModel;
  game: GameView | null;
  room: RoomView | null;
}) {
  const deciders = currentDeciders(game);
  const actorId = game ? (game.phase.kind === 'game_over' ? game.winnerId : game.actorId) : null;
  const winnerId = game?.winnerId ?? null;
  const winsOf = (id: string) => room?.players.find((p) => p.id === id)?.wins ?? 0;
  const labelsReady = useDeferredMount();

  return (
    <>
      {model.seats
        .filter((s) => !s.isLocal)
        .map((s) => (
          <Character
            key={s.id}
            seat={s}
            angle={slotAngle(s.slot, model.layoutCount)}
            mode={model.mode}
            deciding={deciders.includes(s.id)}
            isActor={model.mode === 'game' && actorId === s.id}
            isWinner={winnerId === s.id}
            wins={winsOf(s.id)}
            showPlate
            raised={model.layoutCount >= 4 && s.slot % 2 === 0}
          />
        ))}
      {model.emptySlots.map((slot) => (
        <EmptyChair key={slot} angle={slotAngle(slot, model.layoutCount)} />
      ))}
      {model.localId && labelsReady && (
        <Html position={[0, TABLE.feltY + 0.26, LOCAL_CARD_RADIUS + 0.05]} zIndexRange={[40, 10]} wrapperClass="sc-html">
          <div className="sc-anchor">
            <SpeechBubble playerId={model.localId} variant="local" />
          </div>
        </Html>
      )}
    </>
  );
});

function EmptyChair({ angle }: { angle: number }) {
  const f = frameAt(angle, SEAT_RADIUS);
  return <mesh geometry={emptyChairGeometry()} material={toonMat()} position={[f.x, 0, f.z]} rotation-y={f.yaw} />;
}
