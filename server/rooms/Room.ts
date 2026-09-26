/**
 * One room: seats, host, settings, lobby lifecycle, disconnect/takeover/rejoin, and the glue
 * between a running GameRunner and the players' connections (docs/SPEC.md §2).
 *
 * Framework-free: time comes from the injected Clock, output goes through `Connection`s, and
 * the RoomManager is notified through `deps` callbacks (token released, room closed).
 */
import {
  CLIENT_LOG_LIMIT,
  DEFAULT_SETTINGS,
  MAX_PLAYERS,
  MIN_PLAYERS,
  RESPONSE_SECONDS_OPTIONS,
  TURN_SECONDS_OPTIONS,
} from '@shared/constants';
import { createGame } from '@shared/engine';
import { AVATARS } from '@shared/types';
import type {
  AvatarId,
  BotLevel,
  EmoteId,
  GameState,
  LobbyPlayer,
  LoggedEvent,
  Move,
  RoomSettings,
  RoomStatus,
  RoomView,
  SeatKind,
} from '@shared/types';
import type { ServerToClientEvents } from '@shared/protocol';
import type { Clock, Timer } from '../clock';
import type { ServerTiming } from '../timing';
import { fail, OK, type Connection, type Failure, type Result } from '../transport';
import { botEmoteReactions } from './botEmotes';
import type { DecideBot } from './botDriver';
import { GameRunner } from './GameRunner';
import { nameKey, pickBotName, uniqueName } from './names';

export interface RoomDeps {
  clock: Clock;
  rand: () => number;
  timing: ServerTiming;
  decideBot?: DecideBot;
  /**
   * The room no longer maps `token` to a seat (removed, left, reclaimed by another token, room
   * closed). `pendingNotice` is set when the token's client was offline and has not been told yet.
   */
  onTokenReleased(token: string, pendingNotice: ClosedReason | null): void;
  /** The room closed itself (no humans left / empty for too long) — drop it from the registry. */
  onClosed(room: Room): void;
  onError?(err: unknown): void;
}

export type ClosedReason = Parameters<ServerToClientEvents['room:closed']>[0]['reason'];

export interface JoinProfile {
  name: string;
  avatar?: AvatarId;
}

interface Seat {
  id: string;
  name: string;
  seat: number;
  kind: SeatKind;
  avatar: AvatarId;
  botLevel?: BotLevel;
  wins: number;
  /** Humans only; null once the seat is no longer owned by any client (left). */
  token: string | null;
  conn: Connection | null;
  botControlled: boolean;
  left: boolean;
  disconnectedAt: number | null;
  /** Pending lobby removal (lobby) or bot takeover (playing) of a disconnected human. */
  timer: Timer | null;
  lastEmoteAt: number;
  /** Seq of the last log event pushed to this player (for `game:state.events`). */
  lastSentSeq: number;
}

type JoinPlan = { kind: 'existing'; seat: Seat } | { kind: 'new' } | { kind: 'reclaim'; seat: Seat };

/** Bot level used for a human seat that a bot plays on their behalf. */
const TAKEOVER_BOT_LEVEL: BotLevel = 'normal';

function isFailure(v: JoinPlan | Failure): v is Failure {
  return 'ok' in v;
}

function lastSeq(log: readonly LoggedEvent[]): number {
  return log.length ? log[log.length - 1].seq : 0;
}

function eventsAfter(log: readonly LoggedEvent[], seq: number): LoggedEvent[] {
  let i = log.length;
  while (i > 0 && log[i - 1].seq > seq) i--;
  return log.slice(i);
}

export class Room {
  private hostId = '';
  private status: RoomStatus = 'lobby';
  private settings: RoomSettings = { ...DEFAULT_SETTINGS };
  private gameNumber = 0;
  private seats: Seat[] = [];
  private runner: GameRunner | null = null;
  private emptyTimer: Timer | null = null;
  private readonly emoteTimers = new Set<Timer>();
  private closed = false;
  private idCounter = 0;

