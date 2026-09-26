/**
 * Home screen ambience: a few idle animals playing around the table, reacting to each other.
 */
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type { AvatarId } from '@shared/types';
import { Character } from './characters/Character';
import type { SeatModel } from './sceneModel';
import { homeAngle } from './layout';
import { react, setFocus, type ReactionKind } from './reactions';

export const HOME_CAST: AvatarId[] = ['pig', 'fox', 'bunny', 'bear'];

export function homeSeat(avatar: AvatarId, i: number): SeatModel {
  return {
    id: `home:${avatar}`,
    name: avatar,
    avatar,
    slot: i,
    isLocal: false,
    isHost: false,
    botBadge: false,
    botControlled: false,
    offline: false,
    inGame: false,
    coins: 2 + ((i * 3) % 5),
    influences: [],
    hiddenCount: 2,
    eliminated: false,
  };
}

const MOODS: ReactionKind[] = ['act', 'win', 'block', 'challenge', 'surprise', 'act', 'win'];

export function HomeCast() {
  const seats = useMemo(() => HOME_CAST.map(homeSeat), []);
  const next = useRef({ at: 1.5, i: 0 });

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const n = next.current;
    if (t < n.at) return;
    const s = seats[Math.floor(Math.random() * seats.length)];
    const mood = MOODS[n.i++ % MOODS.length];
    react(s.id, mood);
    setFocus(s.id, 2.2);
    n.at = t + 2.2 + Math.random() * 1.8;
  });

  return (
    <>
      {seats.map((s, i) => (
        <Character
          key={s.id}
          seat={s}
          angle={homeAngle(i, seats.length)}
          mode="home"
          deciding={false}
          isActor={false}
          isWinner={false}
          wins={0}
          showPlate={false}
        />
      ))}
    </>
  );
}
