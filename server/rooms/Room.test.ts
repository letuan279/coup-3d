import { describe, expect, it } from 'vitest';
import { LOSE_INFLUENCE_SECONDS, MIN_PHASE_SETTLE_MS } from '@shared/constants';
import { getDeciders } from '@shared/engine';
import { createRng } from '@shared/rng';
import type { GameState, LoggedEvent, Move } from '@shared/types';
import { FakeClock } from '../testing/fakeClock';
import { FakeConnection } from '../testing/fakeConnection';
import { DEFAULT_TIMING, type ServerTiming } from '../timing';
import type { DecideBot } from './botDriver';
import { Room, type ClosedReason } from './Room';

const T = DEFAULT_TIMING;

interface Human {
  id: string;
  conn: FakeConnection;
  token: string;
}

function setup(opts: { decideBot?: DecideBot; timing?: ServerTiming; seed?: number } = {}) {
  const clock = new FakeClock();
  const released: string[] = [];
  /** Offline clients' pending "your seat is gone" reasons, by token. */
  const notices = new Map<string, ClosedReason>();
  let closedCount = 0;
  const room = new Room('ABCDE', {
    clock,
    rand: createRng(opts.seed ?? 7),
    timing: opts.timing ?? T,
    decideBot: opts.decideBot,
    onTokenReleased: (t, notice) => {
      released.push(t);
      if (notice) notices.set(t, notice);
    },
    onClosed: () => closedCount++,
    onError: (err) => {
      throw err;
    },
  });
  const join = (name: string, avatar?: Parameters<Room['join']>[2]['avatar']): Human => {
    const token = `token-${name}-${Math.random().toString(36).slice(2)}`;
    const conn = new FakeConnection(name);
    const res = room.join(token, conn, { name, avatar });
    if (!res.ok) throw new Error(`join failed: ${res.error}`);
    return { id: res.playerId, conn, token };
  };
  return { clock, room, released, notices, closed: () => closedCount, join };
}

function game(room: Room): GameState {
  const g = room.game;
  if (!g) throw new Error('no game');
  return g;
}

function player(room: Room, id: string) {
  const p = room.view(id).players.find((x) => x.id === id);
  if (!p) throw new Error(`no seat ${id}`);
  return p;
}

/** The seat's rejoin key, as its own client received it. */
function keyOf(h: Human): string {
  const key = h.conn.lastRoom?.rejoinKey;
  if (!key) throw new Error(`no rejoin key for ${h.id}`);
  return key;
}

function logTypes(events: readonly LoggedEvent[]): string[] {
  return events.map((e) => e.type);
}