  constructor(
    readonly code: string,
    private readonly deps: RoomDeps,
  ) {}

  // ───────────── Queries ─────────────

  get isClosed(): boolean {
    return this.closed;
  }

  get roomStatus(): RoomStatus {
    return this.status;
  }

  /** Current engine state (server-internal; tests and diagnostics only). */
  get game(): GameState | null {
    return this.runner?.state ?? null;
  }

  get playerCount(): number {
    return this.seats.length;
  }

  playerIdForToken(token: string): string | null {
    return this.seats.find((s) => s.token === token)?.id ?? null;
  }

  view(forId: string): RoomView {
    return {
      code: this.code,
      hostId: this.hostId,
      status: this.status,
      players: this.seats.map((s) => this.lobbyPlayer(s)),
      settings: { ...this.settings },
      youId: forId,
      maxPlayers: MAX_PLAYERS,
      gameNumber: this.gameNumber,
    };
  }

  // ───────────── Membership ─────────────

  /** Would `join` succeed? (Lets the manager keep a player in their old room when it would not.) */
  checkJoin(token: string, profile: JoinProfile): Failure | null {
    const plan = this.planJoin(token, profile);
    return isFailure(plan) ? plan : null;
  }

  /**
   * Lobby: take the lowest free seat. Game running/finished: reclaim a disconnected or left human
   * seat with the same name (case-insensitive). Same token again: just re-attach.
   */
  join(token: string, conn: Connection, profile: JoinProfile): Result<{ playerId: string }> {
    const plan = this.planJoin(token, profile);
    if (isFailure(plan)) return plan;
    switch (plan.kind) {
      case 'existing':
        this.attach(plan.seat.id, conn);
        return { ok: true, playerId: plan.seat.id };
      case 'reclaim': {
        const seat = plan.seat;
        this.releaseToken(seat, 'replaced');
        seat.token = token;
        this.attach(seat.id, conn);
        return { ok: true, playerId: seat.id };
      }
      case 'new': {
        const avatar = profile.avatar && !this.avatarTaken(profile.avatar) ? profile.avatar : this.freeAvatars()[0];
        const seat = this.addSeat('human', uniqueName(profile.name, this.seats.map((s) => s.name)), avatar);
        seat.token = token;
        seat.conn = conn;
        if (!this.hostId) this.hostId = seat.id;
        this.reviewOccupancy();
        this.broadcastRoom();
        return { ok: true, playerId: seat.id };
      }
    }
  }

  /** (Re)connect a socket to its seat: restores control from a bot and pushes a full resync. */
  attach(playerId: string, conn: Connection): void {
    const seat = this.find(playerId);
    if (this.closed || !seat || seat.kind !== 'human') return;
    const regained = seat.botControlled;
    seat.conn = conn;
    seat.disconnectedAt = null;
    seat.left = false;
    seat.botControlled = false;
    this.cancelSeatTimer(seat);
    if (regained) this.runner?.refreshControl();
    this.reviewOccupancy();
    this.broadcastRoom();
    if (this.runner) this.resync(seat);
  }

  /** The seat's socket went away (ignored if `conn` is no longer the seat's current socket). */
  detach(playerId: string, conn: Connection): void {
    const seat = this.find(playerId);
    if (this.closed || !seat || seat.conn !== conn) return;
    seat.conn = null;
    seat.disconnectedAt = this.deps.clock.now();
    this.armSeatTimer(seat);
    // After game over only the host can start the next round — hand it to someone present.
    if (this.status === 'finished' && this.hostId === seat.id) this.transferHost(true);
    if (!this.reviewOccupancy()) return;
    this.broadcastRoom();
  }

  /** Lobby: free the seat. Mid-game: the seat stays, marked `left` and played by a bot. */
  leave(playerId: string): Result {
    const seat = this.find(playerId);
    if (this.closed || !seat || seat.kind !== 'human' || seat.left) return fail('not_in_room');
    if (this.status === 'lobby') {
      this.removeSeat(seat, 'left');
    } else {
      this.cancelSeatTimer(seat);
      this.releaseToken(seat, 'left');
      seat.left = true;
      seat.botControlled = this.status === 'playing';
      seat.disconnectedAt = this.deps.clock.now();
      if (this.hostId === seat.id) this.transferHost(false);
    }
    if (!this.reviewOccupancy()) return OK;
    this.runner?.refreshControl();
    this.broadcastRoom();
    return OK;
  }

