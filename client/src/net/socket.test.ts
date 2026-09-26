/**
 * net/socket.ts handlers against a scripted fake Socket.IO client: tab replacement (clientflow-1 /
 * completeness-3), timed acks + move error reporting (clientflow-6), targeting/resync and lobby
 * guards (clientflow-6, server-2), invite + rejoin links (completeness-1, rejoin key), expired
 * toast (completeness-7) and the memoised token (server-4 / completeness-4).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GameView, RoomView } from '@shared/types';

type Handler = (...args: any[]) => void;

interface FakeSocket {
  opts: any;
  handlers: Record<string, Handler>;
  emitted: { ev: string; args: any[]; timeout?: number }[];
  connected: boolean;
  active: boolean;
  sendBuffer: unknown[];
  connectCalls: number;
  on(e: string, fn: Handler): FakeSocket;
  io: { on(e: string, fn: Handler): void };
  timeout(ms: number): { emit(ev: string, ...args: any[]): void };
  emit(ev: string, ...args: any[]): void;
  connect(): void;
}

const h = vi.hoisted(() => ({ sock: null as FakeSocket | null }));

vi.mock('socket.io-client', () => ({
  io: (opts: any) => {
    const f: FakeSocket = {
      opts,
      handlers: {},
      emitted: [],
      connected: false,
      active: true,
      sendBuffer: [],
      connectCalls: 0,
      on(e, fn) {
        f.handlers[e] = fn;
        return f;
      },
      io: { on: () => {} },
      timeout(ms) {
        return { emit: (ev, ...args) => void f.emitted.push({ ev, args, timeout: ms }) };
      },
      emit(ev, ...args) {
        f.emitted.push({ ev, args });
      },
      connect() {
        f.connectCalls++;
      },
    };
    h.sock = f;
    return f;
  },
}));

function setUrl(href: string) {
  const loc = { href, get origin() { return new URL(loc.href).origin; }, get hostname() { return new URL(loc.href).hostname; } };
  (globalThis as any).window = {
    location: loc,
    history: {
      replaceState(_s: unknown, _t: string, url: string) {
        loc.href = url;
      },
    },
  };
}
const href = () => (globalThis as any).window.location.href as string;

function memoryStorage(): Storage {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    clear: () => m.clear(),
    key: () => null,
    get length() {
      return m.size;
    },
  } as Storage;
}

async function load(url = 'http://localhost:5173/') {
  vi.resetModules();
  setUrl(url);
  const net = await import('./socket');
  const { useGame } = await import('../store/useGame');
  const bus = await import('./bus');
  const s = net.connectSocket();
  const sock = h.sock!;
  const fire = (e: string, ...args: any[]) => sock.handlers[e](...args);
  const connect = () => {
    sock.connected = true;
    fire('connect');
  };
  /** Resolve the n-th emitted ack (error-first, as with socket.timeout()). */
  const ack = (i: number, err: Error | null, res?: unknown) => sock.emitted[i].args[sock.emitted[i].args.length - 1](err, res);
  expect(s).toBe(sock);
  return { net, useGame, bus, sock, fire, connect, ack };
}

function room(code: string, status: RoomView['status'] = 'lobby', extra: Partial<RoomView> = {}): RoomView {
  return {
    code,
    hostId: 'p1',
    status,
    players: [
      { id: 'p1', name: 'Tuấn', seat: 0, kind: 'human', avatar: 'fox', connected: true, isHost: true, botControlled: false, left: false, wins: 0 },
    ],
    settings: { turnSeconds: 30, responseSeconds: 12 },
    youId: 'p1',
    maxPlayers: 6,
    gameNumber: 1,
    ...extra,
  };
}

function view(phaseSeq: number, prompt: GameView['prompt']): GameView {
  return {
    viewerId: 'p1',
    players: [],
    deckCount: 5,
    treasury: 40,
    turn: 2,
    actorId: 'p1',
    pendingAction: null,
    pendingBlock: null,
    phase: { kind: 'turn', actorId: 'p1' },
    phaseSeq,
    prompt,
    winnerId: null,
    log: [],
    deadline: null,
    phaseDurationMs: null,
    serverNow: 0,
  };
}

