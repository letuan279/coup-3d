/**
 * Registry of rooms + identity: which connection currently speaks for a token, and which room
 * a token is seated in. Transport-agnostic — server/sockets.ts adapts Socket.IO onto it.
 */
import { randomInt } from 'node:crypto';
import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH } from '@shared/constants';
import type { BotLevel, EmoteId, Move, RoomSettings } from '@shared/types';
import { systemClock, type Clock } from '../clock';
import { DEFAULT_TIMING, type ServerTiming } from '../timing';
import { fail, type Connection, type Result } from '../transport';
import type { DecideBot } from './botDriver';
import { Room, type ClosedReason, type JoinProfile, type JoinRequest } from './Room';

/** How long (and how many) "your seat is gone" notices are kept for offline clients. */
const NOTICE_TTL_MS = 6 * 60 * 60_000;
const NOTICE_MAX = 10_000;

export interface RoomManagerOptions {
  clock?: Clock;
  rand?: () => number;
  timing?: ServerTiming;
  decideBot?: DecideBot;
  onError?(err: unknown): void;
}

export class RoomManager {
  private readonly rooms = new Map<string, Room>();
  /** token → room the token is seated in. */
  private readonly tokenRooms = new Map<string, Room>();
  /** token → the connection currently speaking for it. */
  private readonly conns = new Map<string, Connection>();
  /** token → why its seat went away while its client was offline (told on reconnect). */
  private readonly notices = new Map<string, { reason: ClosedReason; at: number }>();
  private readonly clock: Clock;
  private readonly rand: () => number;
  private readonly timing: ServerTiming;

  constructor(private readonly opts: RoomManagerOptions = {}) {
    this.clock = opts.clock ?? systemClock;
    this.rand = opts.rand ?? Math.random;
    this.timing = opts.timing ?? DEFAULT_TIMING;
  }

  get roomCount(): number {
    return this.rooms.size;
  }

  getRoom(code: string): Room | undefined {
    return this.rooms.get(code.toUpperCase());
  }

  /** Room + player id the token is seated as, if any. */
  seatOf(token: string): { room: Room; playerId: string } | null {
    const room = this.tokenRooms.get(token);
    const playerId = room?.playerIdForToken(token);
    return room && playerId ? { room, playerId } : null;
  }

  // ───────────── Connections ─────────────

  /**
   * A socket authenticated with `token`: replaces any older socket and resumes its seat.
   * `claimedRoom` is the room the client thinks it is in; if we have no seat for it, tell it
   * the room is gone (server restart / expired room).
   */
  connect(token: string, conn: Connection, claimedRoom?: string): void {
    const old = this.conns.get(token);
    this.conns.set(token, conn);
    if (old && old !== conn) {
      old.send('room:closed', { reason: 'replaced' });
      old.close();
    }
    const seat = this.seatOf(token);
    if (seat) {
      seat.room.attach(seat.playerId, conn);
      return;
    }
    const notice = this.notices.get(token);
    if (notice) {
      this.notices.delete(token);
      conn.send('room:closed', { reason: notice.reason });
    } else if (claimedRoom) {
      conn.send('room:closed', { reason: 'room_deleted' });
    }
  }

  disconnect(token: string, conn: Connection): void {
    if (this.conns.get(token) !== conn) return;
    this.conns.delete(token);
    const seat = this.seatOf(token);
    if (seat) seat.room.detach(seat.playerId, conn);
  }

  // ───────────── Lobby ─────────────

  createRoom(token: string, profile: JoinProfile): Result<{ code: string }> {
    const conn = this.conns.get(token);
    if (!conn) return fail('bad_request');
    this.leaveCurrent(token);
    const room = new Room(this.newCode(), {
      clock: this.clock,
      rand: this.rand,
      timing: this.timing,
      decideBot: this.opts.decideBot,
      onTokenReleased: (t, pendingNotice) => {
        if (this.tokenRooms.get(t) !== room) return;
        this.tokenRooms.delete(t);
        if (pendingNotice) this.remember(t, pendingNotice);
      },
      onClosed: (r) => this.forget(r),
      onError: this.opts.onError,
    });
    this.rooms.set(room.code, room);
    const res = room.join(token, conn, profile);
    if (!res.ok) {
      room.close();
      return res;
    }
    this.tokenRooms.set(token, room);
    this.notices.delete(token);
    return { ok: true, code: room.code };
  }

