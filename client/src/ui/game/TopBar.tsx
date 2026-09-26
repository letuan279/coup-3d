import { memo, useEffect, useRef } from 'react';
import { useT } from '../../i18n';
import { api } from '../../net/socket';
import { useGame } from '../../store/useGame';
import { withToast } from '../apiToast';
import { copyText, rejoinLink } from '../clipboard';
import { CoinIcon } from '../common/Coin';
import { Icon } from '../common/Icon';
import { Modal } from '../common/Modal';
import { LangToggle, SoundToggle } from '../common/Toggles';
import { useHud } from '../hudStore';

/** Top strip (≤64px): room code + turn on the left; treasury/deck, quick toggles + menu on the right. */
export const TopBar = memo(function TopBar() {
  const t = useT();
  const code = useGame((s) => s.room?.code);
  const turn = useGame((s) => s.game?.turn ?? 0);
  const treasury = useGame((s) => s.game?.treasury ?? 0);
  const deck = useGame((s) => s.game?.deckCount ?? 0);
  const showLog = useGame((s) => s.ui.showLog);
  const setShowLog = useGame((s) => s.setShowLog);

  return (
    <>
      <div className="hud-top hud-top--left interactive">
        <span className="mini-logo">{t('game.title')}</span>
        {code && (
          <button type="button" className="chip chip--code" onClick={() => void copyText(code)} title={t('lobby.copyCode')}>
            <span className="chip__label">{t('hud.room')}</span>
            <b>{code}</b>
            <Icon name="copy" size={14} />
          </button>
        )}
        <span className="chip">
          <span className="chip__label">{t('hud.turnLabel')}</span>
          <b>{turn}</b>
        </span>
      </div>

      <div className="hud-top hud-top--right interactive">
        <span className="chip" title={t('hud.treasury')} aria-label={`${t('hud.treasury')}: ${treasury}`}>
          <CoinIcon size={16} />
          <b>{treasury}</b>
        </span>
        <span className="chip" title={t('hud.deck')} aria-label={`${t('hud.deck')}: ${deck}`}>
          <span className="mini-deck" aria-hidden="true" />
          <b>{deck}</b>
        </span>
        <SoundToggle />
        <button
          type="button"
          className={`icon-btn sticker-btn${showLog ? ' is-on' : ''}`}
          onClick={() => setShowLog(!showLog)}
          title={t(showLog ? 'hud.hideLog' : 'hud.showLog')}
          aria-label={t(showLog ? 'hud.hideLog' : 'hud.showLog')}
          aria-pressed={showLog}
        >
          <Icon name="log" />
        </button>
        <HudMenu />
      </div>
      <LeaveConfirm />
    </>
  );
});

const HudMenu = memo(function HudMenu() {
  const t = useT();
  const open = useHud((s) => s.menuOpen);
  const setHud = useHud((s) => s.set);
  const setShowRules = useGame((s) => s.setShowRules);
  const showLog = useGame((s) => s.ui.showLog);
  const setShowLog = useGame((s) => s.setShowLog);
  const muted = useGame((s) => s.ui.muted);
  const toggleMute = useGame((s) => s.toggleMute);
  const code = useGame((s) => s.room?.code);
  const rejoinKey = useGame((s) => s.room?.rejoinKey);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (ref.current && e.target instanceof Node && !ref.current.contains(e.target)) setHud({ menuOpen: false });
    };
    window.addEventListener('pointerdown', onDown, true);
    return () => window.removeEventListener('pointerdown', onDown, true);
  }, [open, setHud]);

  const close = () => setHud({ menuOpen: false });

  return (
    <div className="hud-menu" ref={ref}>
      <button
        type="button"
        className={`icon-btn sticker-btn${open ? ' is-on' : ''}`}
        onClick={() => setHud({ menuOpen: !open })}
        aria-expanded={open}
        aria-haspopup="menu"
        title={t('hud.menu')}
        aria-label={t('hud.menu')}
      >
        <Icon name="menu" />
      </button>
      {open && (
        <div className="hud-menu__pop sticker pop-in" role="menu">
          <button
            type="button"
            role="menuitem"
            className="menu-item"
            onClick={() => {
              setShowRules(true);
              close();
            }}
          >
            <Icon name="book" size={20} />
            {t('hud.rules')}
          </button>
          <button
            type="button"
            role="menuitem"
            className="menu-item"
            onClick={() => {
              setShowLog(!showLog);
              close();
            }}
          >
            <Icon name="log" size={20} />
            {t(showLog ? 'hud.hideLog' : 'hud.showLog')}
          </button>
          <button type="button" role="menuitem" className="menu-item" onClick={toggleMute}>
            <Icon name={muted ? 'soundOff' : 'soundOn'} size={20} />
            {t(muted ? 'ui.sound.off' : 'ui.sound.on')}
          </button>
          {code && rejoinKey && (
            <button
              type="button"
              role="menuitem"
              className="menu-item menu-item--tall"
              onClick={() => {
                void copyText(rejoinLink(code, rejoinKey));
                close();
              }}
            >
              <Icon name="link" size={20} />
              <span className="menu-item__text">
                {t('hud.copyRejoin')}
                <small className="menu-item__hint">{t('hud.copyRejoinHint')}</small>
              </span>
            </button>
          )}
          <div className="menu-item menu-item--static">
            <Icon name="globe" size={20} />
            <span>{t('hud.language')}</span>
            <LangToggle compact />
          </div>
          <hr className="menu-sep" />
          <button
            type="button"
            role="menuitem"
            className="menu-item menu-item--danger"
            onClick={() => setHud({ menuOpen: false, leaveConfirm: true })}
          >
            <Icon name="leave" size={20} />
            {t('hud.leave')}
          </button>
        </div>
      )}
    </div>
  );
});

const LeaveConfirm = memo(function LeaveConfirm() {
  const t = useT();
  const open = useHud((s) => s.leaveConfirm);
  const setHud = useHud((s) => s.set);
  const playing = useGame((s) => s.room?.status === 'playing' && s.game?.phase.kind !== 'game_over');
  if (!open) return null;
  const close = () => setHud({ leaveConfirm: false });
  return (
    <Modal title={t('hud.leaveTitle')} onClose={close} className="confirm-modal" closeLabel={t('common.close')}>
      <p className="confirm-modal__body">{t(playing ? 'hud.leaveBodyPlaying' : 'hud.leaveBody')}</p>
      <div className="confirm-modal__buttons">
        <button type="button" className="btn btn-ghost" onClick={close}>
          {t('hud.stay')}
        </button>
        <button
          type="button"
          className="btn btn-coral"
          onClick={() => {
            close();
            void withToast(api.leaveRoom());
          }}
        >
          <Icon name="leave" size={20} />
          {t('hud.leave')}
        </button>
      </div>
    </Modal>
  );
});