const choose: GameView['prompt'] = { kind: 'choose_action', mustCoup: false, options: [] };
const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  (globalThis as any).localStorage = memoryStorage();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('tab replaced by another tab', () => {
  it('shows the replaced state (not "reconnecting"), fails calls fast and buffers nothing', async () => {
    const { net, useGame, sock, fire, connect } = await load();
    connect();
    expect(useGame.getState().conn).toBe('connected');

    fire('room:state', room('KX7QP'));
    fire('room:closed', { reason: 'replaced' });
    expect(useGame.getState().ui.toasts.map((t) => t.text)).toContain('toast.replaced');
    // The server then closes the socket; Socket.IO will not reconnect by itself.
    sock.connected = false;
    sock.active = false;
    fire('disconnect', 'io server disconnect');
    expect(useGame.getState().conn).toBe('replaced');
    expect(useGame.getState().room).toBeNull();
    // The blocking panel says it all — no duplicate toast.
    expect(useGame.getState().ui.toasts.map((t) => t.text)).not.toContain('toast.replaced');

    // A click in this state neither sends nor buffers anything.
    const started = Date.now();
    expect(await net.api.createRoom('Tuấn', 'fox')).toEqual({ ok: false, error: 'not_connected' });
    expect(Date.now() - started).toBeLessThan(1000);
    expect(sock.emitted).toEqual([]);

    // "Play in this tab": explicit reconnect with an empty send buffer.
    sock.sendBuffer = ['stale packet'];
    net.reconnectHere();
    expect(sock.sendBuffer).toEqual([]);
    expect(sock.connectCalls).toBe(1);
    expect(useGame.getState().conn).toBe('connecting');
  });

  it('a transport drop is still "reconnecting" (auto reconnect)', async () => {
    const { useGame, sock, fire, connect } = await load();
    connect();
    sock.connected = false;
    fire('disconnect', 'transport close');
    expect(useGame.getState().conn).toBe('reconnecting');
  });
});

describe('api calls', () => {
  it('use timed, error-first acks', async () => {
    const { net, sock, connect, ack } = await load();
    connect();
    const a = net.api.createRoom('Tuấn');
    const b = net.api.addBot('easy');
    const c = net.api.kick('p2');
    expect(sock.emitted.map((e) => [e.ev, e.timeout])).toEqual([
      ['room:create', net.API_TIMEOUT_MS],
      ['room:addBot', net.API_TIMEOUT_MS],
      ['room:kick', net.API_TIMEOUT_MS],
    ]);
    ack(0, null, { ok: true, code: 'KX7QP' });
    ack(1, new Error('operation has timed out'));
    ack(2, new Error('socket has been disconnected'));
    expect(await a).toEqual({ ok: true, code: 'KX7QP' });
    expect(await b).toEqual({ ok: false, error: 'timeout' });
    expect(await c).toEqual({ ok: false, error: 'disconnected' });
  });

  it('joinRoom passes the rejoin key only when given', async () => {
    const { net, sock, connect } = await load();
    connect();
    void net.api.joinRoom(' kx7qp ', 'Tuấn', 'fox');
    void net.api.joinRoom('KX7QP', 'Tuấn', 'fox', 'SECRET');
    expect(sock.emitted[0].args[0]).toEqual({ code: 'KX7QP', name: 'Tuấn', avatar: 'fox' });
    expect(sock.emitted[1].args[0]).toEqual({ code: 'KX7QP', name: 'Tuấn', avatar: 'fox', rejoinKey: 'SECRET' });
  });

  it('a move lost in a disconnect or outdated by a resync is not reported as rejected', async () => {
    const { net, useGame, bus, fire, connect, ack } = await load();
    connect();
    const rejected: string[] = [];
    bus.on('moveRejected', ({ error }) => rejected.push(error));
    fire('game:state', { view: view(5, { kind: 'respond_block' }), events: [], resync: false });

    const lost = net.api.move({ type: 'pass' });
    ack(0, new Error('socket has been disconnected'));
    expect(await lost).toEqual({ ok: false, error: 'disconnected' });

    const late = net.api.move({ type: 'pass' });
    fire('game:state', { view: view(6, null), events: [], resync: true });
    ack(1, new Error('operation has timed out'));
    await late;
    expect(rejected).toEqual([]);

    // Real rejections (and a timeout in the same phase) still get feedback.
    const stale = net.api.move({ type: 'pass' });
    ack(2, null, { ok: false, error: 'stale_phase' });
    await stale;
    const slow = net.api.move({ type: 'pass' });
    ack(3, new Error('operation has timed out'));
    await slow;
    expect(rejected).toEqual(['stale_phase', 'timeout']);
    expect(useGame.getState().game?.phaseSeq).toBe(6);
  });

  it('emotes are dropped while offline instead of being replayed later', async () => {
    const { net, sock, connect } = await load();
    net.api.emote('gg');
    expect(sock.emitted).toEqual([]);
    connect();
    net.api.emote('gg');
    expect(sock.emitted.map((e) => e.ev)).toEqual(['game:emote']);
  });
});

