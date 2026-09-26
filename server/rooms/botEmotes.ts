/**
 * Bot personality flavour: occasional emotes reacting to public events. Pure — the room
 * applies per-bot rate limiting and delivery delays.
 */
import type { EmoteId, LoggedEvent } from '@shared/types';

export interface EmoteIntent {
  playerId: string;
  emote: EmoteId;
}

interface Reaction {
  playerId: string;
  emotes: readonly EmoteId[];
  chance: number;
}

function reactionsFor(e: LoggedEvent): Reaction[] {
  switch (e.type) {
    case 'challenge_result':
      return e.challengedHadCard
        ? [
            { playerId: e.challengedId, emotes: ['cool', 'laugh'], chance: 0.45 },
            { playerId: e.challengerId, emotes: ['angry', 'wow'], chance: 0.2 },
          ]
        : [
            { playerId: e.challengerId, emotes: ['liar'], chance: 0.65 },
            { playerId: e.challengedId, emotes: ['please', 'think'], chance: 0.15 },
          ];
    case 'action_blocked':
      return [{ playerId: e.actorId, emotes: ['angry', 'think'], chance: 0.2 }];
    case 'eliminated':
      return [{ playerId: e.playerId, emotes: ['please', 'angry'], chance: 0.35 }];
    case 'game_over':
      return [{ playerId: e.winnerId, emotes: ['gg', 'cool'], chance: 0.85 }];
    default:
      return [];
  }
}

/** At most one emote per bot for a batch of events (the latest reaction wins). */
export function botEmoteReactions(
  events: readonly LoggedEvent[],
  isBot: (playerId: string) => boolean,
  rand: () => number,
): EmoteIntent[] {
  const picked = new Map<string, EmoteId>();
  for (const e of events) {
    for (const r of reactionsFor(e)) {
      if (!isBot(r.playerId) || rand() >= r.chance) continue;
      picked.set(r.playerId, r.emotes[Math.floor(rand() * r.emotes.length) % r.emotes.length]);
    }
  }
  return [...picked].map(([playerId, emote]) => ({ playerId, emote }));
}
