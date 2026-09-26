import { memo, useMemo } from 'react';
import type { GameView } from '@shared/types';
import { useT } from '../../i18n';
import { useGame } from '../../store/useGame';
import { Countdown } from '../common/Countdown';
import { GameCard } from '../common/GameCard';
import { Modal } from '../common/Modal';
import { RichText } from '../common/RichText';
import { formatSegs, seg, type Seg, type Translate } from '../log/rich';
import { useHud } from '../hudStore';
import { useMe, useSelfId } from '../hooks';
import { sendMove } from '../moves';

/** Why the local player is losing an influence, as a localized sentence. */
function reasonSegs(g: GameView, selfId: string | null, t: Translate): Seg[] {
  const ph = g.phase;
  if (ph.kind !== 'lose_influence') return [];
  const P = (id: string) => seg.player(id, g.players.find((p) => p.id === id)?.name ?? '???');
  const a = ph.action;
  const b = ph.block;
  switch (ph.reason) {
    case 'coup':
    case 'assassinate':
      if (a) return formatSegs(t(`lose.why.${ph.reason}`), { actor: P(a.actorId) });
      break;
    case 'wrong_challenge':
      if (b) return formatSegs(t('lose.why.wrong_challenge'), { player: P(b.blockerId), char: seg.char(b.character, t) });
      if (a?.claim) return formatSegs(t('lose.why.wrong_challenge'), { player: P(a.actorId), char: seg.char(a.claim, t) });
      break;
    case 'caught_bluffing': {
      const c = b && b.blockerId === selfId ? b.character : a?.claim;
      if (c) return formatSegs(t('lose.why.caught_bluffing'), { char: seg.char(c, t) });
      break;
    }
  }
  return formatSegs(t('lose.why.generic'), { reason: t(`reason.${ph.reason}`) });
}

/** Pick which of your cards to turn face up. */
export const LoseInfluenceModal = memo(function LoseInfluenceModal() {
  const t = useT();
  const game = useGame((s) => s.game);
  const selfId = useSelfId();
  const me = useMe();
  const busy = useHud((s) => s.moveInFlight);
  const prompt = game?.prompt?.kind === 'lose_influence' ? game.prompt : null;
  const why = useMemo(() => (game && prompt ? reasonSegs(game, selfId, t) : []), [game, prompt, selfId, t]);
  if (!prompt || !me) return null;

  return (
    <Modal title={t('lose.title')} soft className="decision-modal lose-modal">
      <p className="decision-modal__why">
        <RichText segs={why} selfId={selfId} />
      </p>
      <p className="decision-modal__hint">{t('lose.pick')}</p>
      <div className="decision-cards">
        {me.influences.map((inf, i) => {
          const can = prompt.slots.includes(inf.slot);
          return (
            <button
              key={inf.slot}
              type="button"
              className={`pick-card${can ? '' : ' is-locked'}`}
              disabled={!can || busy}
              onClick={() => void sendMove({ type: 'reveal', slot: inf.slot })}
            >
              <GameCard character={inf.character} revealed={inf.revealed} width={132} />
              <span className="pick-card__label">
                {can && <kbd>{i + 1}</kbd>}
                {can ? t('lose.reveal') : t('lose.lost')}
              </span>
            </button>
          );
        })}
      </div>
      <Countdown className="decision-modal__timer" />
      <p className="decision-modal__foot">{t('lose.auto')}</p>
    </Modal>
  );
});
