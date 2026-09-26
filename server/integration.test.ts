/**
 * End-to-end tests on a real server (ephemeral port) with real socket.io clients. Timers are
 * scaled down (scaledTiming) so whole games finish in a few seconds.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { Move, Prompt } from '@shared/types';
import { AVATARS } from '@shared/types';
import { createCoupServer, type CoupServer } from './app';
import { newToken, TestClient, waitFor, type GameStatePayload } from './testing/testClient';
import { scaledTiming } from './timing';

const SCALE = 0.02;
const timing = scaledTiming(SCALE);

let server: CoupServer;
let url: string;
const errors: unknown[] = [];
const clients: TestClient[] = [];

beforeAll(async () => {
  server = createCoupServer({ timing, onError: (err) => errors.push(err) });
  const port = await server.listen(0, '127.0.0.1');
  url = `http://127.0.0.1:${port}`;
});

afterEach(() => {
  for (const c of clients.splice(0)) c.close();
  expect(errors).toEqual([]);
});

afterAll(async () => {
  await server.close();
});

async function client(token?: string): Promise<TestClient> {
  const c = new TestClient(url, token);
  clients.push(c);
  await c.connected();
  return c;
}

async function createRoom(name = 'Host'): Promise<{ host: TestClient; code: string }> {
  const host = await client();
  const res = await host.call('room:create', { name });
  if (!res.ok) throw new Error(`create failed: ${res.error}`);
  await waitFor(() => host.room, 1000, 'room:state');
  return { host, code: String(res.code) };
}

/** A legal (random-ish) move for a prompt. */
function pickMove(prompt: Prompt, rand: () => number): Move {
  const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)];
  switch (prompt.kind) {
    case 'choose_action': {
      const opt = pick(prompt.options.filter((o) => o.enabled));
      return opt.targets.length
        ? { type: 'action', action: opt.action, targetId: pick(opt.targets) }
        : { type: 'action', action: opt.action };
    }
    case 'respond_action': {
      const options: Move[] = [{ type: 'pass' }, { type: 'pass' }];
      if (prompt.canChallenge) options.push({ type: 'challenge' });
      for (const character of prompt.blockCharacters) options.push({ type: 'block', character });
      return pick(options);
    }
    case 'respond_block':
      return pick<Move>([{ type: 'pass' }, { type: 'challenge' }]);
    case 'lose_influence':
      return { type: 'reveal', slot: pick(prompt.slots) };
    case 'exchange':
      return { type: 'exchange', keep: Array.from({ length: prompt.keepCount }, (_, i) => prompt.cards.length - 1 - i).reverse() };
  }
}

/** Answers each new prompt once. Returns a stop function. */
function autoPlay(c: TestClient, rand: () => number = Math.random): () => void {
  let actedSeq = -1;
  let stopped = false;
  const onState = (p: GameStatePayload) => {
    const { view } = p;
    if (stopped || !view.prompt || view.phaseSeq === actedSeq) return;
    actedSeq = view.phaseSeq;
    const move = pickMove(view.prompt, rand);
    void c.call('game:move', { move, phaseSeq: view.phaseSeq }).then((res) => {
      if (!res.ok && !['stale_phase', 'not_your_decision', 'game_over'].includes(res.error)) {
        throw new Error(`move ${JSON.stringify(move)} rejected: ${res.error}`);
      }
    });
  };
  c.socket.on('game:state', onState);
  return () => {
    stopped = true;
    c.socket.off('game:state', onState);
  };
}

function assertNoHiddenInfo(c: TestClient): void {
  const me = c.youId;
  for (const st of c.games) {
    for (const p of st.view.players) {
      if (p.id === me) continue;
      for (const inf of p.influences) if (!inf.revealed) expect(inf.character).toBeNull();
    }
    const json = JSON.stringify(st);
    expect(json).not.toMatch(/"id":"c\d+"/);
    expect(json).not.toContain('rngState');
    expect(json).not.toContain('"deck"');
    expect(json).not.toContain('"drawn"');
  }
}

