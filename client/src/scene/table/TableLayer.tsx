/**
 * Everything lying on the felt: cards, coins, the court deck and the actor spotlight.
 * Builds plain data specs from the scene model; the children animate themselves.
 */
import { memo, useCallback, useEffect, useMemo } from 'react';
import type { GameView } from '@shared/types';
import { TREASURY_COINS } from '@shared/constants';
import { useGame, type Lang } from '../../store/useGame';
import { homeAngle, slotAngle } from '../layout';
import { targetIds, type SceneModel } from '../sceneModel';
import { HOME_CAST, homeSeat } from '../HomeCast';
import { ExchangeFlights, TableCard, type CardSpec } from './Cards';
import { Coins, resetCoinFlights, type CoinTableState } from './Coins';
import { CenterPile } from './CenterPile';
import { ActorSpot, type SpotTarget } from '../fx/ActorSpot';

export const TableLayer = memo(function TableLayer({
  model,
  game,
  lang,
  gameNumber,
}: {
  model: SceneModel;
  game: GameView | null;
  lang: Lang;
  gameNumber: number;
}) {
  const targetKey = useGame((s) => targetIds(s.game, s.ui.targeting).join(','));
  const targets = useMemo(() => new Set(targetKey ? targetKey.split(',') : []), [targetKey]);

  useEffect(() => {
    resetCoinFlights();
  }, [gameNumber, model.mode]);

  const cards = useMemo((): CardSpec[] => {
    if (model.mode === 'home') {
      return HOME_CAST.flatMap((a, i) =>
        [0, 1].map((slot) => ({
          key: `home:${a}:${slot}`,
          playerId: `home:${a}`,
          slot,
          angle: homeAngle(i, HOME_CAST.length),
          isLocal: false,
          revealed: false,
          character: null,
        })),
      );
    }
    if (model.mode !== 'game') return [];
    return model.seats.flatMap((s) =>
      s.influences.map((inf) => ({
        key: `${s.id}:${inf.slot}`,
        playerId: s.id,
        slot: inf.slot,
        angle: slotAngle(s.slot, model.layoutCount),
        isLocal: s.isLocal,
        revealed: inf.revealed,
        character: inf.character,
      })),
    );
  }, [model]);

  const coins = useMemo((): CoinTableState => {
    if (model.mode === 'home') {
      const seats = HOME_CAST.map((a, i) => {
        const s = homeSeat(a, i);
        return { id: s.id, angle: homeAngle(i, HOME_CAST.length), isLocal: false, coins: s.coins };
      });
      return { seats, treasury: TREASURY_COINS - seats.reduce((n, s) => n + s.coins, 0) };
    }
    if (model.mode === 'lobby' || !game) return { seats: [], treasury: TREASURY_COINS };
    return {
      seats: model.seats.map((s) => ({ id: s.id, angle: slotAngle(s.slot, model.layoutCount), isLocal: s.isLocal, coins: s.coins })),
      treasury: game.treasury,
    };
  }, [model, game]);

  const spot = useMemo((): SpotTarget | null => {
    if (model.mode !== 'game' || !game) return null;
    const id = game.phase.kind === 'game_over' ? game.winnerId : game.actorId;
    const s = model.seats.find((x) => x.id === id);
    return s ? { angle: slotAngle(s.slot, model.layoutCount), isLocal: s.isLocal } : null;
  }, [model, game]);

  const angleOf = useCallback(
    (playerId: string) => {
      const s = model.seats.find((x) => x.id === playerId);
      return s ? { angle: slotAngle(s.slot, model.layoutCount), isLocal: s.isLocal } : null;
    },
    [model],
  );

  const deckCount = model.mode === 'game' && game ? game.deckCount : model.mode === 'home' ? 7 : 15;

  return (
    <>
      {cards.map((c) => (
        <TableCard key={c.key} spec={c} lang={lang} targetable={targets.has(c.playerId)} />
      ))}
      <Coins state={coins} />
      <CenterPile deckCount={deckCount} />
      <ActorSpot target={spot} />
      <ExchangeFlights angleOf={angleOf} />
    </>
  );
});