describe('Room — lobby', () => {
  it('makes the creator host, dedupes names case-insensitively and honours free avatars', () => {
    const { room, join } = setup();
    const a = join('An', 'fox');
    const b = join('an', 'fox');
    const view = room.view(a.id);
    expect(view.hostId).toBe(a.id);
    expect(view.players.map((p) => p.name)).toEqual(['An', 'an 2']);
    expect(view.players[0].avatar).toBe('fox');
    expect(view.players[1].avatar).not.toBe('fox');
    expect(view.players.map((p) => p.seat)).toEqual([0, 1]);
    // Every member got a room:state addressed to themselves.
    expect(b.conn.lastRoom?.youId).toBe(b.id);
    expect(a.conn.lastRoom?.players).toHaveLength(2);
  });

  it('fills the lowest free seat and rejects a 7th player', () => {
    const { room, join } = setup();
    const host = join('Host');
    const others = ['B', 'C', 'D', 'E', 'F'].map((n) => join(n));
    expect(room.kick(host.id, others[1].id)).toEqual({ ok: true });
    const g = join('G');
    expect(player(room, g.id).seat).toBe(2);
    expect(room.addBot(host.id, 'easy')).toEqual({ ok: false, error: 'room_full' });
    expect(room.join('token-late-000', new FakeConnection(), { name: 'Late' })).toEqual({ ok: false, error: 'room_full' });
  });

  it('adds bots with a fun name and a free avatar (host only)', () => {
    const { room, join } = setup();
    const host = join('Host', 'pig');
    const guest = join('Guest');
    expect(room.addBot(guest.id, 'hard')).toEqual({ ok: false, error: 'not_host' });
    const res = room.addBot(host.id, 'hard');
    expect(res.ok).toBe(true);
    const bot = room.view(host.id).players.find((p) => p.kind === 'bot');
    expect(bot).toMatchObject({ kind: 'bot', botLevel: 'hard', connected: true, isHost: false });
    expect(bot?.name.length).toBeGreaterThan(0);
    expect(['pig', player(room, guest.id).avatar]).not.toContain(bot?.avatar);
  });

  it('validates settings: host only, allowed values only, lobby only', () => {
    const { room, join } = setup();
    const host = join('Host');
    const guest = join('Guest');
    expect(room.updateSettings(guest.id, { turnSeconds: 45 })).toEqual({ ok: false, error: 'not_host' });
    expect(room.updateSettings(host.id, { turnSeconds: 31 })).toEqual({ ok: false, error: 'bad_request' });
    expect(room.updateSettings(host.id, { responseSeconds: 9 })).toEqual({ ok: false, error: 'bad_request' });
    expect(room.updateSettings(host.id, { turnSeconds: 45, responseSeconds: 8 })).toEqual({ ok: true });
    expect(room.view(host.id).settings).toEqual({ turnSeconds: 45, responseSeconds: 8 });
    expect(guest.conn.lastRoom?.settings.turnSeconds).toBe(45);
    room.start(host.id);
    expect(room.updateSettings(host.id, { turnSeconds: 20 })).toEqual({ ok: false, error: 'game_in_progress' });
  });

  it('needs at least 2 seated players to start, host only', () => {
    const { room, join } = setup();
    const host = join('Host');
    expect(room.start(host.id)).toEqual({ ok: false, error: 'not_enough_players' });
    room.addBot(host.id, 'normal');
    const guest = join('Guest');
    expect(room.start(guest.id)).toEqual({ ok: false, error: 'not_host' });
    expect(room.start(host.id)).toEqual({ ok: true });
    expect(room.roomStatus).toBe('playing');
    expect(room.view(host.id).gameNumber).toBe(1);
    expect(room.start(host.id)).toEqual({ ok: false, error: 'game_in_progress' });
  });

  it('kicks humans (room:closed kicked, token released) and removes bots; never self', () => {
    const { room, join, released } = setup();
    const host = join('Host');
    const guest = join('Guest');
    room.addBot(host.id, 'easy');
    const botId = room.view(host.id).players.find((p) => p.kind === 'bot')!.id;
    expect(room.kick(guest.id, host.id)).toEqual({ ok: false, error: 'not_host' });
    expect(room.kick(host.id, host.id)).toEqual({ ok: false, error: 'bad_request' });
    expect(room.kick(host.id, 'nobody')).toEqual({ ok: false, error: 'bad_request' });
    expect(room.kick(host.id, guest.id)).toEqual({ ok: true });
    expect(guest.conn.closedReasons).toEqual(['kicked']);
    expect(released).toContain(guest.token);
    expect(room.kick(host.id, botId)).toEqual({ ok: true });
    expect(room.view(host.id).players.map((p) => p.id)).toEqual([host.id]);
  });

  it('passes host to the next connected human when the host leaves', () => {
    const { room, join, clock } = setup();
    const host = join('Host');
    const b = join('B');
    const c = join('C');
    room.detach(b.id, b.conn); // B is disconnected → C (connected) is preferred
    clock.advance(1000);
    expect(room.leave(host.id)).toEqual({ ok: true });
    expect(host.conn.closedReasons).toEqual(['left']);
    expect(room.view(c.id).hostId).toBe(c.id);
    expect(c.conn.lastRoom?.players.find((p) => p.id === c.id)?.isHost).toBe(true);
  });

  it('lets players rename (deduped) and change to a free avatar in the lobby', () => {
    const { room, join } = setup();
    const a = join('Alpha', 'cat');
    const b = join('Beta', 'owl');
    expect(room.updatePlayer(b.id, { name: 'ALPHA' })).toEqual({ ok: true });
    expect(player(room, b.id).name).toBe('ALPHA 2');
    expect(room.updatePlayer(b.id, { avatar: 'cat' })).toEqual({ ok: false, error: 'bad_request' });
    expect(room.updatePlayer(b.id, { avatar: 'frog' })).toEqual({ ok: true });
    expect(player(room, b.id).avatar).toBe('frog');
    room.addBot(a.id, 'easy');
    room.start(a.id);
    expect(room.updatePlayer(b.id, { name: 'Gamma' })).toEqual({ ok: false, error: 'game_in_progress' });
  });

  it('lets a player move to an empty seat (turn order), but not onto someone else', () => {
    const { room, join } = setup();
    const a = join('Alpha');
    const b = join('Beta');
    room.addBot(a.id, 'easy');
    const bot = room.view(a.id).players.find((p) => p.kind === 'bot')!;
    expect(player(room, b.id).seat).toBe(1);
    expect(room.updatePlayer(b.id, { seat: 4 })).toEqual({ ok: true });
    expect(player(room, b.id).seat).toBe(4);
    // Everyone is told; the list stays in seat order.
    expect(a.conn.lastRoom?.players.map((p) => p.seat)).toEqual([0, 2, 4]);
    expect(room.updatePlayer(a.id, { seat: 4 })).toEqual({ ok: false, error: 'seat_taken' });
    expect(room.updatePlayer(a.id, { seat: bot.seat })).toEqual({ ok: false, error: 'seat_taken' });
    expect(room.updatePlayer(a.id, { seat: 6 })).toEqual({ ok: false, error: 'bad_request' });
    expect(room.updatePlayer(b.id, { seat: 4 })).toEqual({ ok: true }); // own seat: no-op
    // A newcomer takes the lowest free seat — the one Beta left.
    const c = join('Gamma');
    expect(player(room, c.id).seat).toBe(1);
    // The game follows the chosen order.
    expect(room.start(a.id)).toEqual({ ok: true });
    expect(game(room).players.map((p) => p.id)).toEqual([a.id, c.id, bot.id, b.id]);
    expect(room.updatePlayer(b.id, { seat: 5 })).toEqual({ ok: false, error: 'game_in_progress' });
  });

  it('removes a disconnected lobby player after the grace period unless they come back', () => {
    const { room, join, clock, released, notices } = setup();
    const host = join('Host');
    const b = join('B');
    const c = join('C');
    room.detach(b.id, b.conn);
    room.detach(c.id, c.conn);
    expect(player(room, b.id).connected).toBe(false);
    clock.advance(T.lobbyDisconnectRemoveMs / 2);
    const back = new FakeConnection('b2');
    room.attach(b.id, back);
    clock.advance(T.lobbyDisconnectRemoveMs);
    const ids = room.view(host.id).players.map((p) => p.id);
    expect(ids).toEqual([host.id, b.id]);
    expect(released).toEqual([c.token]);
    // Removed for being offline too long → 'expired' (a voluntary leave stays 'left').
    expect(notices.get(c.token)).toBe('expired');
    expect(back.lastRoom?.youId).toBe(b.id);
  });

  it('closes immediately when the last human leaves, even with bots seated', () => {
    const { room, join, closed, released } = setup();
    const host = join('Host');
    room.addBot(host.id, 'easy');
    room.leave(host.id);
    expect(closed()).toBe(1);
    expect(room.isClosed).toBe(true);
    expect(released).toEqual([host.token]);
    expect(room.join('token-new-000', new FakeConnection(), { name: 'X' })).toEqual({
      ok: false,
      error: 'room_not_found',
    });
  });

  it('closes after EMPTY_ROOM_DELETE_MS without any connected human', () => {
    const { room, join, clock, closed } = setup();
    const host = join('Host');
    room.addBot(host.id, 'easy');
    room.start(host.id);
    room.detach(host.id, host.conn);
    clock.advance(T.emptyRoomDeleteMs - 1);
    expect(closed()).toBe(0);
    clock.advance(1);
    expect(closed()).toBe(1);
    expect(clock.pending).toBe(0);
  });

  it('closes once a lone disconnected lobby host has been removed', () => {
    const { room, join, clock, closed } = setup();
    const host = join('Host');
    room.detach(host.id, host.conn);
    clock.advance(T.lobbyDisconnectRemoveMs - 1);
    expect(closed()).toBe(0);
    clock.advance(1);
    expect(closed()).toBe(1);
  });

  it('keeps the room when a human reconnects before the empty-room deadline', () => {
    const { room, join, clock, closed } = setup();
    const host = join('Host');
    room.addBot(host.id, 'easy');
    room.start(host.id);
    room.detach(host.id, host.conn);
    clock.advance(T.emptyRoomDeleteMs - 10);
    room.attach(host.id, new FakeConnection());
    clock.advance(T.emptyRoomDeleteMs);
    expect(closed()).toBe(0);
  });
});

