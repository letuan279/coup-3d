import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { NAME_MAX_LENGTH, ROOM_CODE_LENGTH } from '@shared/constants';
import { getCardFaceUrl } from '../../art/cardArt';
import { useArtVersion } from '../../art/refresh';
import { useT } from '../../i18n';
import { sanitizeCode } from '../../net/links';
import { api, clearInvite, inviteKeyFor } from '../../net/socket';
import { useGame } from '../../store/useGame';
import { AvatarPicker } from '../common/AvatarPicker';
import { Icon } from '../common/Icon';
import { LangToggle, RulesButton, SoundToggle } from '../common/Toggles';
import { errorKey } from '../errors';

/** Replays a CSS shake on an element. */
function shake(el: HTMLElement | null) {
  if (!el) return;
  el.classList.remove('shake');
  void el.offsetWidth;
  el.classList.add('shake');
}

export function HomeScreen() {
  const t = useT();
  const lang = useGame((s) => s.ui.lang);
  const profile = useGame((s) => s.profile);
  const setProfile = useGame((s) => s.setProfile);
  const toast = useGame((s) => s.toast);
  // Invite link (?room=CODE) captured by net/socket.ts; gone again if a rejoin link turned out dead.
  const invited = useGame((s) => s.invite?.code ?? '');
  // A rejoin the player confirmed in RejoinPrompt is in flight.
  const autoJoining = useGame((s) => !!s.invite?.joining);
  const [code, setCode] = useState(invited);
  const [busyState, setBusy] = useState<'create' | 'join' | null>(null);
  const busy = autoJoining ? 'join' : busyState;
  useEffect(() => {
    if (invited) setCode(invited);
  }, [invited]);
  const nameRef = useRef<HTMLInputElement>(null);
  const codeRef = useRef<HTMLInputElement>(null);

  // Home is on screen when late web fonts arrive: re-read the redrawn art then (art/refresh.ts).
  const artVersion = useArtVersion();
  const fan = useMemo(
    () => (['duke', 'assassin', 'contessa'] as const).map((c) => ({ c, src: getCardFaceUrl(c, lang) })),
    [lang, artVersion], // artVersion: the cached data URLs were redrawn
  );

  const validName = (): string | null => {
    const name = profile.name.trim();
    if (!name) {
      toast('home.nameRequired', 'error');
      shake(nameRef.current);
      nameRef.current?.focus();
      return null;
    }
    return name;
  };

  const create = async () => {
    const name = validName();
    if (!name || busy) return;
    setBusy('create');
    clearInvite();
    const res = await api.createRoom(name, profile.avatar);
    setBusy(null);
    if (!res.ok) toast(errorKey(res.error), 'error');
  };

  const join = async (e?: FormEvent) => {
    e?.preventDefault();
    const name = validName();
    if (!name || busy) return;
    if (code.length !== ROOM_CODE_LENGTH) {
      toast('home.codeInvalid', 'error');
      shake(codeRef.current);
      codeRef.current?.focus();
      return;
    }
    setBusy('join');
    // A rejoin link that could not be used automatically still works from here.
    const key = inviteKeyFor(code);
    if (invited && invited !== code) clearInvite();
    const res = await api.joinRoom(code, name, profile.avatar, key);
    setBusy(null);
    if (!res.ok) toast(errorKey(res.error), 'error');
  };


  return (
    <div className="screen home-screen">
      <div className="home-col">
        <header className="home-logo">
          <div className="home-fan" aria-hidden="true">
            {fan.map((f, i) => (
              <img key={f.c} src={f.src} alt="" className={`home-fan__card home-fan__card--${i}`} draggable={false} />
            ))}
          </div>
          <h1 className="logo-title">{t('game.title')}</h1>
          <div className="logo-ribbon">{t('game.subtitle')}</div>
          <p className="home-tagline">{t('home.tagline')}</p>
        </header>

        <section className="home-panel sticker interactive pop-in">
          <label className="field">
            <span className="field__label">{t('home.nameLabel')}</span>
            <input
              ref={nameRef}
              className="input input-lg"
              value={profile.name}
              maxLength={NAME_MAX_LENGTH}
              placeholder={t('home.namePlaceholder')}
              onChange={(e) => setProfile({ name: e.target.value.slice(0, NAME_MAX_LENGTH) })}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void (invited ? join() : create());
              }}
              autoComplete="nickname"
              spellCheck={false}
            />
          </label>

          <div className="field">
            <span className="field__label">{t('home.avatarLabel')}</span>
            <AvatarPicker value={profile.avatar} onChange={(avatar) => setProfile({ avatar })} size={46} />
          </div>

          <div className="home-actions">
            <button
              type="button"
              className={`btn btn-lg btn-block ${invited ? 'btn-ghost' : 'btn-coral'}`}
              onClick={() => void create()}
              disabled={busy !== null}
            >
              {busy === 'create' ? <span className="spinner" /> : <Icon name="plus" />}
              {t('home.create')}
            </button>

            <div className={`divider${invited ? ' divider--invite' : ''}`}>
              {invited && <Icon name="link" size={16} />}
              <span>{invited ? t('home.invited', { code: invited }) : t('home.or')}</span>
            </div>

            <form className="join-row" onSubmit={(e) => void join(e)}>
              <input
                ref={codeRef}
                className="input input-code"
                value={code}
                placeholder={t('home.codePlaceholder')}
                onChange={(e) => setCode(sanitizeCode(e.target.value))}
                aria-label={t('home.codePlaceholder')}
                autoComplete="off"
                autoCapitalize="characters"
                autoCorrect="off"
                enterKeyHint="go"
                spellCheck={false}
              />
              <button type="submit" className={`btn btn-lg ${invited ? 'btn-coral' : 'btn-teal'}`} disabled={busy !== null}>
                {busy === 'join' ? <span className="spinner" /> : <Icon name="chevronRight" />}
                {t('home.join')}
              </button>
            </form>
          </div>
        </section>
      </div>

      <div className="corner-tools corner-tools--br interactive">
        <RulesButton withLabel />
        <LangToggle />
        <SoundToggle />
      </div>
    </div>
  );
}