  updatePlayer(playerId: string, patch: Partial<JoinProfile>): Result {
    const seat = this.find(playerId);
    if (this.closed || !seat || seat.kind !== 'human') return fail('not_in_room');
    if (this.status !== 'lobby') return fail('game_in_progress');
    if (patch.avatar && patch.avatar !== seat.avatar && this.avatarTaken(patch.avatar)) return fail('bad_request');
    if (patch.avatar) seat.avatar = patch.avatar;
    if (patch.name) {
      seat.name = uniqueName(
        patch.name,
        this.seats.filter((s) => s !== seat).map((s) => s.name),
      );
    }
    this.broadcastRoom();
    return OK;
  }

  // ───────────── Host actions ─────────────

  addBot(byId: string, level: BotLevel): Result<{ playerId: string }> {
    const denied = this.hostCheck(byId) ?? this.lobbyCheck();
    if (denied) return denied;
    if (this.seats.length >= MAX_PLAYERS) return fail('room_full');
    const free = this.freeAvatars();
    const avatar = free[Math.floor(this.deps.rand() * free.length) % free.length];
    const name = pickBotName(avatar, this.seats.map((s) => s.name), this.deps.rand);
    const seat = this.addSeat('bot', name, avatar);
    seat.botLevel = level;
    this.broadcastRoom();
    return { ok: true, playerId: seat.id };
  }

  /** Remove a bot or kick a human (lobby only). */
  kick(byId: string, targetId: string): Result {
    const denied = this.hostCheck(byId) ?? this.lobbyCheck();
    if (denied) return denied;
    const target = this.find(targetId);
    if (!target || target.id === byId) return fail('bad_request');
    this.removeSeat(target, 'kicked');
    if (!this.reviewOccupancy()) return OK;
    this.broadcastRoom();
    return OK;
  }

  updateSettings(byId: string, patch: Partial<RoomSettings>): Result {
    const denied = this.hostCheck(byId) ?? this.lobbyCheck();
    if (denied) return denied;
    const { turnSeconds, responseSeconds } = patch;
    if (turnSeconds !== undefined && !(TURN_SECONDS_OPTIONS as readonly number[]).includes(turnSeconds)) {
      return fail('bad_request');
    }
    if (responseSeconds !== undefined && !(RESPONSE_SECONDS_OPTIONS as readonly number[]).includes(responseSeconds)) {
      return fail('bad_request');
    }
    if (turnSeconds !== undefined) this.settings.turnSeconds = turnSeconds;
    if (responseSeconds !== undefined) this.settings.responseSeconds = responseSeconds;
    this.broadcastRoom();
    return OK;
  }

  start(byId: string): Result {
    const denied = this.hostCheck(byId) ?? this.lobbyCheck();
    if (denied) return denied;
    if (this.seats.length < MIN_PLAYERS) return fail('not_enough_players');

    const now = this.deps.clock.now();
    this.status = 'playing';
    this.gameNumber++;
    for (const seat of this.seats) {
      seat.lastSentSeq = 0;
      seat.botControlled = false;
      if (seat.kind === 'human' && !seat.conn) this.armSeatTimer(seat, now);
    }
    const state = createGame({
      players: this.seats.map((s) => ({ id: s.id, name: s.name, seat: s.seat })),
      seed: Math.floor(this.deps.rand() * 0x7fffffff),
    });
    this.runner = new GameRunner(state, {
      clock: this.deps.clock,
      rand: this.deps.rand,
      timing: this.deps.timing,
      decideBot: this.deps.decideBot,
      settings: () => this.settings,
      botLevel: (id) => this.botLevelOf(id),
      onUpdate: (events) => this.onGameUpdate(events),
      onError: (err) => this.deps.onError?.(err),
    });
    this.broadcastRoom();
    this.runner.start();
    return OK;
  }

