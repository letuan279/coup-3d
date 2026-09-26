import { useMemo, useRef, useState, type FormEvent } from 'react';
import { NAME_MAX_LENGTH, ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH } from '@shared/constants';
import { getCardFaceUrl } from '../../art/cardArt';
import { useT } from '../../i18n';
import { api, roomCodeFromUrl } from '../../net/socket';
import { useGame } from '../../store/useGame';
import { AvatarPicker } from '../common/AvatarPicker';
import { Icon } from '../common/Icon';
import { LangToggle, RulesButton, SoundToggle } from '../common/Toggles';
import { errorKey } from '../errors';

function sanitizeCode(raw: string): string {
  let out = '';
  for (const ch of raw.toUpperCase()) {
    if (ROOM_CODE_ALPHABET.includes(ch)) out += ch;
    if (out.length >= ROOM_CODE_LENGTH) break;
  }
  return out;
}

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
  const invited = useMemo(() => sanitizeCode(roomCodeFromUrl() ?? ''), []);
  const [code, setCode] = useState(invited);
  const [busy, setBusy] = useState<'create' | 'join' | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const codeRef = useRef<HTMLInputElement>(null);

  const fan = useMemo(
    () => (['duke', 'assassin', 'contessa'] as const).map((c) => ({ c, src: getCardFaceUrl(c, lang) })),
    [lang],
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
    const res = await api.joinRoom(code, name, profile.avatar);
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
