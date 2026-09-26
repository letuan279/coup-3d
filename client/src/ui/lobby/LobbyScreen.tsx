import { useState } from 'react';
import { MIN_PLAYERS } from '@shared/constants';
import type { BotLevel } from '@shared/types';
import { useT } from '../../i18n';
import { api } from '../../net/socket';
import { useGame } from '../../store/useGame';
import { withToast } from '../apiToast';
import { copyText, inviteLink } from '../clipboard';
import { Icon } from '../common/Icon';
import { LangToggle, RulesButton, SoundToggle } from '../common/Toggles';
import { useIsHost } from '../hooks';
import { HostPanel } from './HostPanel';
import { ProfilePanel } from './ProfilePanel';
import { SeatCard } from './SeatCard';

export function LobbyScreen() {
  const t = useT();
  const room = useGame((s) => s.room);
  const isHost = useIsHost();
  const [botLevel, setBotLevel] = useState<BotLevel>('normal');
  const [starting, setStarting] = useState(false);
  if (!room) return null;

  const seats = Array.from({ length: room.maxPlayers }, (_, i) => room.players.find((p) => p.seat === i));
  const count = room.players.length;
  const full = count >= room.maxPlayers;
  const canStart = count >= MIN_PLAYERS;

  const start = async () => {
    if (!canStart || starting) return;
    setStarting(true);
    await withToast(api.start());
    setStarting(false);
  };

  return (
    <div className="screen lobby-screen">
      <aside className="lobby-side lobby-side--left interactive">
        <section className="lobby-card sticker lobby-code-card pop-in">
          <span className="panel-kicker">{t('lobby.roomCode')}</span>
          <div className="code-tiles" aria-label={room.code}>
            {room.code.split('').map((ch, i) => (
              <span key={i} className="code-tile" style={{ animationDelay: `${i * 60}ms` }}>
                {ch}
              </span>
            ))}
          </div>
          <div className="code-actions">
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => void copyText(room.code)}>
              <Icon name="copy" size={18} />
              {t('lobby.copyCode')}
            </button>
            <button type="button" className="btn btn-mustard btn-sm" onClick={() => void copyText(inviteLink(room.code))}>
              <Icon name="link" size={18} />
              {t('lobby.copyLink')}
            </button>
          </div>
        </section>

        <section className="lobby-card sticker seats-card">
          <h3 className="panel-title">
            <Icon name="users" size={20} />
            {t('lobby.players', { n: count, max: room.maxPlayers })}
          </h3>
          <ul className="seat-list">
            {seats.map((p, i) => (
              <SeatCard key={p?.id ?? `empty-${i}`} seat={i} player={p} youId={room.youId} isHost={isHost} botLevel={botLevel} />
            ))}
          </ul>
        </section>
      </aside>

      <aside className="lobby-side lobby-side--right interactive">
        <div className="lobby-tools">
          <RulesButton withLabel />
          <LangToggle />
          <SoundToggle />
        </div>

        <HostPanel isHost={isHost} full={full} botLevel={botLevel} onBotLevel={setBotLevel} />
        <ProfilePanel />

        <section className="lobby-cta sticker">
          {isHost ? (
            <>
              <button type="button" className="btn btn-coral btn-xl btn-block" disabled={!canStart || starting} onClick={() => void start()}>
                {starting ? <span className="spinner" /> : <Icon name="chevronRight" size={26} />}
                {t('lobby.start')}
              </button>
              <p className="lobby-cta__hint">{canStart ? t('lobby.readyHint', { n: count }) : t('lobby.needPlayers')}</p>
            </>
          ) : (
            <div className="lobby-wait">
              {t('lobby.waitingHost')}
              <span className="dots" aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
            </div>
          )}
          <button type="button" className="btn btn-ghost btn-sm btn-block" onClick={() => void withToast(api.leaveRoom())}>
            <Icon name="leave" size={18} />
            {t('lobby.leave')}
          </button>
        </section>
      </aside>

      <div className="lobby-banner sticker pop-in">
        <span className="lobby-banner__title">{t('lobby.title')}</span>
        <span className="lobby-banner__sub">{t('lobby.hint')}</span>
      </div>
    </div>
  );
}
