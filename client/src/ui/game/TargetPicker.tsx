import { memo, useEffect, useRef, type CSSProperties } from 'react';
import type { ActionType, InfluenceView, PlayerPublic } from '@shared/types';
import { useT } from '../../i18n';
import { useGame } from '../../store/useGame';
import { Avatar } from '../common/Avatar';
import { CharChip, charColorVar } from '../common/CharChip';
import { CoinIcon } from '../common/Coin';
import { Icon } from '../common/Icon';
import { useHud } from '../hudStore';
import { pickTarget } from '../moves';
import { claimHover, releaseHover } from './hoverOwner';

/** Targeting mode: pick the victim of a coup / assassination / steal (Esc cancels). */
export const TargetPicker = memo(function TargetPicker() {
  const t = useT();
  const action = useGame((s) => s.ui.targeting);
  const prompt = useGame((s) => (s.game?.prompt?.kind === 'choose_action' ? s.game.prompt : null));
  const players = useGame((s) => s.game?.players);
  const cancel = useGame((s) => s.cancelTargeting);
  if (!action || !prompt || !players) return null;
  const opt = prompt.options.find((o) => o.action === action);
  const targets = (opt?.targets ?? []).map((id) => players.find((p) => p.id === id)).filter((p): p is PlayerPublic => !!p);

  return (
    <div className="target-picker">
      <div className="target-picker__head">
        <span className="target-picker__title">
          {t('target.title', { action: t(`action.${action}`) })}
          {opt?.claim && <CharChip c={opt.claim} />}
        </span>
        <button type="button" className="btn btn-ghost btn-sm" onClick={cancel}>
          <Icon name="close" size={16} />
          {t('common.cancel')} <kbd>Esc</kbd>
        </button>
      </div>
      <div className="target-picker__list">
        {targets.map((p, i) => (
          <TargetButton key={p.id} p={p} action={action} hotkey={i + 1} />
        ))}
      </div>
      <p className="target-picker__hint">{t('target.hint')}</p>
    </div>
  );
});

const TargetButton = memo(function TargetButton({ p, action, hotkey }: { p: PlayerPublic; action: ActionType; hotkey: number }) {
  const t = useT();
  const avatar = useGame((s) => s.room?.players.find((x) => x.id === p.id)?.avatar);
  const hovered = useGame((s) => s.ui.hoverPlayerId === p.id);
  const busy = useHud((s) => s.moveInFlight);
  // Did THIS button set the hover highlight? Then it must clear it when it goes away — Esc, a digit
  // key or a phase change unmount the picker without any mouseleave/blur.
  const owns = useRef(false);
  useEffect(
    () => () => {
      releaseHover(owns, p.id);
    },
    [p.id],
  );
  const enter = () => claimHover(owns, p.id);
  const leave = () => releaseHover(owns, p.id);
  return (
    <button
      type="button"
      className={`target-btn${hovered ? ' is-hover' : ''}`}
      disabled={busy}
      onMouseEnter={enter}
      onMouseLeave={leave}
      onFocus={enter}
      onBlur={leave}
      onClick={() => {
        leave();
        pickTarget(action, p.id);
      }}
    >
      <kbd className="kbd-badge">{hotkey}</kbd>
      <Avatar avatar={avatar} size={40} />
      <span className="target-btn__info">
        <span className="target-btn__name truncate">{p.name}</span>
        <span className="target-btn__meta">
          <span className="rt-coins">
            <CoinIcon size={14} />
            {p.coins}
          </span>
          <span className="pips" aria-label={t('target.cards', { n: p.hiddenCount })}>
            {p.influences.map((inf) => (
              <InfluencePip key={inf.slot} inf={inf} />
            ))}
          </span>
        </span>
      </span>
    </button>
  );
});

/** Face-down pip, or — once revealed — a chip in that character's colour (name in the tooltip). */
function InfluencePip({ inf }: { inf: InfluenceView }) {
  const t = useT();
  if (!inf.revealed) return <i className="pip" title={t('target.hiddenCard')} />;
  if (!inf.character) return <i className="pip is-lost" />;
  const name = t(`char.${inf.character}`);
  return (
    <i
      className="pip is-lost has-char"
      style={{ '--cc': charColorVar(inf.character) } as CSSProperties}
      title={t('target.lostCard', { char: name })}
      aria-label={t('target.lostCard', { char: name })}
    />
  );
}
