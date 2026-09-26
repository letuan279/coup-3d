/**
 * Everything inside the <Canvas>: lights, tavern, table, seats, table objects, camera.
 */
import { useEffect, useMemo, type RefObject } from 'react';
import { useGame } from '../store/useGame';
import { buildSceneModel } from './sceneModel';
import { Lights } from './env/Lights';
import { Tavern } from './env/Tavern';
import { Table } from './env/Table';
import { CameraRig } from './camera/CameraRig';
import { Seats } from './Seats';
import { HomeCast } from './HomeCast';
import { TableLayer } from './table/TableLayer';
import { PerfProbe } from './PerfProbe';
import { DevHandle } from './DevHandle';
import { startDirector } from './director';
import { clearReactions } from './reactions';

export function SceneContent({ perfTarget }: { perfTarget: RefObject<HTMLDivElement | null> | null }) {
  const room = useGame((s) => s.room);
  const game = useGame((s) => s.game);
  const lang = useGame((s) => s.ui.lang);
  const model = useMemo(() => buildSceneModel(room, game), [room, game]);
  const gameNumber = room?.gameNumber ?? 0;

  useEffect(() => startDirector(), []);
  useEffect(() => clearReactions(), [gameNumber]);

  return (
    <>
      <color attach="background" args={['#BDEBFF']} />
      <Lights />
      <Tavern />
      <Table />
      <CameraRig mode={model.mode} layoutCount={model.layoutCount} />
      {model.mode === 'home' ? <HomeCast /> : <Seats model={model} game={game} room={room} />}
      <TableLayer model={model} game={game} lang={lang} gameNumber={gameNumber} />
      {perfTarget && <PerfProbe target={perfTarget} />}
      {import.meta.env.DEV && <DevHandle />}
    </>
  );
}
