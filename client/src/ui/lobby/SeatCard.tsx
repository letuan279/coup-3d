import { memo } from 'react';
import type { BotLevel, LobbyPlayer } from '@shared/types';
import { useT } from '../../i18n';
import { api } from '../../net/socket';
import { useGame } from '../../store/useGame';
import { Avatar } from '../common/Avatar';
import { Icon } from '../common/Icon';
import { errorKey } from '../errors';

interface Props {
  seat: number;
  player: LobbyPlayer | undefined;
  youId: string;
  isHost: boolean;
  botLevel: BotLevel;
  /**
   * The server seats a new bot in the LOWEST free seat, so only that empty row offers "Add bot"
   * (a button on seat 6 must not fill seat 5).
   */
  canAddBot?: boolean;
}

export const SeatCard = memo(function SeatCard({ seat, player: p, youId, isHost, botLevel, canAddBot }: Props) {
  const t = useT();

  if (!p) {
    return (
      <li className="seat-card is-empty">
        <span className="seat-card__num">{seat + 1}</span>
        <span className="seat-card__empty-avatar" />
        <span className="seat-card__empty-label">{t('lobby.emptySeat')}</span>
        {isHost && canAddBot && (
          <button
            type="button"
            className="btn btn-sm btn-ghost seat-card__add"
            onClick={() => {
              void api.addBot(botLevel).then((r) => {
                if (!r.ok) useGame.getState().toast(errorKey(r.error), 'error');
              });
            }}
          >
            <Icon name="bot" size={18} />
            {t('lobby.addBotShort')}
          </button>
        )}
      </li>
    );
  }

  const isYou = p.id === youId;
  const online = p.kind === 'bot' || p.connected;
  const statusKey = p.connected ? 'lobby.status.online' : 'lobby.status.offline';

  return (
    <li className={`seat-card pop-in${isYou ? ' is-you' : ''}`}>
      <span className="seat-card__num">{seat + 1}</span>
      <span className="seat-card__avatar">
        <Avatar avatar={p.avatar} size={46} dim={!online} />
        {p.isHost && (
          <span className="seat-card__crown" title={t('common.host')}>
            <Icon name="crown" size={18} />
          </span>
        )}
      </span>
      <span className="seat-card__main">
        {/* The name gets the whole line; badges live on the status line so names are not cut. */}
        <span className="seat-card__name">
          <span className="truncate" title={p.name}>
            {p.name}
          </span>
        </span>
        <span className="seat-card__status">
          {isYou && <span className="tag tag--coral">{t('common.you')}</span>}
          {p.kind === 'bot' ? (
            <span className="tag tag--violet">
              <Icon name="bot" size={14} />
              {t('common.bot')} · {t(`botLevel.${p.botLevel ?? 'normal'}`)}
            </span>
          ) : (
            <>
              <span className={`dot ${online ? 'dot--on' : 'dot--off'}`} />
              {t(statusKey)}
            </>
          )}
          {p.wins > 0 && (
            <span className="seat-card__wins" title={t('lobby.winsTitle')}>
              <Icon name="trophy" size={14} />
              {p.wins}
            </span>
          )}
        </span>
      </span>
      {isHost && !isYou && (
        <button
          type="button"
          className="icon-btn seat-card__kick"
          title={t('lobby.kick')}
          aria-label={t('lobby.kick')}
          onClick={() => {
            void api.kick(p.id).then((r) => {
              if (!r.ok) useGame.getState().toast(errorKey(r.error), 'error');
            });
          }}
        >
          <Icon name="close" size={18} />
        </button>
      )}
    </li>
  );
});
