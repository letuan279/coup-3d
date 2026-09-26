import { memo, useEffect, useRef, useState, type CSSProperties } from 'react';
import { EMOTE_COOLDOWN_MS } from '@shared/constants';
import { EMOTES, type EmoteId } from '@shared/types';
import { useT } from '../../i18n';
import { on } from '../../net/bus';
import { api } from '../../net/socket';
import { selfId } from '../../store/useGame';
import { EmoteFace } from '../common/EmoteFace';
import { Icon } from '../common/Icon';
import { useHud } from '../hudStore';

/** Bottom-left emote button + picker (cooldown EMOTE_COOLDOWN_MS) and a bubble for your own emote. */
export const EmotePicker = memo(function EmotePicker() {
  const t = useT();
  const open = useHud((s) => s.emoteOpen);
  const setHud = useHud((s) => s.set);
  const [cooling, setCooling] = useState(false);
  const [bubble, setBubble] = useState<{ id: number; emote: EmoteId } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  // Echo of our own emote (the 3D scene shows everyone else's above their heads).
  useEffect(() => {
    let timer = 0;
    const off = on('emote', ({ playerId, emote }) => {
      if (playerId !== selfId()) return;
      window.clearTimeout(timer);
      setBubble({ id: Date.now(), emote });
      timer = window.setTimeout(() => setBubble(null), 2200);
    });
    return () => {
      off();
      window.clearTimeout(timer);
    };
  }, []);

  // Close when clicking elsewhere.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (rootRef.current && e.target instanceof Node && !rootRef.current.contains(e.target)) setHud({ emoteOpen: false });
    };
    window.addEventListener('pointerdown', onDown, true);
    return () => window.removeEventListener('pointerdown', onDown, true);
  }, [open, setHud]);

  const send = (emote: EmoteId) => {
    if (cooling) return;
    api.emote(emote);
    setCooling(true);
    setHud({ emoteOpen: false });
    window.setTimeout(() => setCooling(false), EMOTE_COOLDOWN_MS);
  };

  return (
    <div ref={rootRef} className="emote-dock interactive">
      {bubble && (
        <div key={bubble.id} className="emote-bubble sticker pop-in">
          <EmoteFace emote={bubble.emote} size={30} />
          <span>{t(`emote.${bubble.emote}`)}</span>
        </div>
      )}
      {open && (
        <div className="emote-menu sticker pop-in" role="menu">
          <div className="emote-menu__title">{t('emote.title')}</div>
          <div className="emote-grid">
            {EMOTES.map((e) => (
              <button key={e} type="button" role="menuitem" className="emote-btn" disabled={cooling} onClick={() => send(e)}>
                <EmoteFace emote={e} />
                <span>{t(`emote.${e}`)}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      <button
        type="button"
        className={`emote-toggle sticker-btn${cooling ? ' is-cooling' : ''}${open ? ' is-open' : ''}`}
        style={{ '--cooldown': `${EMOTE_COOLDOWN_MS}ms` } as CSSProperties}
        onClick={() => setHud({ emoteOpen: !open })}
        aria-expanded={open}
        title={t('emote.title')}
        aria-label={t('emote.title')}
      >
        <Icon name="smile" size={28} />
        <span className="emote-toggle__cool" aria-hidden="true" />
      </button>
    </div>
  );
});
