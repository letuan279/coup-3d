/**
 * Socket.IO client + promise API. CONTRACT FILE — UI calls `api.*`, never the socket directly.
 */
import { io, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '@shared/protocol';
import type { AvatarId, BotLevel, EmoteId, Move, RoomSettings, RoomView } from '@shared/types';
import { translate } from '../i18n';
import { useGame, type Profile } from '../store/useGame';
import { errorKey } from '../ui/errors';
import { emit } from './bus';
import { hrefWithRoom, parseRoomLink, sanitizeCode } from './links';

type ClientSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

const LS_TOKEN = 'coup3d.token';

/**
 * How long an api call waits for its ack. Calls use `socket.timeout()`, so after this delay the
 * emit is also dropped from the send buffer: a timed-out click can never fire later on reconnect.
 */
export const API_TIMEOUT_MS = 8000;

/**
 * After the first connect, how long to wait for the server to re-attach us to a seat (it pushes
 * `room:state` right away) before offering to use a rejoin link from the URL.
 */
export const ATTACH_SETTLE_MS = 500;

// ───────────── Session token ─────────────

let memToken: string | null = null;

function randomToken(): string {
  try {
    if (typeof crypto !== 'undefined') {
      if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
      // crypto.randomUUID needs a secure context (https / localhost); LAN http has getRandomValues.
      const bytes = crypto.getRandomValues(new Uint8Array(16));
      return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    }
  } catch {
    /* fall through */
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
}

/**
 * The session secret sent on every (re)connect. Read from localStorage once, then kept in memory,
 * so it stays the same across reconnects even when storage is blocked (the seat can be resumed).
 */
export function getToken(): string {
  if (memToken) return memToken;
  let t: string | null = null;
  try {
    t = localStorage.getItem(LS_TOKEN);
  } catch {
    /* storage blocked */
  }
  if (!t) {
    t = randomToken();
    try {
      localStorage.setItem(LS_TOKEN, t);
    } catch {
      /* memory only for this page */
    }
  }
  memToken = t;
  return t;
}

// ───────────── Connection ─────────────

let socket: ClientSocket | null = null;
let settleTimer: ReturnType<typeof setTimeout> | null = null;
let firstConnectSeen = false;

export function connectSocket(): ClientSocket {
  if (socket) return socket;

  // Capture the invite / rejoin link BEFORE connecting: the server may re-attach this token to
  // another room, whose room:state would otherwise overwrite the invited code in the URL.
  const link = parseRoomLink(currentHref());
  if (link) useGame.setState({ invite: link });

  const s: ClientSocket = io({
    // A function so every (re)connect sends the room we currently believe we are in.
    auth: (cb) => cb({ token: getToken(), room: useGame.getState().room?.code }),
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionDelay: 500,
    reconnectionDelayMax: 3000,
  });
  socket = s;

  s.on('connect', () => {
    useGame.setState({ conn: 'connected' });
    if (firstConnectSeen) return;
    firstConnectSeen = true;
    const { invite, room } = useGame.getState();
    if (invite?.key && !room) {
      settleTimer = setTimeout(() => {
        settleTimer = null;
        const now = useGame.getState();
        // Ask first (RejoinPrompt) — never take the seat from the device playing it by ourselves.
        if (now.invite?.key && !now.room) setRejoinAsked(true);
      }, ATTACH_SETTLE_MS);
    }
  });

  s.on('disconnect', (reason) => {
    if (reason === 'io server disconnect') {
      // The server closed this socket on purpose (the session was opened in another tab). Socket.IO
      // never reconnects after that: show the "play in this tab" panel instead of a banner that
      // would say "reconnecting…" forever. The panel replaces the 'toast.replaced' toast.
      useGame.setState((st) => ({
        conn: 'replaced',
        ui: { ...st.ui, toasts: st.ui.toasts.filter((x) => x.text !== 'toast.replaced') },
      }));
    } else {
      useGame.setState({ conn: 'reconnecting' });
    }
  });
  s.io.on('reconnect_attempt', () => useGame.setState({ conn: 'reconnecting' }));

  s.on('room:state', onRoomState);
  s.on('room:closed', onRoomClosed);

  s.on('game:state', ({ view, events, resync }) => {
    const clockOffset = view.serverNow ? view.serverNow - Date.now() : useGame.getState().clockOffset;
    useGame.setState((st) => {
      // Keep target selection only while we are still choosing an action in the SAME phase. A
      // resync or a new phaseSeq (e.g. reconnecting on a later turn) starts from a clean slate.
      const keep =
        !resync && view.prompt?.kind === 'choose_action' && st.game !== null && st.game.phaseSeq === view.phaseSeq;
      return {
        game: view,
        clockOffset,
        ui: keep || st.ui.targeting === null ? st.ui : { ...st.ui, targeting: null },
      };
    });
    if (!resync && events.length) emit('events', events);
  });

  s.on('game:cleared', (p) => {
    const st = useGame.getState();
    // The host abandoned the game (room:reset): tell everyone else why the table emptied.
    if (p?.reason === 'reset' && st.game && st.room && st.room.hostId !== st.room.youId) st.toast('toast.gameReset', 'info');
    useGame.setState((s2) => ({ game: null, ui: { ...s2.ui, targeting: null } }));
  });

  s.on('game:emote', (p) => emit('emote', p));

  return s;
}

function onRoomState(room: RoomView): void {
  cancelSettle(); // we are seated: a rejoin link must not pull us out of this room
  setRejoinAsked(false);
  const { invite } = useGame.getState();
  const consumed = invite !== null && invite.code === room.code;
  useGame.setState((st) => ({
    room,
    ...(consumed ? { invite: null } : {}),
    // Back in the lobby (possibly while we were offline and missed game:cleared): drop the old game.
    ...(room.status === 'lobby' && (st.game !== null || st.ui.targeting !== null)
      ? { game: null, ui: { ...st.ui, targeting: null } }
      : {}),
  }));
  // With a pending invite to ANOTHER room, leave the invited code in the URL until the player decides.
  if (!invite || consumed) writeUrlRoom(room.code);
}

function onRoomClosed({ reason }: { reason: 'kicked' | 'left' | 'room_deleted' | 'replaced' | 'expired' }): void {
  const st = useGame.getState();
  let invite = st.invite;
  // Removed for being offline too long: keep the code pre-filled on Home so they can join again.
  if (!invite && reason === 'expired' && st.room) invite = { code: st.room.code };
  writeUrlRoom(invite?.code ?? null);
  useGame.setState((s) => ({ room: null, game: null, invite, ui: { ...s.ui, targeting: null } }));
  const toast = useGame.getState().toast;
  if (reason === 'kicked') toast('toast.kicked', 'error');
  if (reason === 'replaced') toast('toast.replaced', 'error');
  if (reason === 'room_deleted') toast('toast.roomDeleted', 'error');
  if (reason === 'expired') toast('toast.expired', 'error');
}

function cancelSettle() {
  if (settleTimer) clearTimeout(settleTimer);
  settleTimer = null;
}

/**
 * "Play in this tab" after this tab was replaced: reconnect explicitly (this takes the session back
 * from the other tab). Anything left in the send buffer is dropped first so no stale click replays.
 */
export function reconnectHere(): void {
  const s = socket;
  if (!s || s.connected) return;
  s.sendBuffer = [];
  useGame.setState({ conn: 'connecting' });
  s.connect();
}

// ───────────── Room links (invite / rejoin) ─────────────

function currentHref(): string {
  try {
    return window.location.href;
  } catch {
    return '';
  }
}

function writeUrlRoom(code: string | null): void {
  try {
    const next = hrefWithRoom(window.location.href, code);
    if (next !== window.location.href) window.history.replaceState(null, '', next);
  } catch {
    /* ignore */
  }
}

/** Room code from `?room=XXXXX` (for share links). */
export function roomCodeFromUrl(): string | null {
  return parseRoomLink(currentHref())?.code ?? null;
}

function joinName(profile: Profile, fallback?: string): string {
  return profile.name.trim() || fallback || translate(useGame.getState().ui.lang, `avatar.${profile.avatar}`);
}

// ───────────── Rejoin link confirmation ─────────────

/**
 * The page was opened with `/?room=CODE&key=KEY`, and once the server had its chance to re-attach
 * us we were still not seated: the HUD asks "play your seat on this device?" (RejoinPrompt)
 * instead of reclaiming by itself, so a stray visit to the link (a preview browser, an old
 * bookmark on another device) cannot silently take the seat from the device playing it.
 */
let rejoinAsked = false;
const rejoinListeners = new Set<() => void>();

function setRejoinAsked(v: boolean): void {
  if (rejoinAsked === v) return;
  rejoinAsked = v;
  for (const fn of [...rejoinListeners]) fn();
}

/** Whether the rejoin-link question is up (a `useSyncExternalStore` snapshot, with `onRejoinAsked`). */
export function isRejoinAsked(): boolean {
  return rejoinAsked;
}

/** Subscribe to `isRejoinAsked()` changes; returns the unsubscribe function. */
export function onRejoinAsked(fn: () => void): () => void {
  rejoinListeners.add(fn);
  return () => {
    rejoinListeners.delete(fn);
  };
}

/**
 * [Vào lại] on the rejoin-link question: reclaim the seat of `/?room=CODE&key=KEY`. On failure,
 * explain and fall back to the normal Home (the dead link is removed from the URL).
 */
export async function confirmRejoin(): Promise<void> {
  const { invite, room, profile } = useGame.getState();
  if (!invite?.key || invite.joining || room) return;
  useGame.setState({ invite: { ...invite, joining: true } });
  // Only a name the player typed: a key that no longer matches a lobby seat then joins under it,
  // never under a made-up avatar name (without one the server answers bad_rejoin_key).
  const res = await api.joinRoom(invite.code, profile.name.trim(), profile.avatar, invite.key);
  setRejoinAsked(false);
  if (res.ok) {
    // room:state normally consumed the invite already; make sure the key does not linger.
    const now = useGame.getState().invite;
    if (now?.code === invite.code) useGame.setState({ invite: null });
    writeUrlRoom(useGame.getState().room?.code ?? invite.code);
    return;
  }
  if (useGame.getState().invite?.code === invite.code) useGame.setState({ invite: null });
  if (!useGame.getState().room) writeUrlRoom(null);
  useGame.getState().toast(errorKey(res.error), 'error');
}

/**
 * [Để sau]: close the question. The code stays pre-filled on Home, and an explicit "Join" there
 * still uses the key (see `inviteKeyFor`); the secret leaves the address bar.
 */
export function declineRejoin(): void {
  const { invite, room } = useGame.getState();
  if (invite?.joining) return; // already answered with [Vào lại]
  setRejoinAsked(false);
  if (invite && !room) writeUrlRoom(invite.code);
}

/** Home: the player chose to create/join something themselves — forget the link. */
export function clearInvite(): void {
  setRejoinAsked(false);
  if (useGame.getState().invite) useGame.setState({ invite: null });
}

/** Rejoin key from the link the page was opened with, if it is for `code`. */
export function inviteKeyFor(code: string): string | undefined {
  const inv = useGame.getState().invite;
  return inv && inv.code === sanitizeCode(code) ? inv.key : undefined;
}

/** "Stay in OLD": drop the pending invite and show the current room in the URL again. */
export function dismissInvite(): void {
  setRejoinAsked(false);
  useGame.setState({ invite: null });
  writeUrlRoom(useGame.getState().room?.code ?? null);
}

/** Join errors that clicking again will not fix: the invite prompt stops offering the link. */
const DEAD_INVITE_ERRORS = new Set(['room_not_found', 'game_in_progress', 'room_full']);

/**
 * "Leave OLD and join NEW" as ONE `room:join`: the server checks NEW first and leaves OLD only
 * once NEW has accepted us (room:closed 'left' for OLD, then room:state for NEW, which consumes
 * the invite). Never leave first: a join that then fails (NEW started, full, gone, bad key) would
 * throw the OLD seat away. On failure we are still seated in OLD; the caller shows the error.
 */
export async function acceptInvite(): Promise<ApiResult<{ code: string }>> {
  const { invite, room, profile } = useGame.getState();
  if (!invite) return { ok: false, error: 'bad_request' };
  const oldName = room?.players.find((p) => p.id === room.youId)?.name;
  const res = await api.joinRoom(invite.code, joinName(profile, oldName), profile.avatar, invite.key);
  if (res.ok || useGame.getState().invite?.code !== invite.code) return res;
  // A rejected key is never offered again.
  const keep = res.error === 'bad_rejoin_key' || !invite.key ? { code: invite.code } : { code: invite.code, key: invite.key };
  if (!useGame.getState().room) {
    // OLD went away meanwhile: stay on Home with the invited code pre-filled.
    useGame.setState({ invite: keep });
    writeUrlRoom(invite.code);
  } else if (DEAD_INVITE_ERRORS.has(res.error)) {
    dismissInvite(); // still in OLD: stop offering a link that cannot work
  } else if (res.error === 'bad_rejoin_key') {
    useGame.setState({ invite: keep }); // the prompt now offers a plain join
  }
  // Anything else (timeout, disconnected, rate_limited…): the prompt stays so the player can retry.
  return res;
}

// ───────────── API ─────────────

export type ApiResult<T = {}> = ({ ok: true } & T) | { ok: false; error: string };

/**
 * Dev-only: when set (see client/src/dev/mock.ts), API calls are routed here instead of the
 * socket so screens can be previewed with fixture data and no server.
 */
let mockHandler: ((name: string, payload: unknown) => ApiResult<any>) | null = null;
export function setMockHandler(fn: typeof mockHandler) {
  mockHandler = fn;
}

/** Error-first ack used with `socket.timeout()`. */
type TimedAck<T> = (err: Error | null, res?: ApiResult<T>) => void;

/**
 * Client-side failures:
 * - not_connected: the socket is dead (replaced by another tab) — nothing was sent or buffered.
 * - timeout: no ack within API_TIMEOUT_MS (the emit was dropped from the buffer).
 * - disconnected: the connection dropped after sending; the server may or may not have applied it.
 */
function call<T = {}>(send: (s: ClientSocket, ack: TimedAck<T>) => void, mock?: [string, unknown]): Promise<ApiResult<T>> {
  if (mockHandler) return Promise.resolve(mockHandler(mock?.[0] ?? 'unknown', mock?.[1]) as ApiResult<T>);
  const s = connectSocket();
  // A server-closed socket never reconnects by itself: fail now instead of buffering an emit that
  // a later manual reconnect would replay (e.g. a room:create that pulls the other tab out of its room).
  if (!s.connected && !s.active) return Promise.resolve({ ok: false, error: 'not_connected' });
  return new Promise((resolve) => {
    send(s.timeout(API_TIMEOUT_MS) as unknown as ClientSocket, (err, res) => {
      if (err) resolve({ ok: false, error: /timed out/i.test(err.message) ? 'timeout' : 'disconnected' });
      else resolve(res ?? { ok: false, error: 'unknown' });
    });
  });
}

/**
 * Whether a failed move deserves the "rejected" toast + shake. Not when the connection dropped
 * (the banner already says so) or when it timed out but the game has moved on since (a resync).
 */
export function shouldReportMoveError(error: string, sentPhaseSeq: number, currentPhaseSeq: number | null): boolean {
  if (error === 'disconnected' || error === 'not_connected') return false;
  if (error === 'timeout' && currentPhaseSeq !== sentPhaseSeq) return false;
  return true;
}

export const api = {
  createRoom: (name: string, avatar?: AvatarId) =>
    call<{ code: string }>((s, ack) => s.emit('room:create', { name, avatar }, ack as never), ['room:create', { name, avatar }]),
  /**
   * `rejoinKey` (from a rejoin link) reclaims your own seat, lobby included; with it `name` may be
   * '' (a reclaim ignores the profile). If you are seated elsewhere, the server leaves that room
   * only once this join is accepted. A keyed join refused as `bad_request` (a key the server
   * cannot even parse) is reported as `bad_rejoin_key`, which the player can act on.
   */
  joinRoom: async (code: string, name: string, avatar?: AvatarId, rejoinKey?: string): Promise<ApiResult<{ code: string }>> => {
    const payload = { code: code.toUpperCase().trim(), name, avatar, ...(rejoinKey ? { rejoinKey } : {}) };
    const res = await call<{ code: string }>((s, ack) => s.emit('room:join', payload, ack as never), ['room:join', payload]);
    return !res.ok && rejoinKey && res.error === 'bad_request' ? { ok: false, error: 'bad_rejoin_key' } : res;
  },
  leaveRoom: () => call((s, ack) => s.emit('room:leave', ack as never), ['room:leave', null]),
  /** Lobby: change your name / avatar, or move to an empty `seat` (your place in the turn order). */
  updatePlayer: (p: { name?: string; avatar?: AvatarId; seat?: number }) => call((s, ack) => s.emit('player:update', p, ack as never), ['player:update', p]),
  addBot: (level: BotLevel) => call((s, ack) => s.emit('room:addBot', { level }, ack as never), ['room:addBot', { level }]),
  kick: (playerId: string) => call((s, ack) => s.emit('room:kick', { playerId }, ack as never), ['room:kick', { playerId }]),
  updateSettings: (p: Partial<RoomSettings>) => call((s, ack) => s.emit('room:settings', p, ack as never), ['room:settings', p]),
  start: () => call((s, ack) => s.emit('room:start', ack as never), ['room:start', null]),
  backToLobby: () => call((s, ack) => s.emit('room:backToLobby', ack as never), ['room:backToLobby', null]),
  /** Host only, mid-game: abandon the game and return everyone to the lobby. */
  resetGame: () => call((s, ack) => s.emit('room:reset', ack as never), ['room:reset', null]),
  /** Sends a move for the current phase. Rejections are also broadcast on the bus as 'moveRejected'. */
  async move(move: Move): Promise<ApiResult> {
    const g = useGame.getState().game;
    if (!g) return { ok: false, error: 'no_game' };
    const phaseSeq = g.phaseSeq;
    const res = await call(
      (s, ack) => s.emit('game:move', { move, phaseSeq }, ack as never),
      ['game:move', { move, phaseSeq }],
    );
    if (!res.ok && shouldReportMoveError(res.error, phaseSeq, useGame.getState().game?.phaseSeq ?? null)) {
      emit('moveRejected', { error: res.error });
    }
    return res;
  },
  emote: (emote: EmoteId) => {
    if (mockHandler) {
      mockHandler('game:emote', { emote });
      return;
    }
    // Emotes are fleeting: drop them while offline instead of replaying them after a reconnect.
    const s = connectSocket();
    if (s.connected) s.emit('game:emote', { emote });
  },
};
