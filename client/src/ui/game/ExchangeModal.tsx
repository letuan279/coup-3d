import { memo, useEffect, useState } from 'react';
import { useT } from '../../i18n';
import { useGame } from '../../store/useGame';
import { Countdown } from '../common/Countdown';
import { GameCard } from '../common/GameCard';
import { Icon } from '../common/Icon';
import { Modal } from '../common/Modal';
import { useHud } from '../hudStore';
import { sendMove } from '../moves';

/** Ambassador exchange: keep exactly `keepCount` of hand + drawn cards. */
export const ExchangeModal = memo(function ExchangeModal() {
  const t = useT();
  const prompt = useGame((s) => (s.game?.prompt?.kind === 'exchange' ? s.game.prompt : null));
  const phaseSeq = useGame((s) => s.game?.phaseSeq);
  const busy = useHud((s) => s.moveInFlight);
  const [picked, setPicked] = useState<number[]>([]);

  // Fresh selection for every new exchange.
  useEffect(() => setPicked([]), [phaseSeq]);

  if (!prompt) return null;
  const { cards, keepCount } = prompt;
  const ready = picked.length === keepCount;

  const toggle = (i: number) => {
    setPicked((p) => {
      if (p.includes(i)) return p.filter((x) => x !== i);
      const next = [...p, i];
      // At the limit, the oldest pick makes room for the new one.
      return next.length > keepCount ? next.slice(next.length - keepCount) : next;
    });
  };

  return (
    <Modal title={t('ex.title')} soft className="decision-modal exchange-modal">
      <p className="decision-modal__hint">{t(keepCount === 1 ? 'ex.pickOne' : 'ex.pickMany', { n: keepCount })}</p>
      <div className="decision-cards">
        {cards.map((c, i) => {
          const on = picked.includes(i);
          // Current hidden cards come first; keepCount equals their number.
          const drawn = i >= keepCount;
          return (
            <button
              key={i}
              type="button"
              className={`pick-card${on ? ' is-on' : ''}${drawn ? ' is-drawn' : ''}`}
              aria-pressed={on}
              disabled={busy}
              onClick={() => toggle(i)}
            >
              <span className={`pick-card__tag ${drawn ? 'tag tag--mustard' : 'tag tag--violet'}`}>{t(drawn ? 'ex.drawn' : 'ex.current')}</span>
              <GameCard character={c} width={118} />
              <span className="pick-card__check" aria-hidden="true">
                <Icon name="check" size={22} />
              </span>
            </button>
          );
        })}
      </div>
      <div className="exchange-foot">
        <span className={`exchange-count${ready ? ' is-ready' : ''}`}>{t('ex.selected', { k: picked.length, n: keepCount })}</span>
        <button
          type="button"
          className="btn btn-teal btn-lg"
          disabled={!ready || busy}
          onClick={() => void sendMove({ type: 'exchange', keep: [...picked].sort((a, b) => a - b) })}
        >
          <Icon name="check" />
          {t('ex.confirm')}
        </button>
      </div>
      <Countdown className="decision-modal__timer" />
      <p className="decision-modal__foot">{t('ex.auto')}</p>
    </Modal>
  );
});