  /** After game over: back to the lobby — departed humans are removed, bots stay. */
  backToLobby(byId: string): Result {
    const denied = this.hostCheck(byId);
    if (denied) return denied;
    if (this.status === 'playing') return fail('game_in_progress');
    if (this.status !== 'finished') return fail('bad_request');

    this.runner?.dispose();
    this.runner = null;
    this.status = 'lobby';
    const now = this.deps.clock.now();
    for (const seat of this.seats.slice()) {
      if (seat.kind !== 'human') continue;
      if (seat.left) {
        this.removeSeat(seat, 'left');
        continue;
      }
      seat.botControlled = false;
      if (!seat.conn) this.armSeatTimer(seat, now);
    }
    for (const seat of this.seats) seat.conn?.send('game:cleared');
    if (!this.reviewOccupancy()) return OK;
    this.broadcastRoom();
    return OK;
  }

  // ───────────── Game input ─────────────

  move(playerId: string, move: Move, phaseSeq: number): Result {
    const seat = this.find(playerId);
    if (this.closed || !seat || seat.kind !== 'human') return fail('not_in_room');
    if (!this.runner) return fail(this.status === 'lobby' ? 'bad_request' : 'game_over');
    const res = this.runner.submit(playerId, move, phaseSeq);
    if (res.ok && seat.botControlled) {
      // A human whose seat was bot-controlled takes it back with their first valid move.
      seat.botControlled = false;
      this.runner?.refreshControl();
      this.broadcastRoom();
    }
    return res;
  }

  emote(playerId: string, emote: EmoteId): Result {
    const seat = this.find(playerId);
    if (this.closed || !seat) return fail('not_in_room');
    const now = this.deps.clock.now();
    if (now - seat.lastEmoteAt < this.deps.timing.emoteCooldownMs) return fail('rate_limited');
    seat.lastEmoteAt = now;
    this.broadcastEmote(playerId, emote);
    return OK;
  }

