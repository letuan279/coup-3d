import { memo, useEffect, useMemo, type CSSProperties } from 'react';
import { useT } from '../../i18n';
import { api } from '../../net/socket';
import { useGame } from '../../store/useGame';
import { withToast } from '../apiToast';
import { Avatar } from '../common/Avatar';
import { Icon } from '../common/Icon';
import { useHud } from '../hudStore';
import { useIsHost, useSelfId } from '../hooks';

const CONFETTI_COLORS = ['#FF6B5B', '#FFC24B', '#1FB5A8', '#7B61FF', '#FF9EC7', '#8FD8FF', '#9BE7C4'];

/** Cheap CSS confetti: a fixed set of absolutely positioned pieces animating transform only. */
const Confetti = memo(function Confetti() {
  const pieces = useMemo(
    () =>
      Array.from({ length: 64 }, (_, i) => ({
        left: Math.random() * 100,
        delay: Math.random() * 1.6,
        dur: 2.6 + Math.random() * 2,
        rot: Math.round(Math.random() * 720 - 360),
        drift: Math.round(Math.random() * 160 - 80),
        color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
        wide: i % 3 === 0,
      })),
    [],
  );
  return (
    <div className="confetti" aria-hidden="true">
      {pieces.map((p, i) => (
        <i
          key={i}
          className={p.wide ? 'is-wide' : ''}
          style={
            {
              left: `${p.left}%`,
              background: p.color,
              animationDelay: `${p.delay}s`,
              animationDuration: `${p.dur}s`,
              '--rot': `${p.rot}deg`,
              '--drift': `${p.drift}px`,
            } as CSSProperties
          }
        />
      ))}
    </div>
  );
});

export const GameOverOverlay = memo(function GameOverOverlay() {
  const t = useT();
  const winnerId = useGame((s) => (s.game?.phase.kind === 'game_over' ? s.game.phase.winnerId : null));
  const lobbyPlayers = useGame((s) => s.room?.players);
  const winnerGameName = useGame((s) => s.game?.players.find((p) => p.id === winnerId)?.name);
  const selfId = useSelfId();
  const isHost = useIsHost();
  const minimized = useHud((s) => s.overMinimized);
  const setHud = useHud((s) => s.set);

  useEffect(() => {
    setHud({ overMinimized: false });
  }, [winnerId, setHud]);

  const tally = useMemo(
    () => [...(lobbyPlayers ?? [])].sort((a, b) => b.wins - a.wins || a.seat - b.seat),
    [lobbyPlayers],
  );

  if (!winnerId) return null;
  const winner = lobbyPlayers?.find((p) => p.id === winnerId);
  const name = winner?.name ?? winnerGameName ?? '???';
  const youWon = winnerId === selfId;
  const title = youWon ? t('over.youWin') : t('over.playerWins', { name });

  const actions = (
    <>
      {isHost ? (
        <button type="button" className="btn btn-coral btn-lg" onClick={() => void withToast(api.backToLobby())}>
          <Icon name="plus" />
          {t('over.newGame')}
        </button>
      ) : (
        <span className="over-wait">{t('over.waitHost')}</span>
      )}
      <button type="button" className="btn btn-ghost btn-lg" onClick={() => void withToast(api.leaveRoom())}>
        <Icon name="leave" />
        {t('over.leave')}
      </button>
    </>
  );

  if (minimized) {
    return (
      <div className="over-mini sticker interactive pop-in">
        <Avatar avatar={winner?.avatar} size={36} />
        <b>{title}</b>
        <button type="button" className="btn btn-mustard btn-sm" onClick={() => setHud({ overMinimized: false })}>
          <Icon name="trophy" size={18} />
          {t('over.showResult')}
        </button>
        {isHost && (
          <button type="button" className="btn btn-coral btn-sm" onClick={() => void withToast(api.backToLobby())}>
            <Icon name="plus" size={18} />
            {t('over.newGame')}
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="over-backdrop interactive">
      <Confetti />
      <div className="over-card sticker pop-in">
        <div className="over-ribbon">{t('common.winner')}</div>
        <div className="over-portrait">
          <span className="over-portrait__rays" aria-hidden="true" />
          <Avatar avatar={winner?.avatar} size={132} className="over-portrait__avatar" />
          <span className="over-portrait__crown">
            <Icon name="crown" size={44} />
          </span>
        </div>
        <h2 className="over-title">{title}</h2>
        <p className="over-sub">{t(youWon ? 'over.subWin' : 'over.subLose')}</p>

        <div className="over-tally">
          <div className="over-tally__title">
            <Icon name="trophy" size={18} />
            {t('over.tally')}
          </div>
          <ol>
            {tally.map((p) => (
              <li key={p.id} className={p.id === winnerId ? 'is-winner' : ''}>
                <Avatar avatar={p.avatar} size={28} />
                <span className="truncate">{p.name}</span>
                {p.id === selfId && <span className="tag tag--coral">{t('common.you')}</span>}
                {p.kind === 'bot' && <span className="tag tag--violet">{t('common.bot')}</span>}
                <b className="over-tally__wins">{p.wins}</b>
              </li>
            ))}
          </ol>
        </div>

        <div className="over-actions">{actions}</div>
        <button type="button" className="link-btn" onClick={() => setHud({ overMinimized: true })}>
          <Icon name="eye" size={18} />
          {t('over.viewTable')}
        </button>
      </div>
    </div>
  );
});