describe('game / room pushes', () => {
  it('targeting survives only a same-phase push; a resync or new phase clears it', async () => {
    const { useGame, fire, connect } = await load();
    connect();
    fire('game:state', { view: view(1, choose), events: [], resync: false });
    useGame.getState().beginTargeting('coup');
    fire('game:state', { view: view(1, choose), events: [], resync: false });
    expect(useGame.getState().ui.targeting).toBe('coup');
    fire('game:state', { view: view(50, choose), events: [], resync: false });
    expect(useGame.getState().ui.targeting).toBeNull();

    useGame.getState().beginTargeting('steal');
    fire('game:state', { view: view(50, choose), events: [], resync: true });
    expect(useGame.getState().ui.targeting).toBeNull();
  });

  it('a lobby room:state drops a stale game (reconnected after "new game")', async () => {
    const { useGame, fire, connect } = await load();
    connect();
    fire('room:state', room('KX7QP', 'finished'));
    fire('game:state', { view: view(9, choose), events: [], resync: true });
    useGame.getState().beginTargeting('coup');
    fire('room:state', room('KX7QP', 'lobby'));
    expect(useGame.getState().game).toBeNull();
    expect(useGame.getState().ui.targeting).toBeNull();
    expect(useGame.getState().room?.status).toBe('lobby');
  });

  it('expired: explains why and keeps the code pre-filled on Home', async () => {
    const { useGame, fire, connect } = await load();
    connect();
    fire('room:state', room('KX7QP'));
    expect(href()).toBe('http://localhost:5173/?room=KX7QP');
    fire('room:closed', { reason: 'expired' });
    expect(useGame.getState().room).toBeNull();
    expect(useGame.getState().ui.toasts.map((t) => t.text)).toContain('toast.expired');
    expect(useGame.getState().invite).toEqual({ code: 'KX7QP' });
    expect(href()).toBe('http://localhost:5173/?room=KX7QP');
  });

  it('a voluntary leave clears the room from the URL without a toast', async () => {
    const { useGame, fire, connect } = await load();
    connect();
    fire('room:state', room('KX7QP'));
    fire('room:closed', { reason: 'left' });
    expect(href()).toBe('http://localhost:5173/');
    expect(useGame.getState().ui.toasts).toEqual([]);
    expect(useGame.getState().invite).toBeNull();
  });
});

describe('invite link while still seated in another room', () => {
  it('keeps the invite, asks, and "leave then join" lands in the invited room', async () => {
    const { net, useGame, sock, fire, connect, ack } = await load('http://localhost:5173/?room=newxx');
    expect(useGame.getState().invite).toEqual({ code: 'NEWXX' });
    connect();
    fire('room:state', room('OLDYY', 'playing')); // the server re-attached the old seat
    expect(useGame.getState().room?.code).toBe('OLDYY');
    expect(useGame.getState().invite).toEqual({ code: 'NEWXX' }); // → InvitePrompt shows
    expect(href()).toBe('http://localhost:5173/?room=newxx'); // not overwritten

    const done = net.acceptInvite();
    expect(sock.emitted.map((e) => e.ev)).toEqual(['room:leave']);
    fire('room:closed', { reason: 'left' });
    expect(href()).toBe('http://localhost:5173/?room=NEWXX'); // Home would pre-fill NEWXX
    ack(0, null, { ok: true });
    await flush();
    expect(sock.emitted.map((e) => e.ev)).toEqual(['room:leave', 'room:join']);
    expect(sock.emitted[1].args[0]).toMatchObject({ code: 'NEWXX', name: 'Tuấn' }); // old seat name
    fire('room:state', room('NEWXX'));
    ack(1, null, { ok: true, code: 'NEWXX' });
    expect(await done).toEqual({ ok: true, code: 'NEWXX' });
    expect(useGame.getState().invite).toBeNull();
    expect(href()).toBe('http://localhost:5173/?room=NEWXX');
  });

  it('"stay" keeps the old room and puts its code back in the URL', async () => {
    const { net, useGame, fire, connect } = await load('http://localhost:5173/?room=NEWXX');
    connect();
    fire('room:state', room('OLDYY'));
    net.dismissInvite();
    expect(useGame.getState().invite).toBeNull();
    expect(href()).toBe('http://localhost:5173/?room=OLDYY');
    fire('room:state', room('OLDYY'));
    expect(href()).toBe('http://localhost:5173/?room=OLDYY');
  });

  it('the same room (a plain reload) needs no prompt', async () => {
    const { useGame, fire, connect } = await load('http://localhost:5173/?room=KX7QP');
    connect();
    fire('room:state', room('KX7QP'));
    expect(useGame.getState().invite).toBeNull();
  });
});

