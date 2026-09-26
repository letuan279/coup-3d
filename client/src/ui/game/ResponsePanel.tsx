import { memo, useMemo, type CSSProperties } from 'react';
import type { Character } from '@shared/types';
import { useT } from '../../i18n';
import { useGame } from '../../store/useGame';
import { Avatar } from '../common/Avatar';
import { charColorVar } from '../common/CharChip';
import { Countdown } from '../common/Countdown';
import { Icon } from '../common/Icon';
import { RichText } from '../common/RichText';
import { getCharacterIconUrl } from '../../art/cardArt';
import { describeEvent } from '../log/describe';
import { formatSegs, seg, type Seg } from '../log/rich';
import { useHud } from '../hudStore';
import { useAvatarOf, useMe, useSelfId } from '../hooks';
import { respond } from '../moves';

interface Situation {
  segs: Seg[];
  claimantId: string;
  question: string;
  targetIsYou: boolean;
  canChallenge: boolean;
  blockCharacters: Character[];
}

/** Challenge / block / pass decision for respond_action and respond_block prompts. */
export const ResponsePanel = memo(function ResponsePanel() {
  const t = useT();
  const game = useGame((s) => s.game);
  const selfId = useSelfId();
  const busy = useHud((s) => s.moveInFlight);
  const me = useMe();

  const sit = useMemo<Situation | null>(() => {
    if (!game?.prompt) return null;
    const { prompt, phase, players } = game;
    if (prompt.kind === 'respond_action' && phase.kind === 'action_response') {
      const a = phase.action;
      const d = describeEvent({ type: 'action', actorId: a.actorId, action: a.type, targetId: a.targetId, claim: a.claim }, players, t, { selfId });
      const q = prompt.canChallenge
        ? prompt.blockCharacters.length > 0
          ? 'resp.q.challengeOrBlock'
          : 'resp.q.believe'
        : 'resp.q.block';
      return {
        segs: d.segs,
        claimantId: a.actorId,
        question: t(q),
        targetIsYou: !!selfId && a.targetId === selfId,
        canChallenge: prompt.canChallenge,
        blockCharacters: prompt.blockCharacters,
      };
    }
    if (prompt.kind === 'respond_block' && phase.kind === 'block_response') {
      const { action: a, block: b } = phase;
      const name = (id: string) => players.find((p) => p.id === id)?.name ?? '???';
      const params = {
        blocker: seg.player(b.blockerId, name(b.blockerId)),
        actor: seg.player(a.actorId, name(a.actorId)),
        action: seg.action(a.type, t),
        char: seg.char(b.character, t),
      };
      return {
        segs: formatSegs(t(a.actorId === selfId ? 'phase.blockYou' : 'log.block'), params),
        claimantId: b.blockerId,
        question: t('resp.q.blockReal'),
        targetIsYou: false,
        canChallenge: true,
        blockCharacters: [],
      };
    }
    return null;
  }, [game, selfId, t]);

  const claimantAvatar = useAvatarOf(sit?.claimantId);
  if (!sit) return null;
  const held = new Set(me?.influences.filter((i) => !i.revealed).map((i) => i.character));

  return (
    <div className="response-panel">
      <div className="response-panel__head">
        <Avatar avatar={claimantAvatar} size={44} className="wobble-in" />
        <div className="response-panel__text">
          <div className="response-panel__claim">
            <RichText segs={sit.segs} selfId={selfId} />
          </div>
          <div className="response-panel__q">
            {sit.targetIsYou && <span className="tag tag--coral tag--pulse">{t('resp.youTarget')}</span>}
            {sit.question}
          </div>
        </div>
      </div>
      <Countdown className="response-panel__timer" />
      <div className="response-panel__buttons">
        {sit.canChallenge && (
          <button type="button" className="btn btn-coral resp-btn" disabled={busy} onClick={respond.challenge}>
            <Icon name="sword" size={20} />
            {t('common.challenge')}
            <kbd className="kbd-badge">C</kbd>
          </button>
        )}
        {sit.blockCharacters.map((c, i) => (
          <button
            key={c}
            type="button"
            className="btn btn-block-char resp-btn resp-btn--block"
            style={{ '--cc': charColorVar(c) } as CSSProperties}
            disabled={busy}
            onClick={() => respond.block(c)}
            aria-label={t('resp.blockWith', { char: t(`char.${c}`) })}
            aria-keyshortcuts={i === 0 ? 'B' : undefined}
          >
            <img className="resp-btn__emblem" src={getCharacterIconUrl(c)} alt="" draggable={false} />
            <span className="resp-btn__stack">
              <small>{t('resp.blockWithLabel')}</small>
              <span>{t(`char.${c}`)}</span>
            </span>
            {!held.has(c) && <span className="resp-btn__bluff">{t('act.bluffTag')}</span>}
            {i === 0 && <kbd className="kbd-badge">B</kbd>}
          </button>
        ))}
        <button type="button" className="btn btn-teal resp-btn" disabled={busy} onClick={respond.pass}>
          <Icon name="check" size={20} />
          {t('common.pass')}
          <kbd className="kbd-badge">P</kbd>
        </button>
      </div>
    </div>
  );
});