describe('Room — game loop', () => {
  function twoHumans(opts: Parameters<typeof setup>[0] = {}) {
    const s = setup(opts);
    const a = s.join('Alice');
    const b = s.join('Bob');
    expect(s.room.start(a.id)).toEqual({ ok: true });
    const byId = new Map([
      [a.id, a],
      [b.id, b],
    ]);
    return { ...s, a, b, byId };
  }

  it('pushes the initial state with the deal events and a deadline', () => {
    const { a, b, clock } = twoHumans();
    for (const h of [a, b]) {
      const st = h.conn.lastGame!;
      expect(st.resync).toBe(false);
      expect(logTypes(st.events)).toEqual(['game_start', 'turn_start']);
      expect(st.view.viewerId).toBe(h.id);
      expect(st.view.phaseDurationMs).toBe(30_000);
      expect(st.view.deadline).toBe(clock.now() + 30_000);
      expect(st.view.serverNow).toBe(clock.now());
    }
    expect(a.conn.lastRoom?.status).toBe('playing');
  });

  it('applies the default move for the actor when the turn timer runs out', () => {
    const { room, clock, byId } = twoHumans();
    const g0 = game(room);
    const actor = g0.actorId;
    clock.advance(29_999);
    expect(game(room).phaseSeq).toBe(g0.phaseSeq);
    clock.advance(1);
    const g1 = game(room);
    const newEvents = g1.log.slice(g0.log.length);
    expect(newEvents[0]).toMatchObject({ type: 'timeout', playerId: actor, phase: 'turn' });
    expect(newEvents[1]).toMatchObject({ type: 'action', actorId: actor, action: 'income' });
    expect(g1.actorId).not.toBe(actor);
    // The pushed delta starts right after what the client already had.
    const pushed = byId.get(actor)!.conn.lastGame!;
    expect(pushed.events.map((e) => e.seq)).toEqual(newEvents.map((e) => e.seq));
    expect(pushed.view.deadline).toBe(clock.now() + 30_000);
  });

  it('times out every remaining responder with a pass', () => {
    const { room, clock, byId } = twoHumans();
    const g0 = game(room);
    const actor = g0.actorId;
    expect(room.move(actor, { type: 'action', action: 'tax' }, g0.phaseSeq)).toEqual({ ok: true });
    const other = [...byId.keys()].find((id) => id !== actor)!;
    expect(game(room).phase.kind).toBe('action_response');
    expect(byId.get(other)!.conn.lastGame!.view.prompt?.kind).toBe('respond_action');
    expect(byId.get(other)!.conn.lastGame!.view.phaseDurationMs).toBe(12_000);
    clock.advance(12_000);
    const g = game(room);
    const types = logTypes(g.log);
    expect(types).toContain('timeout');
    expect(g.log.find((e) => e.type === 'timeout')).toMatchObject({ playerId: other, phase: 'action_response' });
    expect(g.log.some((e) => e.type === 'action_resolved' && e.action === 'tax')).toBe(true);
    expect(g.phase.kind).toBe('turn');
  });

  it('uses LOSE_INFLUENCE_SECONDS for influence choices', () => {
    const { room, byId, clock } = twoHumans();
    const g0 = game(room);
    const actor = g0.actorId;
    const other = [...byId.keys()].find((id) => id !== actor)!;
    room.move(actor, { type: 'action', action: 'tax' }, g0.phaseSeq);
    room.move(other, { type: 'challenge' }, game(room).phaseSeq);
    const g = game(room);
    expect(g.phase.kind).toBe('lose_influence');
    const loser = g.phase.kind === 'lose_influence' ? g.phase.playerId : '';
    expect(byId.get(loser)!.conn.lastGame!.view.phaseDurationMs).toBe(LOSE_INFLUENCE_SECONDS * 1000);
    clock.advance(LOSE_INFLUENCE_SECONDS * 1000);
    expect(game(room).log.some((e) => e.type === 'influence_lost' && e.playerId === loser)).toBe(true);
  });

  it('rejects stale phaseSeq and moves from non-deciders', () => {
    const { room, byId } = twoHumans();
    const g0 = game(room);
    const actor = g0.actorId;
    const other = [...byId.keys()].find((id) => id !== actor)!;
    expect(room.move(actor, { type: 'action', action: 'income' }, g0.phaseSeq - 1)).toEqual({
      ok: false,
      error: 'stale_phase',
    });
    expect(room.move(other, { type: 'action', action: 'income' }, g0.phaseSeq)).toEqual({
      ok: false,
      error: 'not_your_decision',
    });
    expect(room.move(actor, { type: 'action', action: 'coup', targetId: other }, g0.phaseSeq)).toEqual({
      ok: false,
      error: 'not_enough_coins',
    });
    expect(game(room).phaseSeq).toBe(g0.phaseSeq);
  });

  it('bots act after their think time, never before the phase settled nor after the deadline', () => {
    const timing: ServerTiming = { ...T, botThinkMs: { ...T.botThinkMs, easy: [100, 200] } };
    const { room, join, clock } = setup({ timing });
    const host = join('Host');
    room.addBot(host.id, 'easy');
    room.start(host.id);
    const botId = room.view(host.id).players.find((p) => p.kind === 'bot')!.id;
    // Make sure it is the bot's turn.
    if (game(room).actorId !== botId) room.move(host.id, { type: 'action', action: 'income' }, game(room).phaseSeq);
    const seq = game(room).phaseSeq;
    expect(game(room).actorId).toBe(botId);
    clock.advance(MIN_PHASE_SETTLE_MS - 1);
    expect(game(room).phaseSeq).toBe(seq); // think time (≤200) is shorter than the settle time
    clock.advance(1);
    expect(game(room).phaseSeq).toBeGreaterThan(seq);
    expect(game(room).log.some((e) => e.type === 'timeout')).toBe(false);
  });

  it('falls back to the default move when the bot AI throws', () => {
    const decideBot: DecideBot = () => {
      throw new Error('boom');
    };
    const { room, join, clock } = setup({ decideBot });
    const host = join('Host');
    room.addBot(host.id, 'normal');
    room.start(host.id);
    const botId = room.view(host.id).players.find((p) => p.kind === 'bot')!.id;
    if (game(room).actorId !== botId) room.move(host.id, { type: 'action', action: 'income' }, game(room).phaseSeq);
    const before = game(room).log.length;
    clock.advance(T.botThinkMs.normal[1]);
    const events = game(room).log.slice(before);
    expect(events[0]).toMatchObject({ type: 'action', actorId: botId, action: 'income' });
    expect(events.some((e) => e.type === 'timeout')).toBe(false);
  });

  it('disconnect → defaults on timeout → bot takeover after the grace period → reconnect restores control', () => {
    const { room, a, b, clock } = twoHumans();
    room.detach(b.id, b.conn);
    expect(a.conn.lastRoom?.players.find((p) => p.id === b.id)).toMatchObject({ connected: false, botControlled: false });

    clock.advance(T.reconnectGraceMs - 1);
    expect(player(room, b.id).botControlled).toBe(false);
    clock.advance(1);
    expect(player(room, b.id).botControlled).toBe(true);
    expect(a.conn.lastRoom?.players.find((p) => p.id === b.id)?.botControlled).toBe(true);

    // While bot-controlled, B's decisions are made before the deadline (no more timeouts for B).
    const mark = game(room).log.length;
    const bActed = () => game(room).log.slice(mark).some((e) => e.type === 'action' && e.actorId === b.id);
    clock.runUntil(() => bActed() || room.roomStatus !== 'playing', 120_000);
    expect(bActed()).toBe(true);
    expect(game(room).log.slice(mark).some((e) => e.type === 'timeout' && e.playerId === b.id)).toBe(false);

    const back = new FakeConnection('bob-again');
    room.attach(b.id, back);
    expect(player(room, b.id)).toMatchObject({ connected: true, botControlled: false });
    const resync = back.lastGame!;
    expect(resync.resync).toBe(true);
    expect(resync.events).toEqual([]);
    expect(resync.view.viewerId).toBe(b.id);
    expect(back.lastRoom?.youId).toBe(b.id);
  });

  it('leave mid-game → seat left + bot-controlled; only its rejoin key reclaims it', () => {
    const { room, a, b, released } = twoHumans();
    const bKey = keyOf(b);
    expect(room.leave(b.id)).toEqual({ ok: true });
    expect(b.conn.closedReasons).toEqual(['left']);
    expect(released).toContain(b.token);
    expect(player(room, b.id)).toMatchObject({ left: true, botControlled: true, connected: false });
    expect(a.conn.lastRoom?.players.find((p) => p.id === b.id)?.left).toBe(true);

    // The owner's name is public: it proves nothing.
    const stranger = new FakeConnection('stranger');
    expect(room.join('token-stranger-1', stranger, { name: 'BOB' })).toEqual({ ok: false, error: 'game_in_progress' });
    expect(room.join('token-stranger-1', stranger, { name: 'Bob', rejoinKey: 'A'.repeat(16) })).toEqual({
      ok: false,
      error: 'bad_rejoin_key',
    });
    expect(stranger.sent).toEqual([]);
    expect(player(room, b.id)).toMatchObject({ left: true, botControlled: true });

    const back = new FakeConnection('bob-new-device');
    const res = room.join('token-bob-new-1', back, { rejoinKey: bKey });
    expect(res).toEqual({ ok: true, playerId: b.id });
    expect(player(room, b.id)).toMatchObject({ left: false, botControlled: false, connected: true });
    expect(room.playerIdForToken('token-bob-new-1')).toBe(b.id);
    expect(back.lastGame?.resync).toBe(true);
    expect(back.lastRoom).toMatchObject({ youId: b.id, rejoinKey: bKey });
  });

  it('a reclaimed left seat is played by its human again, not by the bot', () => {
    const { room, a, b, clock } = twoHumans();
    const bKey = keyOf(b);
    room.leave(b.id);
    const back = new FakeConnection('bob-back');
    room.join('token-bob-back-1', back, { rejoinKey: bKey });
    // Make it B's turn, then give a bot more than its maximum think time: nothing may happen.
    if (game(room).actorId !== b.id) room.move(a.id, { type: 'action', action: 'income' }, game(room).phaseSeq);
    const g0 = game(room);
    expect(g0.actorId).toBe(b.id);
    clock.advance(Math.max(T.botThinkMs.normal[1], MIN_PHASE_SETTLE_MS) + 1);
    expect(game(room).phaseSeq).toBe(g0.phaseSeq);
    expect(back.lastGame?.view.prompt?.kind).toBe('choose_action');
    expect(room.move(b.id, { type: 'action', action: 'income' }, g0.phaseSeq)).toEqual({ ok: true });
  });

  it('reclaims a disconnected seat with its key from a new token: full private resync, old token told "replaced"', () => {
    const { room, b, released, notices, clock } = twoHumans();
    const bKey = keyOf(b);
    room.detach(b.id, b.conn);
    // No key / someone else's guess: refused, and nothing about the game is sent.
    const hijacker = new FakeConnection('hijacker');
    expect(room.join('token-hijacker1', hijacker, { name: 'bob' })).toEqual({ ok: false, error: 'game_in_progress' });
    expect(room.join('token-hijacker1', hijacker, { name: 'bob', rejoinKey: bKey.slice(0, -1) })).toEqual({
      ok: false,
      error: 'bad_rejoin_key',
    });
    expect(hijacker.sent).toEqual([]);

    const phone = new FakeConnection('bob-phone');
    expect(room.join('token-bob-phone', phone, { name: 'Whatever', rejoinKey: bKey })).toEqual({ ok: true, playerId: b.id });
    expect(released).toContain(b.token);
    expect(notices.get(b.token)).toBe('replaced');
    expect(room.playerIdForToken(b.token)).toBeNull();
    expect(room.playerIdForToken('token-bob-phone')).toBe(b.id);
    expect(player(room, b.id).name).toBe('Bob'); // the profile is ignored on a reclaim
    const st = phone.lastGame!;
    expect(st).toMatchObject({ resync: true, events: [] });
    expect(st.view.viewerId).toBe(b.id);
    const own = game(room).players.find((p) => p.id === b.id)!;
    expect(st.view.players.find((p) => p.id === b.id)!.influences.map((i) => i.character)).toEqual(
      own.influences.map((i) => i.card.character),
    );
    // The pending bot takeover was cancelled.
    clock.advance(T.reconnectGraceMs);
    expect(player(room, b.id)).toMatchObject({ connected: true, botControlled: false });
  });

  it('reclaims a bot-controlled seat after the grace period', () => {
    const { room, b, clock } = twoHumans();
    const bKey = keyOf(b);
    room.detach(b.id, b.conn);
    clock.advance(T.reconnectGraceMs);
    expect(player(room, b.id).botControlled).toBe(true);
    const phone = new FakeConnection('bob-phone');
    expect(room.join('token-bob-phone2', phone, { rejoinKey: bKey })).toEqual({ ok: true, playerId: b.id });
    expect(player(room, b.id)).toMatchObject({ connected: true, botControlled: false, left: false });
  });

  it('reclaims a still-connected seat with its key: the other socket is told "replaced"', () => {
    const { room, a, b } = twoHumans();
    const bKey = keyOf(b);
    // A connected seat is never reclaimable without the key.
    expect(room.join('token-bob-third', new FakeConnection(), { name: 'Bob' })).toEqual({
      ok: false,
      error: 'game_in_progress',
    });
    const laptop = new FakeConnection('bob-laptop');
    expect(room.join('token-bob-laptop', laptop, { rejoinKey: bKey })).toEqual({ ok: true, playerId: b.id });
    expect(b.conn.closedReasons).toEqual(['replaced']);
    expect(room.playerIdForToken(b.token)).toBeNull();
    expect(laptop.lastGame?.view.viewerId).toBe(b.id);
    expect(player(room, b.id).connected).toBe(true);
    // Alice's own key reclaims only Alice's seat — never somebody else's.
    const aKey = keyOf(a);
    const aTab = new FakeConnection('alice-tab');
    expect(room.join('token-alice-tab', aTab, { rejoinKey: aKey })).toEqual({ ok: true, playerId: a.id });
    expect(room.playerIdForToken('token-bob-laptop')).toBe(b.id);
  });

  it('gives each human seat its own key and sends it only to that seat', () => {
    const { room, join } = setup();
    const a = join('Alice');
    const b = join('Bob');
    room.addBot(a.id, 'easy');
    room.start(a.id);
    const aKey = keyOf(a);
    const bKey = keyOf(b);
    expect(aKey).toMatch(/^[A-Za-z0-9_-]{16}$/);
    expect(bKey).toMatch(/^[A-Za-z0-9_-]{16}$/);
    expect(aKey).not.toBe(bKey);
    const botId = room.view(a.id).players.find((p) => p.kind === 'bot')!.id;
    expect(room.view(botId).rejoinKey).toBeUndefined();
    expect(room.view('').rejoinKey).toBeUndefined();
    for (const [me, other] of [
      [a, bKey],
      [b, aKey],
    ] as const) {
      const everything = JSON.stringify(me.conn.sent);
      expect(everything).not.toContain(other);
      for (const [st] of me.conn.of('game:state')) expect(JSON.stringify(st)).not.toContain(keyOf(me));
    }
  });

  it('a valid key reclaims the seat in the lobby too (no duplicate "Bob 2"); the old socket is told "replaced"', () => {
    const { room, join, released } = setup();
    const host = join('Host');
    const b = join('Bob');
    const bKey = keyOf(b);
    const phone = new FakeConnection('bob-phone');
    expect(room.join('token-bob-other', phone, { name: 'Whatever', rejoinKey: bKey })).toEqual({ ok: true, playerId: b.id });
    expect(room.view(host.id).players.map((p) => p.name)).toEqual(['Host', 'Bob']);
    expect(b.conn.closedReasons).toEqual(['replaced']);
    expect(released).toContain(b.token);
    expect(room.playerIdForToken('token-bob-other')).toBe(b.id);
    // Like any attach with no game running: game:cleared first, then the room with the same key.
    expect(phone.sent.map((e) => e.event)).toEqual(['game:cleared', 'room:state']);
    expect(phone.lastRoom).toMatchObject({ youId: b.id, status: 'lobby', rejoinKey: bKey });
    // Without a name the key alone is enough.
    expect(room.join('token-bob-third', new FakeConnection(), { rejoinKey: bKey })).toEqual({ ok: true, playerId: b.id });
  });

  it('lobby: the owner of a disconnected seat gets it back (no ghost dealt in), even in a full room', () => {
    const { room, join, clock } = setup();
    const host = join('Host');
    const b = join('Bob');
    const bKey = keyOf(b);
    for (let i = 0; i < 4; i++) room.addBot(host.id, 'easy');
    expect(room.playerCount).toBe(6);
    room.detach(b.id, b.conn);
    const phone = new FakeConnection('bob-phone');
    expect(room.join('token-bob-phone', phone, { name: 'Bob', rejoinKey: bKey })).toEqual({ ok: true, playerId: b.id });
    expect(room.playerCount).toBe(6);
    // The lobby-removal timer of the offline seat was cancelled.
    clock.advance(T.lobbyDisconnectRemoveMs * 2);
    expect(player(room, b.id)).toMatchObject({ name: 'Bob', connected: true });
    expect(room.start(host.id)).toEqual({ ok: true });
    expect(game(room).players.filter((p) => p.id === b.id)).toHaveLength(1);
    expect(room.view(host.id).players.find((p) => p.id === b.id)).toMatchObject({ connected: true, botControlled: false });
  });

  it('lobby: a key that matches no seat is a normal join only when a name comes with it', () => {
    const { room, join } = setup();
    const host = join('Host');
    const stale = 'A'.repeat(16);
    const res = room.join('token-new-guest', new FakeConnection(), { name: 'Bob', rejoinKey: stale });
    expect(res.ok).toBe(true);
    expect(room.view(host.id).players.map((p) => p.name)).toEqual(['Host', 'Bob']);
    const nameless = new FakeConnection('nameless');
    expect(room.join('token-nameless', nameless, { rejoinKey: stale })).toEqual({ ok: false, error: 'bad_rejoin_key' });
    expect(nameless.sent).toEqual([]);
    // No key, no name: still a malformed lobby join.
    expect(room.join('token-nameless', nameless, {})).toEqual({ ok: false, error: 'bad_request' });
  });

  it('reclaims a seat that was left after the game ended; backToLobby keeps it', () => {
    const { room, join, clock } = setup({ seed: 5 });
    const host = join('Host');
    const guest = join('Guest');
    room.addBot(host.id, 'easy');
    room.start(host.id);
    clock.runUntil(() => room.roomStatus === 'finished', 6 * 3_600_000);
    const key = keyOf(guest);
    room.leave(guest.id);
    expect(player(room, guest.id)).toMatchObject({ left: true, botControlled: false });
    const back = new FakeConnection('guest-back');
    expect(room.join('token-guest-back', back, { rejoinKey: key })).toEqual({ ok: true, playerId: guest.id });
    expect(player(room, guest.id)).toMatchObject({ left: false, connected: true });
    expect(back.lastGame?.view.phase.kind).toBe('game_over');
    expect(room.backToLobby(host.id)).toEqual({ ok: true });
    expect(room.view(host.id).players.some((p) => p.id === guest.id)).toBe(true);
  });

  it('passes host when the host leaves mid-game and deletes the room once every human left', () => {
    const { room, a, b, closed } = twoHumans();
    room.leave(a.id);
    expect(room.view(b.id).hostId).toBe(b.id);
    expect(closed()).toBe(0);
    room.leave(b.id);
    expect(closed()).toBe(1);
  });

  it('hands the host role over when the host is taken over by a bot', () => {
    const { room, a, b, clock } = twoHumans();
    room.detach(a.id, a.conn);
    clock.advance(T.reconnectGraceMs);
    expect(room.view(b.id).hostId).toBe(b.id);
  });

  it('plays a full game, counts the win, then backToLobby drops departed humans and keeps bots', () => {
    const { room, join, clock } = setup({ seed: 99 });
    const host = join('Host');
    const quitter = join('Quitter');
    room.addBot(host.id, 'easy');
    room.addBot(host.id, 'hard');
    room.start(host.id);
    room.leave(quitter.id);

    const pushedSeqs: number[] = [];
    const seen = host.conn.of('game:state').length;
    const done = clock.runUntil(() => room.roomStatus === 'finished', 6 * 3_600_000);
    expect(done).toBe(true);
    for (const [st] of host.conn.of('game:state').slice(seen)) pushedSeqs.push(...st.events.map((e) => e.seq));
    // Deltas are contiguous: no event is skipped or sent twice.
    for (let i = 1; i < pushedSeqs.length; i++) expect(pushedSeqs[i]).toBe(pushedSeqs[i - 1] + 1);

    const g = game(room);
    expect(g.phase.kind).toBe('game_over');
    const winner = room.view(host.id).players.find((p) => p.id === g.winnerId)!;
    expect(winner.wins).toBe(1);
    expect(host.conn.lastRoom?.status).toBe('finished');
    expect(host.conn.lastGame?.view.deadline).toBeNull();
    expect(clock.pending).toBeLessThanOrEqual(3); // at most a few pending emote timers

    expect(room.start(host.id)).toEqual({ ok: false, error: 'game_in_progress' });
    expect(room.backToLobby(host.id)).toEqual({ ok: true });
    expect(host.conn.of('game:cleared')).toHaveLength(1);
    const view = room.view(host.id);
    expect(view.status).toBe('lobby');
    expect(view.players.map((p) => p.kind)).toEqual(['human', 'bot', 'bot']);
    expect(view.players.some((p) => p.id === quitter.id)).toBe(false);
    expect(room.game).toBeNull();
    expect(room.start(host.id)).toEqual({ ok: true });
    expect(room.view(host.id).gameNumber).toBe(2);
  });

  it('hands the host role to a present human when the game ends with the host away', () => {
    const { room, join, clock } = setup({ seed: 5 });
    const host = join('Host');
    const guest = join('Guest');
    room.addBot(host.id, 'normal');
    room.start(host.id);
    room.detach(host.id, host.conn);
    clock.advance(1000); // still within the grace period: host keeps the role while playing
    expect(room.view(guest.id).hostId).toBe(host.id);
    clock.runUntil(() => room.roomStatus === 'finished', 6 * 3_600_000);
    expect(room.view(guest.id).hostId).toBe(guest.id);
    expect(room.backToLobby(guest.id)).toEqual({ ok: true });
  });

  it('hands the host role to a returning human when the game ended while every human was offline', () => {
    // Long empty-room timeout so the bots can finish the game while nobody is connected.
    const timing: ServerTiming = { ...T, emptyRoomDeleteMs: 24 * 3_600_000 };
    const { room, join, clock } = setup({ seed: 13, timing });
    const host = join('Host');
    const guest = join('Guest');
    room.addBot(host.id, 'easy');
    room.addBot(host.id, 'easy');
    room.start(host.id);
    room.detach(host.id, host.conn);
    room.detach(guest.id, guest.conn);
    expect(clock.runUntil(() => room.roomStatus === 'finished', 6 * 3_600_000)).toBe(true);
    expect(room.view(guest.id).hostId).toBe(host.id); // nobody was here to take it

    const back = new FakeConnection('guest-back');
    room.attach(guest.id, back);
    expect(back.lastRoom?.hostId).toBe(guest.id);
    expect(room.backToLobby(guest.id)).toEqual({ ok: true });
  });

  it('keeps the host role when the host is the one who comes back after game over', () => {
    const timing: ServerTiming = { ...T, emptyRoomDeleteMs: 24 * 3_600_000 };
    const { room, join, clock } = setup({ seed: 13, timing });
    const host = join('Host');
    const guest = join('Guest');
    room.addBot(host.id, 'easy');
    room.start(host.id);
    room.detach(host.id, host.conn);
    room.detach(guest.id, guest.conn);
    expect(clock.runUntil(() => room.roomStatus === 'finished', 6 * 3_600_000)).toBe(true);
    room.attach(host.id, new FakeConnection('host-back'));
    expect(room.view(host.id).hostId).toBe(host.id);
    // …and the guest arriving afterwards does not take it away from a present host.
    room.attach(guest.id, new FakeConnection('guest-back'));
    expect(room.view(host.id).hostId).toBe(host.id);
  });

  it('sends game:cleared (before room:state) to a client that reconnects after the room went back to the lobby', () => {
    const { room, join, clock } = setup({ seed: 9 });
    const host = join('Host');
    const guest = join('Guest');
    room.addBot(host.id, 'easy');
    room.start(host.id);
    expect(clock.runUntil(() => room.roomStatus === 'finished', 6 * 3_600_000)).toBe(true);
    room.detach(guest.id, guest.conn); // drops on the game-over screen…
    clock.advance(1000);
    expect(room.backToLobby(host.id)).toEqual({ ok: true }); // …and misses the live game:cleared
    expect(guest.conn.of('game:cleared')).toHaveLength(0);
    clock.advance(4000);

    const back = new FakeConnection('guest-back');
    room.attach(guest.id, back);
    const events = back.sent.map((e) => e.event);
    expect(events).toContain('game:cleared');
    expect(events).not.toContain('game:state');
    expect(events.indexOf('game:cleared')).toBeLessThan(events.indexOf('room:state'));
    expect(back.lastRoom?.status).toBe('lobby');
  });

  it('does not send game:cleared when re-attaching to a running game (full resync instead)', () => {
    const { room, b } = twoHumans();
    room.detach(b.id, b.conn);
    const back = new FakeConnection('bob-back');
    room.attach(b.id, back);
    expect(back.of('game:cleared')).toHaveLength(0);
    expect(back.lastGame?.resync).toBe(true);
  });

  it('rejects backToLobby while playing or from non-hosts', () => {
    const { room, a, b } = twoHumans();
    expect(room.backToLobby(b.id)).toEqual({ ok: false, error: 'not_host' });
    expect(room.backToLobby(a.id)).toEqual({ ok: false, error: 'game_in_progress' });
  });

  it('lets the host reset a running game back to the lobby (no win, departed humans dropped)', () => {
    const { room, join, clock } = setup();
    const host = join('Host');
    const guest = join('Guest');
    const quitter = join('Quitter');
    room.addBot(host.id, 'normal');
    expect(room.resetGame(host.id)).toEqual({ ok: false, error: 'bad_request' }); // lobby
    expect(room.start(host.id)).toEqual({ ok: true });
    clock.advance(1000);
    room.leave(quitter.id);
    expect(room.resetGame(guest.id)).toEqual({ ok: false, error: 'not_host' });
    expect(room.resetGame(host.id)).toEqual({ ok: true });
    expect(room.roomStatus).toBe('lobby');
    expect(room.game).toBeNull();
    for (const h of [host, guest]) {
      expect(h.conn.of('game:cleared').at(-1)).toEqual([{ reason: 'reset' }]);
      expect(h.conn.lastRoom?.status).toBe('lobby');
    }
    const players = room.view(host.id).players;
    expect(players.map((p) => p.name)).toEqual(['Host', 'Guest', expect.any(String)]);
    expect(players.every((p) => p.wins === 0 && !p.botControlled)).toBe(true);
    // Bots stop playing: no timers left that touch the old game.
    clock.advance(10 * 60_000);
    expect(room.roomStatus).toBe('lobby');
    expect(room.start(host.id)).toEqual({ ok: true });
  });

  it('never pushes another player’s hidden characters', () => {
    const { room, join, clock } = setup({ seed: 3 });
    const host = join('Host');
    const guest = join('Guest');
    room.addBot(host.id, 'normal');
    room.addBot(host.id, 'hard');
    room.start(host.id);
    // Guest answers every prompt with its first legal move, host lets timers run out.
    const act = () => {
      const v = guest.conn.lastGame?.view;
      if (!v?.prompt) return;
      const p = v.prompt;
      let move: Move;
      if (p.kind === 'choose_action') {
        const opt = p.options.find((o) => o.enabled && o.action !== 'income') ?? p.options.find((o) => o.enabled)!;
        move = { type: 'action', action: opt.action, ...(opt.targets[0] ? { targetId: opt.targets[0] } : {}) };
      } else if (p.kind === 'respond_action' || p.kind === 'respond_block') move = { type: 'challenge' };
      else if (p.kind === 'lose_influence') move = { type: 'reveal', slot: p.slots[0] };
      else move = { type: 'exchange', keep: Array.from({ length: p.keepCount }, (_, i) => i) };
      const res = room.move(guest.id, move, v.phaseSeq);
      if (!res.ok && res.error !== 'stale_phase' && res.error !== 'not_your_decision') {
        // Challenge is not always allowed — fall back to pass.
        room.move(guest.id, { type: 'pass' }, v.phaseSeq);
      }
    };
    clock.runUntil(() => {
      act();
      return room.roomStatus === 'finished';
    }, 6 * 3_600_000);
    expect(room.roomStatus).toBe('finished');

    for (const h of [host, guest]) {
      for (const [st] of h.conn.of('game:state')) {
        for (const p of st.view.players) {
          if (p.id === h.id) continue;
          for (const inf of p.influences) if (!inf.revealed) expect(inf.character).toBeNull();
        }
        const json = JSON.stringify(st);
        expect(json).not.toMatch(/"id":"c\d+"/);
        expect(json).not.toContain('rngState');
        expect(json).not.toContain('"deck"');
      }
    }
  });

  it('rate-limits emotes per player and relays them to everyone', () => {
    const { room, a, b, clock } = twoHumans();
    expect(room.emote(a.id, 'laugh')).toEqual({ ok: true });
    expect(room.emote(a.id, 'laugh')).toEqual({ ok: false, error: 'rate_limited' });
    expect(b.conn.of('game:emote')).toEqual([[{ playerId: a.id, emote: 'laugh' }]]);
    expect(a.conn.of('game:emote')).toHaveLength(1);
    clock.advance(T.emoteCooldownMs);
    expect(room.emote(a.id, 'gg')).toEqual({ ok: true });
  });

  it('bots only act while they are deciders and stop when the game is cleared', () => {
    const { room, join, clock } = setup();
    const host = join('Host');
    room.addBot(host.id, 'normal');
    room.addBot(host.id, 'normal');
    room.start(host.id);
    clock.runUntil(() => room.roomStatus === 'finished', 6 * 3_600_000);
    const g = game(room);
    expect(getDeciders(g)).toEqual([]);
    room.backToLobby(host.id);
    clock.advance(60_000);
    expect(clock.pending).toBe(0);
  });
});
