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
  | 'rate_limited';

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
   * Join by code. If a game is running, joining is only allowed to reclaim a disconnected/left
   * human seat with the same name (case-insensitive); otherwise `game_in_progress`.
   */
  'room:join': (p: { code: string; name: string; avatar?: AvatarId }, ack: Ack<{ code: string }>) => void;
  /** Leave the room. Mid-game, the seat becomes permanently bot-controlled for the rest of the game. */
  'room:leave': (ack?: Ack) => void;
  /** Lobby only. */
  'player:update': (p: { name?: string; avatar?: AvatarId }, ack?: Ack) => void;
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
  /** `phaseSeq` must match the current GameView.phaseSeq, else `stale_phase`. */
  'game:move': (p: { move: Move; phaseSeq: number }, ack?: Ack) => void;
  'game:emote': (p: { emote: EmoteId }) => void;
}

export interface ServerToClientEvents {
  'room:state': (room: RoomView) => void;
  /** Sent when the client is no longer in a room (kicked, left, room closed). */
  'room:closed': (p: { reason: 'kicked' | 'left' | 'room_deleted' | 'replaced' }) => void;
  /**
   * Personalised game view. `events` = log entries created since the previous push to this
   * client (for animations); empty on a full resync (e.g. after reconnect).
   */
  'game:state': (p: { view: GameView; events: LoggedEvent[]; resync: boolean }) => void;
  /** Game is no longer running (back to lobby). */
  'game:cleared': () => void;
  'game:emote': (p: { playerId: string; emote: EmoteId }) => void;
}
