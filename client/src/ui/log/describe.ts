/**
 * Localized one-line descriptions for every public GameEvent (game log, banners, panels).
 * Pure: the caller passes the player list and a translate function.
 */
import type { CoinParty, GameEvent } from '@shared/types';
import { formatSegs, seg, segsToText, type Seg, type SegParam, type Translate } from './rich';

export interface NamedPlayer {
  id: string;
  name: string;
}

export type EventTone = 'turn' | 'action' | 'challenge' | 'block' | 'loss' | 'coins' | 'good' | 'win' | 'muted';

export interface DescribedEvent {
  segs: Seg[];
  /** Plain-text version (aria labels, tests). */
  text: string;
  tone: EventTone;
  /** Low-importance line (rendered smaller in the log). */
  minor: boolean;
}

export interface DescribeOptions {
  /**
   * When set, a target equal to this id is rendered as "you"/"bạn" (object position only).
   * Used by the phase banner and the response panel; the log always uses names.
   */
  selfId?: string | null;
}

export function describeEvent(
  e: GameEvent,
  players: readonly NamedPlayer[],
  t: Translate,
  opts: DescribeOptions = {},
): DescribedEvent {
  const P = (id: string): Seg => seg.player(id, players.find((p) => p.id === id)?.name ?? '???');
  const target = (id: string | undefined): Seg =>
    id && opts.selfId && id === opts.selfId ? seg.player(id, t('ui.youObj')) : P(id ?? '');
  const party = (x: CoinParty): Seg => (x === 'treasury' ? { k: 'text', v: t('log.treasury') } : P(x));

  const out = (key: string, params: Record<string, SegParam>, tone: EventTone, minor = false): DescribedEvent => {
    const segs = formatSegs(t(key), params);
    return { segs, text: segsToText(segs), tone, minor };
  };

  switch (e.type) {
    case 'game_start':
      return out('log.game_start', { player: P(e.firstPlayerId), n: e.playerIds.length }, 'turn');
    case 'turn_start':
      return out('log.turn_start', { player: P(e.playerId), turn: e.turn }, 'turn');
    case 'action':
      return out(
        `log.action.${e.action}`,
        {
          actor: P(e.actorId),
          target: target(e.targetId),
          char: e.claim ? seg.char(e.claim, t) : '',
          action: seg.action(e.action, t),
        },
        'action',
      );
    case 'pass':
      return out('log.pass', { player: P(e.playerId) }, 'muted', true);
    case 'challenge':
      return out(
        e.against === 'block' ? 'log.challenge.block' : 'log.challenge.action',
        { challenger: P(e.challengerId), challenged: P(e.challengedId), char: seg.char(e.character, t) },
        'challenge',
      );
    case 'challenge_result':
      return out(
        e.challengedHadCard ? 'log.challenge_result.had' : 'log.challenge_result.bluff',
        { challenger: P(e.challengerId), challenged: P(e.challengedId), char: seg.char(e.character, t) },
        e.challengedHadCard ? 'good' : 'challenge',
      );
    case 'card_replaced':
      return out('log.card_replaced', { player: P(e.playerId), char: seg.char(e.character, t) }, 'muted', true);
    case 'block':
      return out(
        'log.block',
        { blocker: P(e.blockerId), actor: P(e.actorId), action: seg.action(e.action, t), char: seg.char(e.character, t) },
        'block',
      );
    case 'influence_lost':
      return out(
        'log.influence_lost',
        { player: P(e.playerId), char: seg.char(e.character, t), reason: t(`reason.${e.reason}`) },
        'loss',
      );
    case 'eliminated':
      return out('log.eliminated', { player: P(e.playerId) }, 'loss');
    case 'coins':
      return describeCoins(e, party, P, t, out);
    case 'exchange_draw':
      return out('log.exchange_draw', { player: P(e.playerId), n: e.count }, 'muted', true);
    case 'exchange_done':
      return out('log.exchange_done', { player: P(e.playerId), n: e.returned }, 'muted', true);
    case 'action_resolved':
      return out('log.action_resolved', { actor: P(e.actorId), action: seg.action(e.action, t) }, 'good', true);
    case 'action_blocked':
      return out(
        'log.action_blocked',
        { actor: P(e.actorId), action: seg.action(e.action, t), blocker: P(e.blockerId), char: seg.char(e.character, t) },
        'block',
      );
    case 'action_failed':
      return out('log.action_failed', { actor: P(e.actorId), action: seg.action(e.action, t) }, 'loss');
    case 'timeout':
      return out(`log.timeout.${e.phase}`, { player: P(e.playerId) }, 'muted');
    case 'game_over':
      return out('log.game_over', { player: P(e.winnerId) }, 'win');
  }
}

function describeCoins(
  e: Extract<GameEvent, { type: 'coins' }>,
  party: (x: CoinParty) => Seg,
  P: (id: string) => Seg,
  t: Translate,
  out: (key: string, params: Record<string, SegParam>, tone: EventTone, minor?: boolean) => DescribedEvent,
): DescribedEvent {
  const n = seg.coins(e.amount, t);
  const params = { from: party(e.from), to: party(e.to), n };
  if (e.reason === 'eliminated' && e.from !== 'treasury') return out('log.coins.eliminated', { player: P(e.from), n }, 'coins', true);
  if (e.reason === 'refund' && e.to !== 'treasury') return out('log.coins.refund', { player: P(e.to), n }, 'coins', true);
  if (e.from === 'treasury' && e.to !== 'treasury') return out('log.coins.gain', { player: P(e.to), n }, 'coins', true);
  if (e.to === 'treasury' && e.from !== 'treasury') return out('log.coins.pay', { player: P(e.from), n }, 'coins', true);
  if (e.reason === 'steal') return out('log.coins.steal', params, 'coins', true);
  return out('log.coins.move', params, 'coins', true);
}
