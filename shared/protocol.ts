/**
 * Socket.IO event contract between client and server.
 *
 * Connection: the client connects with `io({ auth: { token } })` where `token` is a random
 * secret persisted in localStorage. The server maps token → (room, player) so a reconnecting
 * socket automatically resumes its seat and receives `room:state` (+ `game:state` if playing).
 */
import type {
  AvatarId,
  BotLevel,
  EmoteId,
  GameView,
  LoggedEvent,
  Move,
  MoveError,
  RoomSettings,
  RoomView,
} from './types';

export type Ack<T = {}> = (res: ({ ok: true } & T) | { ok: false; error: ServerErrorCode | MoveError }) => void;

export type ServerErrorCode =
  | 'bad_request'
  | 'room_not_found'
  | 'room_full'
  | 'game_in_progress'
  | 'not_host'
  | 'not_in_room'
  | 'not_enough_players'
  | 'name_taken'
  | 'rate_limited'
  /** room:join with a rejoinKey that matches no human seat of that room. */
  | 'bad_rejoin_key'
  /** player:update {seat} naming a seat someone else already sits in. */
  | 'seat_taken';

export interface HandshakeAuth {
  token: string;
  /**
   * Room code the client believes it is in (if any). When the server has no seat for the token
   * (e.g. it restarted and lost its in-memory rooms) it answers `room:closed {reason:'room_deleted'}`
   * so the client does not keep showing a dead room.
   */
  room?: string;
}

export interface ClientToServerEvents {
  'room:create': (p: { name: string; avatar?: AvatarId }, ack: Ack<{ code: string }>) => void;
  /**
   * Join by code. A valid `rejoinKey` (from RoomView.rejoinKey — proof of ownership) reclaims
   * your own human seat in any room state, lobby included: the seat is taken over by this socket
   * (any other socket holding it gets room:closed 'replaced'), a seat that had been left becomes
   * human-controlled again, and `name`/`avatar` are ignored. While a game is running (or finished,
   * before the host returns to the lobby) that is the only way in: no key → `game_in_progress`,
   * wrong key → `bad_rejoin_key`. In the lobby a key that matches no seat falls back to a normal
   * join when a `name` is given, else `bad_rejoin_key`. If the socket is seated in another room,
   * it leaves that room only once this join has been accepted (a refused join keeps it there).
   */
  'room:join': (
    p: { code: string; name: string; avatar?: AvatarId; rejoinKey?: string },
    ack: Ack<{ code: string }>,
  ) => void;
  /** Leave the room. Mid-game, the seat becomes permanently bot-controlled for the rest of the game. */
  'room:leave': (ack?: Ack) => void;
  /**
   * Lobby only. `seat` (0..MAX_PLAYERS-1) moves you to that empty seat — it sets your place in
   * the turn order; an occupied seat → `seat_taken`.
   */
  'player:update': (p: { name?: string; avatar?: AvatarId; seat?: number }, ack?: Ack) => void;
  /** Host only, lobby only. */
  'room:addBot': (p: { level: BotLevel }, ack?: Ack) => void;
  /** Host only, lobby only. Removes a bot or kicks a human. */
  'room:kick': (p: { playerId: string }, ack?: Ack) => void;
  /** Host only, lobby only. */
  'room:settings': (p: Partial<RoomSettings>, ack?: Ack) => void;
  /** Host only, lobby only, 2–6 seated players. */
  'room:start': (ack?: Ack) => void;
  /** Host only, after game over: return everyone to the lobby (bots stay, departed humans are removed). */
  'room:backToLobby': (ack?: Ack) => void;
  /**
   * Host only, while a game is running (or finished): abandon the game and return everyone to
   * the lobby (no win counted; departed humans removed, bots kept). Others get
   * `game:cleared {reason:'reset'}`. In the lobby → `bad_request`.
   */
  'room:reset': (ack?: Ack) => void;
  /** `phaseSeq` must match the current GameView.phaseSeq, else `stale_phase`. */
  'game:move': (p: { move: Move; phaseSeq: number }, ack?: Ack) => void;
  'game:emote': (p: { emote: EmoteId }) => void;
}

export interface ServerToClientEvents {
  'room:state': (room: RoomView) => void;
  /** Sent when the client is no longer in a room (kicked, left, room closed). */
  /**
   * - kicked: removed by the host · left: you left (no toast) · room_deleted: room gone (also
   *   sent on connect when the claimed room is unknown, e.g. after a server restart) ·
   *   replaced: another socket took this session/seat · expired: removed from the lobby after
   *   being disconnected longer than LOBBY_DISCONNECT_REMOVE_MS.
   */
  'room:closed': (p: { reason: 'kicked' | 'left' | 'room_deleted' | 'replaced' | 'expired' }) => void;
  /**
   * Personalised game view. `events` = log entries created since the previous push to this
   * client (for animations); empty on a full resync (e.g. after reconnect).
   */
  'game:state': (p: { view: GameView; events: LoggedEvent[]; resync: boolean }) => void;
  /** Game is no longer running (back to lobby). `reason: 'reset'` = the host abandoned a game (room:reset). */
  'game:cleared': (p?: { reason: 'reset' }) => void;
  'game:emote': (p: { playerId: string; emote: EmoteId }) => void;
}
