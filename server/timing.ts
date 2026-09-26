/**
 * Every duration the server uses, in one object so tests (and the integration suite) can run
 * whole games in a fraction of the real time with `scaledTiming(0.02)`.
 */
import {
  BOT_THINK_MS,
  EMOTE_COOLDOWN_MS,
  EMPTY_ROOM_DELETE_MS,
  LOBBY_DISCONNECT_REMOVE_MS,
  LOSE_INFLUENCE_SECONDS,
  MIN_PHASE_SETTLE_MS,
  RECONNECT_GRACE_MS,
} from '@shared/constants';
import type { BotLevel } from '@shared/types';

export interface ServerTiming {
  /** Multiplier applied to the room's turn/response settings (seconds → ms). 1 in production. */
  phaseScale: number;
  loseInfluenceMs: number;
  reconnectGraceMs: number;
  lobbyDisconnectRemoveMs: number;
  emptyRoomDeleteMs: number;
  botThinkMs: Record<BotLevel, [number, number]>;
  /** Bots never act earlier than this after a phase began (lets clients animate). */
  minPhaseSettleMs: number;
  /** Bots always act at least this long before the phase deadline. */
  botDeadlineMarginMs: number;
  emoteCooldownMs: number;
  /** Minimum gap between two emotes of the same bot. */
  botEmoteGapMs: number;
  /** Random delay range before a bot's reaction emote is shown. */
  botEmoteDelayMs: [number, number];
}

export const DEFAULT_TIMING: ServerTiming = {
  phaseScale: 1,
  loseInfluenceMs: LOSE_INFLUENCE_SECONDS * 1000,
  reconnectGraceMs: RECONNECT_GRACE_MS,
  lobbyDisconnectRemoveMs: LOBBY_DISCONNECT_REMOVE_MS,
  emptyRoomDeleteMs: EMPTY_ROOM_DELETE_MS,
  botThinkMs: BOT_THINK_MS,
  minPhaseSettleMs: MIN_PHASE_SETTLE_MS,
  botDeadlineMarginMs: 300,
  emoteCooldownMs: EMOTE_COOLDOWN_MS,
  botEmoteGapMs: 8000,
  botEmoteDelayMs: [350, 1100],
};

/** DEFAULT_TIMING with every duration multiplied by `scale` (e.g. 0.02 → a 30 s turn lasts 600 ms). */
export function scaledTiming(scale: number, base: ServerTiming = DEFAULT_TIMING): ServerTiming {
  const s = (ms: number) => Math.round(ms * scale);
  const range = ([lo, hi]: [number, number]): [number, number] => [s(lo), s(hi)];
  return {
    phaseScale: base.phaseScale * scale,
    loseInfluenceMs: s(base.loseInfluenceMs),
    reconnectGraceMs: s(base.reconnectGraceMs),
    lobbyDisconnectRemoveMs: s(base.lobbyDisconnectRemoveMs),
    emptyRoomDeleteMs: s(base.emptyRoomDeleteMs),
    botThinkMs: {
      easy: range(base.botThinkMs.easy),
      normal: range(base.botThinkMs.normal),
      hard: range(base.botThinkMs.hard),
    },
    minPhaseSettleMs: s(base.minPhaseSettleMs),
    botDeadlineMarginMs: s(base.botDeadlineMarginMs),
    emoteCooldownMs: s(base.emoteCooldownMs),
    botEmoteGapMs: s(base.botEmoteGapMs),
    botEmoteDelayMs: range(base.botEmoteDelayMs),
  };
}
