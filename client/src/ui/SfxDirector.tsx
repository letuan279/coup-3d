/**
 * The ONE place that maps happenings to sounds: bus 'events' (game log deltas), emotes, rejected
 * moves and UI button presses. Also unlocks the AudioContext on the first user gesture.
 * Renders nothing.
 */
import { useEffect } from 'react';
import type { LoggedEvent } from '@shared/types';
import { sfx, unlockAudio } from '../audio/sfx';
import { on } from '../net/bus';
import { selfId } from '../store/useGame';

/** Delay between sounds of one batch so a burst of events stays readable. */
const STEP_S = 0.12;

function playEvents(events: readonly LoggedEvent[]) {
  const me = selfId();
  let delay = 0;
  // A batch can contain many events (e.g. challenge → reveal → loss → coins); play the
  // important ones in order with small offsets, and coins as a single clink burst.
  const later = (fn: () => void) => {
    const d = delay;
    delay += STEP_S;
    if (d === 0) fn();
    else window.setTimeout(fn, d * 1000);
  };
  let coinCount = 0;
  for (const e of events) {
    switch (e.type) {
      case 'turn_start':
        if (e.playerId === me) later(() => sfx.yourTurn());
        break;
      case 'action':
        later(() => sfx.whoosh());
        break;
      case 'challenge':
        later(() => sfx.challenge());
        break;
      case 'challenge_result':
      case 'card_replaced':
      case 'exchange_draw':
      case 'exchange_done':
        later(() => sfx.flip());
        break;
      case 'block':
        later(() => sfx.block());
        break;
      case 'action_blocked':
        break;
      case 'influence_lost':
        later(() => sfx.lose());
        break;
      case 'eliminated':
        later(() => sfx.eliminated());
        break;
      case 'coins':
        if (e.amount > 0) coinCount += Math.min(3, e.amount);
        break;
      case 'game_over':
        later(() => (e.winnerId === me ? sfx.win() : sfx.gameOver()));
        break;
      default:
        break;
    }
  }
  if (coinCount > 0) later(() => sfx.coin(coinCount));
}

export function SfxDirector() {
  useEffect(() => {
    const unlock = () => unlockAudio();
    window.addEventListener('pointerdown', unlock, true);
    window.addEventListener('keydown', unlock, true);

    // Button press "click" for every enabled HUD button.
    const onClick = (ev: MouseEvent) => {
      const el = ev.target instanceof Element ? ev.target.closest('button') : null;
      if (el && !el.disabled && el.getAttribute('aria-disabled') !== 'true' && el.closest('.ui-layer')) sfx.click();
    };
    document.addEventListener('click', onClick, true);

    const offEvents = on('events', playEvents);
    const offEmote = on('emote', () => sfx.pop());
    const offRejected = on('moveRejected', () => sfx.error());
    return () => {
      window.removeEventListener('pointerdown', unlock, true);
      window.removeEventListener('keydown', unlock, true);
      document.removeEventListener('click', onClick, true);
      offEvents();
      offEmote();
      offRejected();
    };
  }, []);
  return null;
}
