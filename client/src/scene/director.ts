/**
 * Turns bus events (public game log deltas + emotes) into scene happenings: character
 * reactions, speech bubbles, coin flights and card animations. No React state involved.
 */
import type { EmoteId, LoggedEvent } from '@shared/types';
import { on } from '../net/bus';
import { useGame } from '../store/useGame';
import { actionKey, charKey, t } from '../i18n';
import { react, setFocus, showBubble } from './reactions';
import { queueCoinFlight } from './table/Coins';
import { queueCardReplace, queueExchangeDraw, queueExchangeReturn } from './table/tableState';

function nameOf(id: string | undefined): string {
  if (!id) return '';
  const s = useGame.getState();
  return s.game?.players.find((p) => p.id === id)?.name ?? s.room?.players.find((p) => p.id === id)?.name ?? '';
}

export function handleEvent(e: LoggedEvent): void {
  switch (e.type) {
    case 'action': {
      react(e.actorId, 'act');
      setFocus(e.actorId);
      const action = t(actionKey(e.action));
      const target = nameOf(e.targetId);
      let text: string;
      if (e.claim) {
        text = t(target ? 'scene.bubble.claimTarget' : 'scene.bubble.claim', { char: t(charKey(e.claim)), action, target });
      } else {
        text = t(target ? 'scene.bubble.actionTarget' : 'scene.bubble.action', { action, target });
      }
      showBubble(e.actorId, text, 'claim');
      if (e.targetId) react(e.targetId, 'surprise');
      break;
    }
    case 'challenge':
      react(e.challengerId, 'challenge');
      react(e.challengedId, 'surprise');
      setFocus(e.challengerId);
      showBubble(e.challengerId, t('scene.bubble.challenge'), 'challenge');
      break;
    case 'challenge_result':
      if (e.challengedHadCard) {
        react(e.challengedId, 'win');
        react(e.challengerId, 'sad');
        showBubble(e.challengedId, t('scene.bubble.proven', { char: t(charKey(e.character)) }), 'good');
      } else {
        react(e.challengerId, 'win');
        react(e.challengedId, 'sad');
        showBubble(e.challengerId, t('scene.bubble.caught'), 'good');
      }
      break;
    case 'card_replaced':
      queueCardReplace(e.playerId, e.slot, e.character);
      break;
    case 'block':
      react(e.blockerId, 'block');
      setFocus(e.blockerId);
      showBubble(e.blockerId, t('scene.bubble.block', { char: t(charKey(e.character)) }), 'block');
      break;
    case 'influence_lost':
      react(e.playerId, 'hurt');
      react(e.playerId, 'sad');
      setFocus(e.playerId, 1.8);
      break;
    case 'eliminated':
      showBubble(e.playerId, t('scene.bubble.eliminated'), 'bad');
      break;
    case 'coins':
      queueCoinFlight(e.from, e.to, e.amount);
      break;
    case 'exchange_draw':
      queueExchangeDraw(e.playerId, e.count);
      showBubble(e.playerId, t('scene.bubble.exchange'), 'info');
      break;
    case 'exchange_done':
      queueExchangeReturn(e.playerId, e.returned);
      break;
    case 'action_blocked':
    case 'action_failed':
      react(e.actorId, 'sad');
      break;
    case 'timeout':
      showBubble(e.playerId, t('scene.bubble.timeout'), 'info');
      break;
    case 'game_over':
      react(e.winnerId, 'win');
      setFocus(e.winnerId, 4);
      showBubble(e.winnerId, t('scene.bubble.win'), 'good');
      break;
    default:
      break;
  }
}

export function handleEmote(playerId: string, emote: EmoteId): void {
  showBubble(playerId, t(`emote.${emote}`), 'emote');
  if (emote === 'laugh' || emote === 'gg' || emote === 'cool') react(playerId, 'win');
  else if (emote === 'angry' || emote === 'liar') react(playerId, 'challenge');
  else if (emote === 'wow') react(playerId, 'surprise');
  else if (emote === 'please') react(playerId, 'sad');
}

/** Subscribes the director to the bus; returns an unsubscribe function. */
export function startDirector(): () => void {
  const offEvents = on('events', (events) => {
    for (const e of events) handleEvent(e);
  });
  const offEmote = on('emote', ({ playerId, emote }) => handleEmote(playerId, emote));
  return () => {
    offEvents();
    offEmote();
  };
}
