import { memo } from 'react';
import type { GameView } from '@shared/types';
import { useT } from '../../i18n';
import { useGame } from '../../store/useGame';
import { Avatar } from '../common/Avatar';
import { Icon } from '../common/Icon';
import { useMe, useSelfId } from '../hooks';
import { joinNames, pendingDeciders } from './phaseText';

function waitKey(g: GameView): string {
  switch (g.phase.kind) {
    case 'turn':
      return 'wait.forAction';
    case 'lose_influence':
      return 'wait.forLose';
    case 'exchange':
      return 'wait.forExchange';
    default:
      return 'wait.for';
  }
}

/** Shown in the dock when the local player has nothing to decide ("Đang chờ … quyết định"). */
export const WaitingPanel = memo(function WaitingPanel() {
  const t = useT();
  const game = useGame((s) => s.game);
  const lobby = useGame((s) => s.room?.players);
  const selfId = useSelfId();
  const me = useMe();
  if (!game) return null;

  if (game.phase.kind === 'game_over') {
    const winnerId = game.phase.winnerId;
    const name = game.players.find((p) => p.id === winnerId)?.name ?? '???';
    return (
      <div className="waiting-panel is-over">
        <Avatar avatar={lobby?.find((p) => p.id === winnerId)?.avatar} size={48} className="bob" />
        <div className="waiting-panel__title">{winnerId === selfId ? t('over.youWin') : t('over.playerWins', { name })}</div>
      </div>
    );
  }

  if (!me || me.eliminated) {
    return (
      <div className="waiting-panel is-spectating">
        <Icon name="eye" size={34} />
        <div>
          <div className="waiting-panel__title">{t(me ? 'spect.out' : 'spect.viewer')}</div>
          <div className="waiting-panel__sub">{t('spect.body')}</div>
        </div>
      </div>
    );
  }

  if (game.prompt) {
    // lose_influence / exchange decisions happen in their modal.
    return (
      <div className="waiting-panel is-mine">
        <Icon name="hand" size={30} />
        <div className="waiting-panel__title">{t('wait.yourModal')}</div>
      </div>
    );
  }

  const deciders = pendingDeciders(game.phase).filter((id) => id !== selfId);
  const names = deciders.map((id) => game.players.find((p) => p.id === id)?.name ?? '???');
  const ph = game.phase;
  const passed = (ph.kind === 'action_response' || ph.kind === 'block_response') && !!selfId && ph.passed.includes(selfId);

  return (
    <div className="waiting-panel">
      <div className="waiting-panel__avatars">
        {deciders.slice(0, 5).map((id, i) => (
          <span key={id} className="bob" style={{ animationDelay: `${i * 140}ms` }}>
            <Avatar avatar={lobby?.find((p) => p.id === id)?.avatar} size={42} />
          </span>
        ))}
      </div>
      <div>
        {passed && <span className="tag tag--teal">{t('wait.passed')}</span>}
        <div className="waiting-panel__title">
          {t(waitKey(game), { name: names[0] ?? '', names: joinNames(names, t) })}
          <span className="dots" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
        </div>
      </div>
    </div>
  );
});
