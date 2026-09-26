import { describe, expect, it } from 'vitest';
import { createRng } from '@shared/rng';
import { FakeClock } from '../testing/fakeClock';
import { FakeConnection } from '../testing/fakeConnection';
import { DEFAULT_TIMING } from '../timing';
import { RoomManager } from './RoomManager';

function setup() {
  const clock = new FakeClock();
  const manager = new RoomManager({
    clock,
    rand: createRng(11),
    timing: DEFAULT_TIMING,
    onError: (err) => {
      throw err;
    },
  });
  const connect = (token: string) => {
    const conn = new FakeConnection(token);
    manager.connect(token, conn);
    return conn;
  };
  return { clock, manager, connect };
}

function code(res: { ok: boolean }): string {
  if (!res.ok || !('code' in res)) throw new Error('expected a room code');
  return String(res.code);
}

describe('RoomManager', () => {
  it('creates rooms with unique 5-char codes and joins case-insensitively', () => {
    const { manager, connect } = setup();
    connect('token-a-0001');
    connect('token-b-0001');
    const c = code(manager.createRoom('token-a-0001', { name: 'A' }));
    expect(c).toMatch(/^[A-HJ-NP-Z2-9]{5}$/);
    expect(manager.getRoom(c.toLowerCase())).toBeDefined();
    expect(manager.joinRoom('token-b-0001', c, { name: 'B' })).toEqual({ ok: true, code: c });
    expect(manager.joinRoom('token-b-0001', 'QQQQQ', { name: 'B' })).toEqual({ ok: false, error: 'room_not_found' });
    expect(manager.joinRoom('token-b-0001', null, { name: 'B' })).toEqual({ ok: false, error: 'room_not_found' });
    expect(manager.seatOf('token-b-0001')?.room.code).toBe(c);
  });

  it('requires a connection and a seat for room actions', () => {
    const { manager, connect } = setup();
    expect(manager.createRoom('token-ghost-01', { name: 'Ghost' })).toEqual({ ok: false, error: 'bad_request' });
    connect('token-lonely-1');
    expect(manager.start('token-lonely-1')).toEqual({ ok: false, error: 'not_in_room' });
    expect(manager.move('token-lonely-1', { type: 'pass' }, 1)).toEqual({ ok: false, error: 'not_in_room' });
    expect(manager.emote('token-lonely-1', 'gg')).toEqual({ ok: false, error: 'not_in_room' });
  });

  it('tells a client claiming an unknown room (e.g. after a server restart) that the room is gone', () => {
    const { manager } = setup();
    const conn = new FakeConnection('token-restart1');
    manager.connect('token-restart1', conn, 'ABCDE');
    expect(conn.closedReasons).toEqual(['room_deleted']);
    const fresh = new FakeConnection('token-fresh-01');
    manager.connect('token-fresh-01', fresh);
    expect(fresh.closedReasons).toEqual([]);
  });

  it('replaces an older connection for the same token and resumes the seat on the new one', () => {
    const { manager, connect } = setup();
    const first = connect('token-same-01');
    const c = code(manager.createRoom('token-same-01', { name: 'A' }));
    const second = connect('token-same-01');
    expect(first.closedReasons).toEqual(['replaced']);
    expect(first.closed).toBe(true);
    expect(second.lastRoom?.code).toBe(c);
    // The stale socket's disconnect must not mark the seat offline.
    manager.disconnect('token-same-01', first);
    const room = manager.getRoom(c)!;
    expect(room.view('').players[0].connected).toBe(true);
    manager.disconnect('token-same-01', second);
    expect(room.view('').players[0].connected).toBe(false);
  });

  it('moves a player to the new room when they create/join another one', () => {
    const { manager, connect } = setup();
    const a = connect('token-a-0002');
    connect('token-b-0002');
    const first = code(manager.createRoom('token-a-0002', { name: 'A' }));
    manager.joinRoom('token-b-0002', first, { name: 'B' });
    const second = code(manager.createRoom('token-a-0002', { name: 'A' }));
    expect(a.closedReasons).toEqual(['left']);
    expect(a.lastRoom?.code).toBe(second);
    expect(manager.getRoom(first)!.view('').players.map((p) => p.name)).toEqual(['B']);
    expect(manager.getRoom(first)!.view('').hostId).toBe(manager.seatOf('token-b-0002')!.playerId);
  });

  it('keeps the current room when joining another one fails', () => {
    const { manager, connect } = setup();
    connect('token-a-0003');
    connect('token-b-0003');
    const mine = code(manager.createRoom('token-a-0003', { name: 'A' }));
    const theirs = code(manager.createRoom('token-b-0003', { name: 'B' }));
    manager.addBot('token-b-0003', 'easy');
    manager.start('token-b-0003');
    expect(manager.joinRoom('token-a-0003', theirs, { name: 'Z' })).toEqual({ ok: false, error: 'game_in_progress' });
    expect(manager.seatOf('token-a-0003')?.room.code).toBe(mine);
  });

  it('forgets tokens when their room closes and maps reclaimed seats to the new token', () => {
    const { manager, connect } = setup();
    connect('token-host-004');
    const bob = connect('token-bob-0004');
    const c = code(manager.createRoom('token-host-004', { name: 'Host' }));
    manager.joinRoom('token-bob-0004', c, { name: 'Bob' });
    manager.start('token-host-004');
    manager.disconnect('token-bob-0004', bob);
    connect('token-bob-phone');
    expect(manager.joinRoom('token-bob-phone', c, { name: 'bob' })).toEqual({ ok: true, code: c });
    expect(manager.seatOf('token-bob-0004')).toBeNull();
    expect(manager.seatOf('token-bob-phone')?.room.code).toBe(c);

    manager.leaveRoom('token-host-004');
    manager.leaveRoom('token-bob-phone');
    expect(manager.getRoom(c)).toBeUndefined();
    expect(manager.roomCount).toBe(0);
    expect(manager.seatOf('token-host-004')).toBeNull();
  });

  it('tells a client that comes back after its seat went away while it was offline', () => {
    const { manager, connect, clock } = setup();
    // Lobby: removed after the lobby grace period.
    const hostConn = connect('token-host-006');
    const off = connect('token-off-0006');
    const c = code(manager.createRoom('token-host-006', { name: 'Host' }));
    manager.joinRoom('token-off-0006', c, { name: 'Off' });
    manager.disconnect('token-off-0006', off);
    clock.advance(DEFAULT_TIMING.lobbyDisconnectRemoveMs);
    expect(connect('token-off-0006').closedReasons).toEqual(['left']);
    // Told only once.
    expect(connect('token-off-0006').closedReasons).toEqual([]);

    // Seat reclaimed by name from another device.
    const phone = connect('token-phone-006');
    manager.joinRoom('token-phone-006', c, { name: 'Phone' });
    manager.start('token-host-006');
    manager.disconnect('token-phone-006', phone);
    connect('token-laptop-06');
    expect(manager.joinRoom('token-laptop-06', c, { name: 'phone' }).ok).toBe(true);
    expect(connect('token-phone-006').closedReasons).toEqual(['replaced']);

    // Room deleted while everyone was offline.
    manager.disconnect('token-host-006', hostConn);
    const laptop = connect('token-laptop-06');
    manager.disconnect('token-laptop-06', laptop);
    clock.advance(DEFAULT_TIMING.emptyRoomDeleteMs);
    expect(manager.getRoom(c)).toBeUndefined();
    expect(connect('token-host-006').closedReasons).toEqual(['room_deleted']);
    expect(connect('token-laptop-06').closedReasons).toEqual(['room_deleted']);
    // A brand-new token gets nothing.
    expect(connect('token-fresh-006').sent).toEqual([]);
  });

  it('closeAll notifies attached players', () => {
    const { manager, connect } = setup();
    const a = connect('token-a-0005');
    manager.createRoom('token-a-0005', { name: 'A' });
    manager.closeAll();
    expect(a.closedReasons).toEqual(['room_deleted']);
    expect(manager.roomCount).toBe(0);
  });
});