  /** Close the room: every attached client gets `room:closed {reason:'room_deleted'}`. */
  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.runner?.dispose();
    this.runner = null;
    this.emptyTimer?.cancel();
    this.emptyTimer = null;
    for (const t of this.emoteTimers) t.cancel();
    this.emoteTimers.clear();
    for (const seat of this.seats) {
      this.cancelSeatTimer(seat);
      this.releaseToken(seat, 'room_deleted');
    }
    this.deps.onClosed(this);
  }

  // ───────────── Internals: seats ─────────────

  private find(id: string): Seat | undefined {
    return this.seats.find((s) => s.id === id);
  }

  private planJoin(token: string, profile: JoinProfile): JoinPlan | Failure {
    if (this.closed) return fail('room_not_found');
    const existing = this.seats.find((s) => s.token === token);
    if (existing) return { kind: 'existing', seat: existing };
    if (this.status === 'lobby') return this.seats.length >= MAX_PLAYERS ? fail('room_full') : { kind: 'new' };
    const key = nameKey(profile.name);
    const seat = this.seats.find((s) => s.kind === 'human' && (s.left || !s.conn) && nameKey(s.name) === key);
    return seat ? { kind: 'reclaim', seat } : fail('game_in_progress');
  }

  private addSeat(kind: SeatKind, name: string, avatar: AvatarId): Seat {
    const used = new Set(this.seats.map((s) => s.seat));
    let index = 0;
    while (used.has(index)) index++;
    const suffix = Math.floor(this.deps.rand() * 36 ** 4)
      .toString(36)
      .padStart(4, '0');
    const seat: Seat = {
      id: `${kind === 'bot' ? 'b' : 'p'}${++this.idCounter}${suffix}`,
      name,
      seat: index,
      kind,
      avatar,
      wins: 0,
      token: null,
      conn: null,
      botControlled: false,
      left: false,
      disconnectedAt: null,
      timer: null,
      lastEmoteAt: Number.NEGATIVE_INFINITY,
      lastSentSeq: 0,
    };
    this.seats.push(seat);
    this.seats.sort((a, b) => a.seat - b.seat);
    return seat;
  }

  private removeSeat(seat: Seat, reason: ClosedReason): void {
    this.cancelSeatTimer(seat);
    this.seats = this.seats.filter((s) => s !== seat);
    this.releaseToken(seat, reason);
    if (this.hostId === seat.id) this.transferHost(false);
  }

  /** Unbind the seat from its client and tell the client why — now if attached, else on reconnect. */
  private releaseToken(seat: Seat, reason: ClosedReason): void {
    const { token, conn } = seat;
    seat.token = null;
    seat.conn = null;
    conn?.send('room:closed', { reason });
    if (token) this.deps.onTokenReleased(token, conn ? null : reason);
  }

  private avatarTaken(avatar: AvatarId): boolean {
    return this.seats.some((s) => s.avatar === avatar);
  }

  private freeAvatars(): AvatarId[] {
    const free = AVATARS.filter((a) => !this.avatarTaken(a));
    return free.length ? free : AVATARS.slice();
  }

  private lobbyPlayer(s: Seat): LobbyPlayer {
    const p: LobbyPlayer = {
      id: s.id,
      name: s.name,
      seat: s.seat,
      kind: s.kind,
      avatar: s.avatar,
      connected: s.kind === 'bot' || s.conn !== null,
      isHost: s.id === this.hostId,
      botControlled: s.botControlled,
      left: s.left,
      wins: s.wins,
    };
    if (s.kind === 'bot') p.botLevel = s.botLevel;
    return p;
  }

  /** Host → next connected human (lowest seat), else (unless `connectedOnly`) any remaining human. */
  private transferHost(connectedOnly: boolean): void {
    const humans = this.seats.filter((s) => s.kind === 'human' && !s.left && s.id !== this.hostId);
    const next = humans.find((s) => s.conn) ?? (connectedOnly ? undefined : humans[0]);
    if (next) this.hostId = next.id;
  }

  private hostCheck(byId: string): Failure | null {
    if (this.closed || !this.find(byId)) return fail('not_in_room');
    return byId === this.hostId ? null : fail('not_host');
  }

  private lobbyCheck(): Failure | null {
    return this.status === 'lobby' ? null : fail('game_in_progress');
  }

  // ───────────── Internals: disconnect timers & room lifetime ─────────────

  private cancelSeatTimer(seat: Seat): void {
    seat.timer?.cancel();
    seat.timer = null;
  }

  /** Lobby: remove after LOBBY_DISCONNECT_REMOVE_MS. Playing: bot takeover after RECONNECT_GRACE_MS. */
  private armSeatTimer(seat: Seat, now = this.deps.clock.now()): void {
    this.cancelSeatTimer(seat);
    const since = seat.disconnectedAt ?? now;
    const { timing, clock } = this.deps;
    if (this.status === 'lobby') {
      const wait = since + timing.lobbyDisconnectRemoveMs - now;
      seat.timer = clock.setTimeout(() => this.removeDisconnected(seat), wait);
    } else if (this.status === 'playing' && !seat.left && !seat.botControlled) {
      const wait = since + timing.reconnectGraceMs - now;
      if (wait <= 0) seat.botControlled = true;
      else seat.timer = clock.setTimeout(() => this.takeOver(seat), wait);
    }
  }

  private removeDisconnected(seat: Seat): void {
    seat.timer = null;
    if (this.closed || seat.conn || this.status !== 'lobby' || !this.seats.includes(seat)) return;
    this.removeSeat(seat, 'left');
    if (!this.reviewOccupancy()) return;
    this.broadcastRoom();
  }

  private takeOver(seat: Seat): void {
    seat.timer = null;
    if (this.closed || seat.conn || this.status !== 'playing') return;
    seat.botControlled = true;
    // Don't let an absent host block the table: hand it to someone who is actually here.
    if (this.hostId === seat.id) this.transferHost(true);
    this.runner?.refreshControl();
    this.broadcastRoom();
  }

  /**
   * No human seat left → close now. No connected human → close after EMPTY_ROOM_DELETE_MS.
   * Returns false when the room is (now) closed.
   */
  private reviewOccupancy(): boolean {
    if (this.closed) return false;
    const humans = this.seats.filter((s) => s.kind === 'human' && !s.left);
    if (humans.length === 0) {
      this.close();
      return false;
    }
    if (humans.some((s) => s.conn)) {
      this.emptyTimer?.cancel();
      this.emptyTimer = null;
    } else if (!this.emptyTimer) {
      this.emptyTimer = this.deps.clock.setTimeout(() => {
        this.emptyTimer = null;
        this.close();
      }, this.deps.timing.emptyRoomDeleteMs);
    }
    return true;
  }

  // ───────────── Internals: game glue & broadcasting ─────────────

  private botLevelOf(playerId: string): BotLevel | null {
    const seat = this.find(playerId);
    if (!seat) return TAKEOVER_BOT_LEVEL;
    if (seat.kind === 'bot') return seat.botLevel ?? TAKEOVER_BOT_LEVEL;
    return seat.botControlled ? TAKEOVER_BOT_LEVEL : null;
  }

  private onGameUpdate(events: LoggedEvent[]): void {
    const runner = this.runner;
    if (!runner || this.closed) return;
    this.pushGameState(runner);
    this.reactWithEmotes(events);
    if (runner.isOver && this.status === 'playing') {
      this.status = 'finished';
      const winnerId = runner.state.winnerId;
      const winner = winnerId ? this.find(winnerId) : undefined;
      if (winner) winner.wins++;
      for (const seat of this.seats) this.cancelSeatTimer(seat);
      if (!this.find(this.hostId)?.conn) this.transferHost(true);
      this.broadcastRoom();
    }
  }

  private pushGameState(runner: GameRunner): void {
    const log = runner.state.log;
    const latest = lastSeq(log);
    for (const seat of this.seats) {
      if (seat.kind !== 'human' || !seat.conn) continue;
      const events = eventsAfter(log, seat.lastSentSeq);
      seat.lastSentSeq = latest;
      seat.conn.send('game:state', { view: runner.view(seat.id, { logLimit: CLIENT_LOG_LIMIT }), events, resync: false });
    }
  }

  private resync(seat: Seat): void {
    const runner = this.runner;
    if (!runner || !seat.conn) return;
    seat.lastSentSeq = lastSeq(runner.state.log);
    seat.conn.send('game:state', {
      view: runner.view(seat.id, { logLimit: CLIENT_LOG_LIMIT }),
      events: [],
      resync: true,
    });
  }

  private broadcastRoom(): void {
    if (this.closed) return;
    for (const seat of this.seats) seat.conn?.send('room:state', this.view(seat.id));
  }

  private broadcastEmote(playerId: string, emote: EmoteId): void {
    for (const seat of this.seats) seat.conn?.send('game:emote', { playerId, emote });
  }

  /** Occasional bot emotes reacting to what just happened (per-bot gap, short random delay). */
  private reactWithEmotes(events: LoggedEvent[]): void {
    if (!events.length) return;
    const { clock, timing, rand } = this.deps;
    const intents = botEmoteReactions(events, (id) => this.find(id)?.kind === 'bot', rand);
    for (const { playerId, emote } of intents) {
      const seat = this.find(playerId);
      const now = clock.now();
      if (!seat || now - seat.lastEmoteAt < timing.botEmoteGapMs) continue;
      seat.lastEmoteAt = now;
      const [lo, hi] = timing.botEmoteDelayMs;
      const timer: Timer = clock.setTimeout(
        () => {
          this.emoteTimers.delete(timer);
          if (!this.closed) this.broadcastEmote(playerId, emote);
        },
        lo + rand() * Math.max(0, hi - lo),
      );
      this.emoteTimers.add(timer);
    }
  }
}