describe('rejoin link (?room=CODE&key=KEY)', () => {
  it('not seated: reclaims the seat automatically, then strips the key', async () => {
    vi.useFakeTimers();
    const { useGame, sock, fire, connect, ack } = await load('http://localhost:5173/?room=KX7QP&key=SECRET');
    expect(useGame.getState().invite).toEqual({ code: 'KX7QP', key: 'SECRET' });
    connect();
    expect(sock.emitted).toEqual([]); // waits for a possible re-attach first
    vi.advanceTimersByTime(500);
    expect(sock.emitted.map((e) => e.ev)).toEqual(['room:join']);
    expect(sock.emitted[0].args[0]).toMatchObject({ code: 'KX7QP', rejoinKey: 'SECRET' });
    expect(useGame.getState().invite?.joining).toBe(true);
    fire('room:state', room('KX7QP', 'playing', { rejoinKey: 'NEWKEY' }));
    ack(0, null, { ok: true, code: 'KX7QP' });
    await vi.runAllTimersAsync();
    expect(useGame.getState().invite).toBeNull();
    expect(href()).toBe('http://localhost:5173/?room=KX7QP');
  });

  it('a bad key explains itself and falls back to the normal Home', async () => {
    vi.useFakeTimers();
    const { useGame, connect, ack } = await load('http://localhost:5173/?room=KX7QP&key=WRONG');
    connect();
    vi.advanceTimersByTime(500);
    ack(0, null, { ok: false, error: 'bad_rejoin_key' });
    await vi.advanceTimersByTimeAsync(0);
    expect(useGame.getState().invite).toBeNull();
    expect(useGame.getState().ui.toasts.map((t) => t.text)).toContain('error.bad_rejoin_key');
    expect(href()).toBe('http://localhost:5173/');
  });

  it('already seated (the server re-attached us): never sends a join that would leave that seat', async () => {
    vi.useFakeTimers();
    const { useGame, sock, fire, connect } = await load('http://localhost:5173/?room=KX7QP&key=SECRET');
    connect();
    fire('room:state', room('KX7QP', 'playing'));
    vi.advanceTimersByTime(2000);
    expect(sock.emitted).toEqual([]);
    expect(useGame.getState().invite).toBeNull();
    expect(href()).toBe('http://localhost:5173/?room=KX7QP'); // key stripped
  });
});

describe('session token', () => {
  function authTokens(sock: FakeSocket, n: number): string[] {
    const out: string[] = [];
    for (let i = 0; i < n; i++) sock.opts.auth((a: { token: string }) => out.push(a.token));
    return out;
  }

  it('stays the same across reconnects when localStorage throws', async () => {
    (globalThis as any).localStorage = {
      getItem() {
        throw new Error('SecurityError');
      },
      setItem() {
        throw new Error('SecurityError');
      },
    };
    const { sock } = await load();
    const [a, b, c] = authTokens(sock, 3);
    expect(a.length).toBeGreaterThanOrEqual(8);
    expect(b).toBe(a);
    expect(c).toBe(a);
  });

  it('stays the same when only writing fails', async () => {
    (globalThis as any).localStorage = {
      getItem: () => null,
      setItem() {
        throw new Error('QuotaExceededError');
      },
    };
    const { sock } = await load();
    const [a, b] = authTokens(sock, 2);
    expect(b).toBe(a);
  });

  it('reuses the stored token', async () => {
    localStorage.setItem('coup3d.token', 'stored-token-123');
    const { sock } = await load();
    expect(authTokens(sock, 2)).toEqual(['stored-token-123', 'stored-token-123']);
  });
});
