import { memo, type CSSProperties, type ReactNode } from 'react';
import { ACTION_GAIN, ACTIONS } from '@shared/constants';
import { ACTION_TYPES, type ActionOption, type ActionType, type Character } from '@shared/types';
import { getCharacterIconUrl } from '../../art/cardArt';
import { useT } from '../../i18n';
import { useGame } from '../../store/useGame';
import { CharChip, charColorVar } from '../common/CharChip';
import { CoinIcon } from '../common/Coin';
import { Icon } from '../common/Icon';
import { useHud } from '../hudStore';
import { useMe } from '../hooks';
import { pickAction } from '../moves';

function ActionGlyph({ action, claim }: { action: ActionType; claim?: Character }) {
  if (claim) return <img className="act-btn__emblem" src={getCharacterIconUrl(claim)} alt="" draggable={false} />;
  if (action === 'income') return <CoinIcon size={34} />;
  if (action === 'foreign_aid') return <Icon name="hand" size={32} />;
  return <Icon name="sword" size={32} />;
}

function CoinDelta({ action }: { action: ActionType }) {
  const t = useT();
  const cost = ACTIONS[action].cost;
  const gain = ACTION_GAIN[action];
  if (cost > 0) return <span className="act-btn__delta is-cost">−{cost}</span>;
  if (gain > 0) return <span className="act-btn__delta is-gain">+{gain}</span>;
  return <span className="act-btn__delta">{t('act.draw2')}</span>;
}

/** The 7 actions of prompt.options, in ACTION_TYPES order (hotkeys 1–7). */
export const ActionBar = memo(function ActionBar() {
  const prompt = useGame((s) => (s.game?.prompt?.kind === 'choose_action' ? s.game.prompt : null));
  const inFlight = useHud((s) => s.moveInFlight);
  const me = useMe();
  if (!prompt) return null;
  const held = new Set(me?.influences.filter((i) => !i.revealed).map((i) => i.character));

  return (
    <div className={`action-bar${inFlight ? ' is-busy' : ''}`} role="toolbar">
      {ACTION_TYPES.map((a, i) => {
        const opt = prompt.options.find((o) => o.action === a);
        if (!opt) return null;
        return (
          <ActionButton
            key={a}
            opt={opt}
            hotkey={i + 1}
            mustCoup={prompt.mustCoup && a === 'coup'}
            bluff={!!opt.claim && !held.has(opt.claim)}
            busy={inFlight}
          />
        );
      })}
    </div>
  );
});

interface ButtonProps {
  opt: ActionOption;
  hotkey: number;
  mustCoup: boolean;
  bluff: boolean;
  busy: boolean;
}

const ActionButton = memo(function ActionButton({ opt, hotkey, mustCoup, bluff, busy }: ButtonProps) {
  const t = useT();
  const a = opt.action;
  const disabled = !opt.enabled || busy;
  const style = (opt.claim ? { '--cc': charColorVar(opt.claim) } : {}) as CSSProperties;
  let reason: ReactNode = null;
  if (!opt.enabled && opt.disabledReason) {
    reason = t(`act.disabled.${opt.disabledReason}`, { n: opt.cost });
  }
  const def = ACTIONS[a];

  return (
    <div className="act-wrap">
      <button
        type="button"
        className={`act-btn act-btn--${a}${opt.claim ? ' has-claim' : ''}${!opt.enabled ? ' is-disabled' : ''}${mustCoup ? ' is-must' : ''}`}
        style={style}
        aria-disabled={disabled}
        aria-keyshortcuts={String(hotkey)}
        onClick={() => {
          if (!disabled) pickAction(opt);
        }}
      >
        <kbd className="act-btn__key">{hotkey}</kbd>
        {bluff && opt.enabled && <span className="act-btn__bluff">{t('act.bluffTag')}</span>}
        <span className="act-btn__glyph">
          <ActionGlyph action={a} claim={opt.claim} />
        </span>
        <span className="act-btn__name">{t(`action.${a}`)}</span>
        <CoinDelta action={a} />
      </button>
      <div className="act-tip sticker" role="tooltip">
        <div className="act-tip__head">
          <b>{t(`action.${a}`)}</b>
          {opt.claim ? <CharChip c={opt.claim} /> : <span className="tag">{t('act.noClaim')}</span>}
        </div>
        <p>{t(`actionDesc.${a}`)}</p>
        {def.blockedBy.length > 0 && (
          <div className="act-tip__row">
            <span className="muted">{t('act.blockedBy')}</span>
            {def.blockedBy.map((c) => (
              <CharChip key={c} c={c} iconOnly />
            ))}
          </div>
        )}
        {bluff && opt.enabled && <p className="act-tip__bluff">{t('act.bluffHint')}</p>}
        {mustCoup && <p className="act-tip__must">{t('act.mustCoup')}</p>}
        {reason && <p className="act-tip__reason">{reason}</p>}
      </div>
    </div>
  );
});
