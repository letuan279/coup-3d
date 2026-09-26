import { memo, useCallback, useMemo } from 'react';
import { sfx } from '../../audio/sfx';
import { useT } from '../../i18n';
import { useGame } from '../../store/useGame';
import { Avatar } from '../common/Avatar';
import { Countdown } from '../common/Countdown';
import { RichText } from '../common/RichText';
import { useAvatarOf, useSelfId } from '../hooks';
import { describePhase, joinNames, pendingDeciders } from './phaseText';

/** Top-centre banner: what is happening right now + countdown (ticks in the last 5s of your decision). */
export const PhaseBanner = memo(function PhaseBanner() {
  const t = useT();
  const game = useGame((s) => s.game);
  const selfId = useSelfId();

  const info = useMemo(() => {
    if (!game) return null;
    const d = describePhase(game, selfId, t);
    const deciders = pendingDeciders(game.phase).filter((id) => id !== selfId);
    const names = deciders.map((id) => game.players.find((p) => p.id === id)?.name ?? '???');
    const yourCall = game.prompt !== null;
    const tone =
      game.phase.kind === 'game_over'
        ? 'win'
        : game.phase.kind === 'lose_influence'
          ? 'danger'
          : game.phase.kind === 'block_response'
            ? 'block'
            : yourCall
              ? 'mine'
              : 'neutral';
    const callKey = game.phase.kind === 'turn' ? 'phase.hintKeys' : 'phase.yourCall';
    return { d, names, yourCall, callKey, tone, seq: game.phaseSeq, over: game.phase.kind === 'game_over' };
  }, [game, selfId, t]);

  const focusAvatar = useAvatarOf(info?.d.focusId);

  const onSecond = useCallback((sec: number) => {
    if (sec > 5 || sec < 1) return;
    if (useGame.getState().game?.prompt) sfx.tick(sec <= 2);
  }, []);

  if (!info) return null;

  return (
    <div className={`phase-banner sticker phase-banner--${info.tone}`} aria-live="polite">
      <div className="phase-banner__row" key={info.seq}>
        <Avatar avatar={focusAvatar} size={40} className="phase-banner__avatar" />
        <div className="phase-banner__text">
          <div className="phase-banner__main">
            <RichText segs={info.d.segs} selfId={selfId} />
          </div>
          {!info.over && (
            <div className="phase-banner__sub">
              {info.yourCall ? (
                <span className="phase-banner__call">{t(info.callKey)}</span>
              ) : info.names.length > 0 ? (
                t('phase.waitingFor', { names: joinNames(info.names, t) })
              ) : null}
            </div>
          )}
        </div>
      </div>
      {!info.over && <Countdown className="phase-banner__timer" onSecond={onSecond} />}
    </div>
  );
});