  /**
   * Join by code. While a game is running/finished this only reclaims the seat whose
   * `req.rejoinKey` matches (see Room.join); the seat's previous token is released.
   */
  joinRoom(token: string, code: string | null, req: JoinRequest): Result<{ code: string }> {
    const conn = this.conns.get(token);
    if (!conn) return fail('bad_request');
    const room = code ? this.rooms.get(code) : undefined;
    if (!room || room.isClosed) return fail('room_not_found');
    const denied = room.checkJoin(token, req);
    if (denied) return denied;
    if (this.tokenRooms.get(token) !== room) this.leaveCurrent(token);
    const res = room.join(token, conn, req);
    if (!res.ok) return res;
    this.tokenRooms.set(token, room);
    this.notices.delete(token);
    return { ok: true, code: room.code };
  }

  leaveRoom(token: string): Result {
    return this.withSeat(token, (room, id) => room.leave(id));
  }

  updatePlayer(token: string, patch: Partial<JoinProfile>): Result {
    return this.withSeat(token, (room, id) => room.updatePlayer(id, patch));
  }

  addBot(token: string, level: BotLevel): Result {
    return this.withSeat(token, (room, id) => room.addBot(id, level));
  }

  kick(token: string, playerId: string): Result {
    return this.withSeat(token, (room, id) => room.kick(id, playerId));
  }

  updateSettings(token: string, patch: Partial<RoomSettings>): Result {
    return this.withSeat(token, (room, id) => room.updateSettings(id, patch));
  }

  start(token: string): Result {
    return this.withSeat(token, (room, id) => room.start(id));
  }

  backToLobby(token: string): Result {
    return this.withSeat(token, (room, id) => room.backToLobby(id));
  }

  // ───────────── Game ─────────────

  move(token: string, move: Move, phaseSeq: number): Result {
    return this.withSeat(token, (room, id) => room.move(id, move, phaseSeq));
  }

  emote(token: string, emote: EmoteId): Result {
    return this.withSeat(token, (room, id) => room.emote(id, emote));
  }

  /** Close every room (server shutdown). */
  closeAll(): void {
    for (const room of [...this.rooms.values()]) room.close();
  }

  // ───────────── Internals ─────────────

  private withSeat(token: string, fn: (room: Room, playerId: string) => Result): Result {
    const seat = this.seatOf(token);
    return seat ? fn(seat.room, seat.playerId) : fail('not_in_room');
  }

  /** Silently leave the room the token is in (before creating/joining another one). */
  private leaveCurrent(token: string): void {
    const seat = this.seatOf(token);
    if (seat) seat.room.leave(seat.playerId);
    this.tokenRooms.delete(token);
  }

  private remember(token: string, reason: ClosedReason): void {
    const now = this.clock.now();
    this.notices.delete(token);
    this.notices.set(token, { reason, at: now });
    // Map iteration is insertion-ordered: the oldest notices come first.
    for (const [t, n] of this.notices) {
      if (this.notices.size <= NOTICE_MAX && now - n.at <= NOTICE_TTL_MS) break;
      this.notices.delete(t);
    }
  }

  private forget(room: Room): void {
    if (this.rooms.get(room.code) === room) this.rooms.delete(room.code);
    for (const [token, r] of this.tokenRooms) if (r === room) this.tokenRooms.delete(token);
  }

  /** Unguessable (crypto) room code — the code is the only thing needed to join. */
  private newCode(): string {
    for (;;) {
      let code = '';
      for (let i = 0; i < ROOM_CODE_LENGTH; i++) code += ROOM_CODE_ALPHABET[randomInt(ROOM_CODE_ALPHABET.length)];
      if (!this.rooms.has(code)) return code;
    }
  }
}