describe('http', () => {
  it('answers /healthz', async () => {
    const res = await fetch(`${url}/healthz`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/json');
    expect(await res.json()).toMatchObject({ ok: true });
  });
});

describe('connection', () => {
  it('rejects a handshake without a valid token', async () => {
    for (const token of ['short', '', 'x'.repeat(129)]) {
      const c = new TestClient(url, token);
      clients.push(c);
      await expect(c.connected()).rejects.toThrow('invalid_token');
    }
  });

  it('never crashes on malformed payloads', async () => {
    const c = await client();
    expect(await c.call('room:create', null)).toEqual({ ok: false, error: 'bad_request' });
    expect(await c.call('room:create', { name: 123 })).toEqual({ ok: false, error: 'bad_request' });
    expect(await c.call('room:create', { name: '   ' })).toEqual({ ok: false, error: 'bad_request' });
    expect(await c.call('room:create', { name: 'x'.repeat(17) })).toEqual({ ok: false, error: 'bad_request' });
    expect(await c.call('room:create', { name: 'Ok', avatar: 'dragon' })).toEqual({ ok: false, error: 'bad_request' });
    expect(await c.call('room:join', 'ABCDE')).toEqual({ ok: false, error: 'bad_request' });
    expect(await c.call('room:join', { code: 'abc', name: 'X' })).toEqual({ ok: false, error: 'room_not_found' });
    expect(await c.call('room:join', { code: 'ZZZZZ', name: 'X' })).toEqual({ ok: false, error: 'room_not_found' });
    expect(await c.call('game:move', { move: { type: 'hack' }, phaseSeq: 1 })).toEqual({ ok: false, error: 'bad_request' });
    expect(await c.call('game:move', { move: { type: 'pass' }, phaseSeq: 'x' })).toEqual({ ok: false, error: 'bad_request' });
    expect(await c.call('game:move', { move: { type: 'pass' }, phaseSeq: 3 })).toEqual({ ok: false, error: 'not_in_room' });
    expect(await c.call('room:leave', { weird: true })).toEqual({ ok: false, error: 'not_in_room' });
    expect(await c.call('room:start')).toEqual({ ok: false, error: 'not_in_room' });
    c.raw('room:create', { name: 'NoAck' }); // no ack function: must not throw
    c.raw('game:emote', 'nonsense');
    c.raw('unknown:event', 1, 2, 3);
    const res = await fetch(`${url}/healthz`);
    expect(res.status).toBe(200);
  });

  it('rate-limits a flooding socket', async () => {
    const c = await client();
    const results = await Promise.all(Array.from({ length: 60 }, () => c.call('room:settings', { turnSeconds: 30 })));
    const limited = results.filter((r) => !r.ok && r.error === 'rate_limited').length;
    expect(limited).toBeGreaterThan(0);
    expect(results.length - limited).toBeGreaterThanOrEqual(20);
  });
});

describe('lobby', () => {
  it('create → join by code (any case) → bots → settings → start', async () => {
    const { host, code } = await createRoom('Alice');
    expect(code).toMatch(/^[A-Z2-9]{5}$/);
    const bob = await client();
    expect(await bob.call('room:join', { code: ` ${code.toLowerCase()} `, name: 'alice', avatar: 'owl' })).toEqual({
      ok: true,
      code,
    });
    await waitFor(() => host.room?.players.length === 2, 1000, 'host sees bob');
    expect(bob.room?.players.map((p) => p.name)).toEqual(['Alice', 'alice 2']);
    expect(bob.room?.youId).not.toBe(host.room?.youId);

    expect(await bob.call('room:addBot', { level: 'easy' })).toEqual({ ok: false, error: 'not_host' });
    expect(await host.call('room:addBot', { level: 'godlike' })).toEqual({ ok: false, error: 'bad_request' });
    expect(await host.call('room:addBot', { level: 'hard' })).toMatchObject({ ok: true });
    expect(await host.call('room:settings', { turnSeconds: 7 })).toEqual({ ok: false, error: 'bad_request' });
    expect(await host.call('room:settings', { turnSeconds: 45, responseSeconds: 15 })).toEqual({ ok: true });
    await waitFor(() => bob.room?.settings.turnSeconds === 45 && bob.room.players.length === 3, 1000, 'settings');
    expect(bob.room?.players[2]).toMatchObject({ kind: 'bot', botLevel: 'hard', connected: true });

    // The bot's avatar is random — pick one nobody holds.
    const freeAvatar = AVATARS.find((a) => !bob.room?.players.some((p) => p.avatar === a))!;
    expect(await bob.call('player:update', { name: 'Bobby', avatar: freeAvatar })).toEqual({ ok: true });
    await waitFor(() => host.room?.players.find((p) => p.name === 'Bobby')?.avatar === freeAvatar, 1000, 'rename');

    expect(await bob.call('room:start')).toEqual({ ok: false, error: 'not_host' });
    expect(await host.call('room:start')).toEqual({ ok: true });
    await waitFor(() => bob.game && host.game, 1000, 'game:state');
    expect(bob.room?.status).toBe('playing');
    expect(bob.game?.events.map((e) => e.type)).toEqual(['game_start', 'turn_start']);
    expect(bob.game?.view.phaseDurationMs).toBe(Math.round(45_000 * SCALE));

    const late = await client();
    expect(await late.call('room:join', { code, name: 'Carol' })).toEqual({ ok: false, error: 'game_in_progress' });
    expect(await host.call('room:settings', { turnSeconds: 30 })).toEqual({ ok: false, error: 'game_in_progress' });
  });

  it('kick sends room:closed to the kicked player', async () => {
    const { host, code } = await createRoom();
    const guest = await client();
    await guest.call('room:join', { code, name: 'Guest' });
    await waitFor(() => host.room?.players.length === 2, 1000, 'guest joined');
    expect(await host.call('room:kick', { playerId: guest.youId })).toEqual({ ok: true });
    await waitFor(() => guest.closed.includes('kicked'), 1000, 'kicked');
    await waitFor(() => host.room?.players.length === 1, 1000, 'seat freed');
    expect(await guest.call('room:start')).toEqual({ ok: false, error: 'not_in_room' });
  });
});

describe('game', () => {
  it('rejects stale phaseSeq and accepts a current move', async () => {
    const { host } = await createRoom();
    const guest = await client();
    await guest.call('room:join', { code: host.room!.code, name: 'Guest' });
    await host.call('room:settings', { turnSeconds: 60 }); // 1.2 s at this time scale
    await host.call('room:start');
    const st = await waitFor(() => host.game, 1000, 'game');
    const seq = st.view.phaseSeq;
    expect(await host.call('game:move', { move: { type: 'pass' }, phaseSeq: seq - 1 })).toEqual({
      ok: false,
      error: 'stale_phase',
    });
    const actor = [host, guest].find((c) => c.game?.view.prompt?.kind === 'choose_action')!;
    expect(actor).toBeDefined();
    expect(await actor.call('game:move', { move: { type: 'action', action: 'income' }, phaseSeq: seq })).toEqual({
      ok: true,
    });
    await waitFor(() => host.game!.view.phaseSeq > seq && guest.game!.view.phaseSeq > seq, 1000, 'next phase');
    const events = host.game!.events.map((e) => e.type);
    expect(events).toContain('action');
    expect(await actor.call('game:move', { move: { type: 'action', action: 'income' }, phaseSeq: seq })).toEqual({
      ok: false,
      error: 'stale_phase',
    });
  });

  it('plays a full game of 1 human + 3 bots to completion without leaking hidden cards', async () => {
    const { host } = await createRoom('Solo');
    for (const level of ['easy', 'normal', 'hard'] as const) await host.call('room:addBot', { level });
    const stop = autoPlay(host);
    expect(await host.call('room:start')).toEqual({ ok: true });
    await waitFor(() => host.room?.status === 'finished', 25_000, 'game over');
    stop();

    const final = host.game!.view;
    expect(final.phase.kind).toBe('game_over');
    expect(final.deadline).toBeNull();
    const winner = host.room!.players.find((p) => p.id === final.winnerId)!;
    expect(winner.wins).toBe(1);

    // Deltas: contiguous event seqs across pushes, starting with the deal.
    const seqs = host.games.flatMap((g) => g.events.map((e) => e.seq));
    expect(seqs[0]).toBe(1);
    for (let i = 1; i < seqs.length; i++) expect(seqs[i]).toBe(seqs[i - 1] + 1);
    expect(host.games.every((g) => !g.resync)).toBe(true);
    assertNoHiddenInfo(host);

    expect(await host.call('room:backToLobby')).toEqual({ ok: true });
    await waitFor(() => host.cleared === 1 && host.room?.status === 'lobby', 1000, 'back to lobby');
    expect(host.room!.players).toHaveLength(4);
  }, 30_000);

  it('resumes a reconnecting token with a full resync', async () => {
    const { host } = await createRoom('Resumer');
    await host.call('room:addBot', { level: 'easy' });
    await host.call('room:start');
    await waitFor(() => host.game, 1000, 'game');
    const me = host.youId;
    host.close();
    await new Promise((r) => setTimeout(r, 50));

    const again = await client(host.token);
    const st = await waitFor(() => again.game, 1000, 'resync');
    expect(st.resync).toBe(true);
    expect(st.events).toEqual([]);
    expect(st.view.viewerId).toBe(me);
    expect(again.room?.youId).toBe(me);
    expect(again.room?.players.find((p) => p.id === me)).toMatchObject({ connected: true, botControlled: false });
    assertNoHiddenInfo(again);
  });

  it('replaces an older socket that uses the same token', async () => {
    const { host } = await createRoom('Twin');
    const twin = await client(host.token);
    await waitFor(() => host.closed.includes('replaced'), 1000, 'replaced');
    await waitFor(() => !host.socket.connected, 1000, 'old socket disconnected');
    await waitFor(() => twin.room, 1000, 'room state on the new socket');
    expect(twin.room?.youId).toBe(host.room?.youId);
    expect(await twin.call('room:addBot', { level: 'easy' })).toMatchObject({ ok: true });
  });

  it('takes over a disconnected seat after the grace period and gives it back on reconnect', async () => {
    const { host, code } = await createRoom('Stayer');
    const guest = await client();
    await guest.call('room:join', { code, name: 'Dropper' });
    await host.call('room:start');
    await waitFor(() => guest.game, 1000, 'game');
    const guestId = guest.youId;
    guest.close();
    await waitFor(
      () => host.room?.players.find((p) => p.id === guestId && !p.connected && !p.botControlled),
      1000,
      'disconnected',
    );
    await waitFor(
      () => host.room?.players.find((p) => p.id === guestId && p.botControlled),
      timing.reconnectGraceMs + 1000,
      'bot takeover',
    );
    const back = await client(guest.token);
    await waitFor(() => back.game?.resync, 1000, 'resync');
    await waitFor(
      () => host.room?.players.find((p) => p.id === guestId && p.connected && !p.botControlled),
      1000,
      'control restored',
    );
  });

  it('leave mid-game → bot plays the seat; rejoin by name reclaims it', async () => {
    const { host, code } = await createRoom('Keeper');
    const guest = await client();
    await guest.call('room:join', { code, name: 'Wanderer' });
    await host.call('room:start');
    await waitFor(() => guest.game, 1000, 'game');
    const guestId = guest.youId;
    expect(await guest.call('room:leave')).toEqual({ ok: true });
    await waitFor(() => guest.closed.includes('left'), 1000, 'left');
    await waitFor(() => host.room?.players.find((p) => p.id === guestId && p.left && p.botControlled), 1000, 'left seat');

    const other = await client(newToken());
    expect(await other.call('room:join', { code, name: 'Stranger' })).toEqual({ ok: false, error: 'game_in_progress' });
    expect(await other.call('room:join', { code, name: 'WANDERER' })).toEqual({ ok: true, code });
    const st = await waitFor(() => other.game, 1000, 'resync');
    expect(st.resync).toBe(true);
    expect(other.youId).toBe(guestId);
    await waitFor(
      () => host.room?.players.find((p) => p.id === guestId && !p.left && !p.botControlled && p.connected),
      1000,
      'reclaimed',
    );
  });

  it('relays emotes with a cooldown', async () => {
    // Own server with a real-length cooldown so the assertion does not depend on machine speed.
    const slow = createCoupServer({ timing: { ...timing, emoteCooldownMs: 60_000 }, onError: (e) => errors.push(e) });
    const slowUrl = `http://127.0.0.1:${await slow.listen(0, '127.0.0.1')}`;
    try {
      const host = new TestClient(slowUrl);
      const guest = new TestClient(slowUrl);
      clients.push(host, guest);
      await Promise.all([host.connected(), guest.connected()]);
      const created = await host.call('room:create', { name: 'Emoter' });
      expect(created.ok).toBe(true);
      await guest.call('room:join', { code: created.ok ? created.code : '', name: 'Watcher' });
      host.raw('game:emote', { emote: 'gg' });
      host.raw('game:emote', { emote: 'laugh' }); // inside the cooldown → dropped
      host.raw('game:emote', { emote: 'dance' }); // not an emote → ignored
      await waitFor(() => guest.emotes.length === 1 && host.emotes.length === 1, 1000, 'emote');
      await new Promise((r) => setTimeout(r, 50));
      expect(guest.emotes).toEqual([{ playerId: host.youId, emote: 'gg' }]);
    } finally {
      for (const c of clients.splice(0)) c.close();
      await slow.close();
    }
  });

  it('deletes the room once every human has left', async () => {
    const { host, code } = await createRoom('Last');
    await host.call('room:addBot', { level: 'easy' });
    await host.call('room:start');
    await waitFor(() => host.game, 1000, 'game');
    expect(server.manager.getRoom(code)).toBeDefined();
    await host.call('room:leave');
    expect(server.manager.getRoom(code)).toBeUndefined();
    const other = await client();
    expect(await other.call('room:join', { code, name: 'Late' })).toEqual({ ok: false, error: 'room_not_found' });
  });
});
