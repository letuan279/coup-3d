/**
 * Derives what the tavern should show from the store's room/game (pure, testable).
 */
import type { AvatarId, BotLevel, GameView, InfluenceView, RoomView } from '@shared/types';
import { AVATARS } from '@shared/types';
import { MAX_PLAYERS } from '@shared/constants';

export type SceneMode = 'home' | 'lobby' | 'game';

export interface SeatModel {
  id: string;
  name: string;
  avatar: AvatarId;
  /** Layout slot: 0 = local seat (camera), 1.. = opponents clockwise. */
  slot: number;
  isLocal: boolean;
  isHost: boolean;
  /** A bot seat or a human seat currently played by a bot. */
  botBadge: boolean;
  botLevel?: BotLevel;
  botControlled: boolean;
  /** Disconnected human (or left mid-game). */
  offline: boolean;
  // ── game only ──
  inGame: boolean;
  coins: number;
  influences: InfluenceView[];
  hiddenCount: number;
  eliminated: boolean;
}

export interface SceneModel {
  mode: SceneMode;
  /** Number of layout positions around the table (lobby: always MAX_PLAYERS). */
  layoutCount: number;
  seats: SeatModel[];
  /** Lobby: opponent slots with nobody in them (empty chairs). */
  emptySlots: number[];
  localId: string | null;
}

const EMPTY: SceneModel = { mode: 'home', layoutCount: 0, seats: [], emptySlots: [], localId: null };

export function buildSceneModel(room: RoomView | null, game: GameView | null): SceneModel {
  if (!room && !game) return EMPTY;
  const localId = room?.youId ?? game?.viewerId ?? null;
  const lobbyById = new Map((room?.players ?? []).map((p) => [p.id, p]));

  if (game) {
    const players = [...game.players].sort((a, b) => a.seat - b.seat);
    const n = players.length;
    let localIdx = players.findIndex((p) => p.id === localId);
    const spectator = localIdx < 0;
    if (spectator) localIdx = 0;
    const seats: SeatModel[] = players.map((p, i) => {
      const lp = lobbyById.get(p.id);
      const rel = (i - localIdx + n) % n;
      const isLocal = !spectator && rel === 0;
      return {
        id: p.id,
        name: lp?.name ?? p.name,
        avatar: lp?.avatar ?? AVATARS[p.seat % AVATARS.length],
        // A spectator sees everyone: shift so nobody sits in the camera seat.
        slot: spectator ? rel + 1 : rel,
        isLocal,
        isHost: lp?.isHost ?? false,
        botBadge: lp ? lp.kind === 'bot' || lp.botControlled : false,
        botLevel: lp?.botLevel,
        botControlled: lp?.botControlled ?? false,
        offline: lp ? lp.kind === 'human' && (!lp.connected || lp.left) : false,
        inGame: true,
        coins: p.coins,
        influences: p.influences,
        hiddenCount: p.hiddenCount,
        eliminated: p.eliminated,
      };
    });
    return { mode: 'game', layoutCount: spectator ? n + 1 : n, seats, emptySlots: [], localId };
  }

  // Lobby: fixed 6-seat layout so players pop into "their" chair as they join.
  const r = room!;
  const total = Math.max(MAX_PLAYERS, r.maxPlayers);
  const local = r.players.find((p) => p.id === r.youId);
  const localSeat = local?.seat ?? 0;
  const used = new Set<number>();
  const seats: SeatModel[] = r.players.map((p) => {
    const slot = (p.seat - localSeat + total) % total;
    used.add(slot);
    return {
      id: p.id,
      name: p.name,
      avatar: p.avatar,
      slot,
      isLocal: p.id === r.youId,
      isHost: p.isHost,
      botBadge: p.kind === 'bot' || p.botControlled,
      botLevel: p.botLevel,
      botControlled: p.botControlled,
      offline: p.kind === 'human' && (!p.connected || p.left),
      inGame: false,
      coins: 0,
      influences: [],
      hiddenCount: 0,
      eliminated: false,
    };
  });
  const emptySlots: number[] = [];
  for (let s = 1; s < total; s++) if (!used.has(s)) emptySlots.push(s);
  return { mode: 'lobby', layoutCount: total, seats, emptySlots, localId: r.youId };
}

/** Players who must decide right now (phase deciders), for countdown rings. */
export function currentDeciders(game: GameView | null): string[] {
  if (!game) return [];
  const ph = game.phase;
  switch (ph.kind) {
    case 'turn':
      return [ph.actorId];
    case 'action_response':
    case 'block_response':
      return ph.responders.filter((id) => !ph.passed.includes(id));
    case 'lose_influence':
      return [ph.playerId];
    case 'exchange':
      return [ph.actorId];
    default:
      return [];
  }
}

/** Valid target ids for the action the local player is currently targeting. */
export function targetIds(game: GameView | null, targeting: string | null): string[] {
  if (!game || !targeting || game.prompt?.kind !== 'choose_action') return [];
  const opt = game.prompt.options.find((o) => o.action === targeting);
  return opt && opt.enabled ? opt.targets : [];
}
