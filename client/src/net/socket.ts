/**
 * Socket.IO client + promise API. CONTRACT FILE — UI calls `api.*`, never the socket directly.
 */
import { io, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '@shared/protocol';
import type { AvatarId, BotLevel, EmoteId, Move, RoomSettings } from '@shared/types';
import { useGame } from '../store/useGame';
import { emit } from './bus';

type ClientSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

const LS_TOKEN = 'coup3d.token';

function getToken(): string {
  try {
    let t = localStorage.getItem(LS_TOKEN);
    if (!t) {
      t = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      localStorage.setItem(LS_TOKEN, t);
    }
    return t;
  } catch {
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}

let socket: ClientSocket | null = null;

export function connectSocket(): ClientSocket {
  if (socket) return socket;
  const s: ClientSocket = io({
    // A function so every (re)connect sends the room we currently believe we are in.
    auth: (cb) => cb({ token: getToken(), room: useGame.getState().room?.code }),
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionDelay: 500,
    reconnectionDelayMax: 3000,
  });
  socket = s;

  s.on('connect', () => useGame.setState({ conn: 'connected' }));
  s.on('disconnect', () => useGame.setState({ conn: 'reconnecting' }));
  s.io.on('reconnect_attempt', () => useGame.setState({ conn: 'reconnecting' }));

  s.on('room:state', (room) => {
    useGame.setState({ room });
    syncRoomCodeToUrl(room.code);
  });

  s.on('room:closed', ({ reason }) => {
    useGame.setState((st) => ({ room: null, game: null, ui: { ...st.ui, targeting: null } }));
    syncRoomCodeToUrl(null);
    if (reason === 'kicked') useGame.getState().toast('toast.kicked', 'error');
    if (reason === 'replaced') useGame.getState().toast('toast.replaced', 'error');
    if (reason === 'room_deleted') useGame.getState().toast('toast.roomDeleted', 'error');
  });

  s.on('game:state', ({ view, events, resync }) => {
    const clockOffset = view.serverNow ? view.serverNow - Date.now() : useGame.getState().clockOffset;
    useGame.setState((st) => {
      // Drop target selection if we are no longer choosing an action.
      const stillChoosing = view.prompt?.kind === 'choose_action';
      return {
        game: view,
        clockOffset,
        ui: stillChoosing ? st.ui : { ...st.ui, targeting: null },
      };
    });
    if (!resync && events.length) emit('events', events);
  });

  s.on('game:cleared', () => {
    useGame.setState((st) => ({ game: null, ui: { ...st.ui, targeting: null } }));
  });

  s.on('game:emote', (p) => emit('emote', p));

  return s;
}

function syncRoomCodeToUrl(code: string | null) {
  try {
    const url = new URL(window.location.href);
    if (code) url.searchParams.set('room', code);
    else url.searchParams.delete('room');
    window.history.replaceState(null, '', url.toString());
  } catch {
    /* ignore */
  }
}

/** Room code from `?room=XXXXX` (for share links). */
export function roomCodeFromUrl(): string | null {
  try {
    return new URL(window.location.href).searchParams.get('room');
  } catch {
    return null;
  }
}

export type ApiResult<T = {}> = ({ ok: true } & T) | { ok: false; error: string };

/**
 * Dev-only: when set (see client/src/dev/mock.ts), API calls are routed here instead of the
 * socket so screens can be previewed with fixture data and no server.
 */
let mockHandler: ((name: string, payload: unknown) => ApiResult<any>) | null = null;
export function setMockHandler(fn: typeof mockHandler) {
  mockHandler = fn;
}

function call<T = {}>(
  fn: (s: ClientSocket, ack: (r: ApiResult<T>) => void) => void,
  mock?: [string, unknown],
): Promise<ApiResult<T>> {
  if (mockHandler) return Promise.resolve(mockHandler(mock?.[0] ?? 'unknown', mock?.[1]) as ApiResult<T>);
  const s = connectSocket();
  return new Promise((resolve) => {
    let done = false;
    const timer = setTimeout(() => {
      if (!done) {
        done = true;
        resolve({ ok: false, error: 'timeout' });
      }
    }, 8000);
    fn(s, (r) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve(r);
    });
  });
}

export const api = {
  createRoom: (name: string, avatar?: AvatarId) =>
    call<{ code: string }>((s, ack) => s.emit('room:create', { name, avatar }, ack as never), ['room:create', { name, avatar }]),
  joinRoom: (code: string, name: string, avatar?: AvatarId) =>
    call<{ code: string }>(
      (s, ack) => s.emit('room:join', { code: code.toUpperCase().trim(), name, avatar }, ack as never),
      ['room:join', { code, name, avatar }],
    ),
  leaveRoom: () => call((s, ack) => s.emit('room:leave', ack as never), ['room:leave', null]),
  updatePlayer: (p: { name?: string; avatar?: AvatarId }) => call((s, ack) => s.emit('player:update', p, ack as never), ['player:update', p]),
  addBot: (level: BotLevel) => call((s, ack) => s.emit('room:addBot', { level }, ack as never), ['room:addBot', { level }]),
  kick: (playerId: string) => call((s, ack) => s.emit('room:kick', { playerId }, ack as never), ['room:kick', { playerId }]),
  updateSettings: (p: Partial<RoomSettings>) => call((s, ack) => s.emit('room:settings', p, ack as never), ['room:settings', p]),
  start: () => call((s, ack) => s.emit('room:start', ack as never), ['room:start', null]),
  backToLobby: () => call((s, ack) => s.emit('room:backToLobby', ack as never), ['room:backToLobby', null]),
  /** Sends a move for the current phase. Rejections are also broadcast on the bus as 'moveRejected'. */
  async move(move: Move): Promise<ApiResult> {
    const g = useGame.getState().game;
    if (!g) return { ok: false, error: 'no_game' };
    const res = await call(
      (s, ack) => s.emit('game:move', { move, phaseSeq: g.phaseSeq }, ack as never),
      ['game:move', { move, phaseSeq: g.phaseSeq }],
    );
    if (!res.ok) emit('moveRejected', { error: res.error });
    return res;
  },
  emote: (emote: EmoteId) => {
    if (mockHandler) {
      mockHandler('game:emote', { emote });
      return;
    }
    connectSocket().emit('game:emote', { emote });
  },
};
