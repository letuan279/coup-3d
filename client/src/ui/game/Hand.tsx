import { memo } from 'react';
import { useT } from '../../i18n';
import { CoinIcon } from '../common/Coin';
import { GameCard } from '../common/GameCard';
import { useMe } from '../hooks';

/** The local player's two influences (big card art) + coin counter. */
export const Hand = memo(function Hand() {
  const me = useMe();
  const t = useT();
  if (!me) return null;
  return (
    <div className="hand" aria-label={t('hud.yourCards')}>
      <div className="hand__cards">
        {me.influences.map((inf) => (
          <div key={inf.slot} className={`hand__slot${inf.revealed ? ' is-lost' : ''}`}>
            <GameCard character={inf.character} revealed={inf.revealed} width={96} />
            <span className="hand__label">{inf.character ? t(`char.${inf.character}`) : '?'}</span>
          </div>
        ))}
      </div>
      <CoinCounter coins={me.coins} />
    </div>
  );
});

const CoinCounter = memo(function CoinCounter({ coins }: { coins: number }) {
  const t = useT();
  return (
    <div className="coin-counter" title={t('hud.coins')}>
      <CoinIcon size={40} />
      <span key={coins} className="coin-counter__n bump">
        {coins}
      </span>
      <span className="coin-counter__label">{coins === 1 ? t('ui.coin') : t('common.coins')}</span>
    </div>
  );
});
