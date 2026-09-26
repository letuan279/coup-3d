import { describe, expect, it } from 'vitest';
import type { GameView, LobbyPlayer, PlayerPublic, RoomView } from '@shared/types';
import { buildSceneModel, currentDeciders, targetIds } from './sceneModel';

function lobbyPlayer(id: string, seat: number, extra: Partial<LobbyPlayer> = {}): LobbyPlayer {
  return {
    id,
    name: id.toUpperCase(),
    seat,
    kind: 'human',
    avatar: 'fox',
    connected: true,
    isHost: seat === 0,
    botControlled: false,
    left: false,
    wins: 0,
    ...extra,
  };
}

function room(players: LobbyPlayer[], youId: string, status: RoomView['status'] = 'lobby'): RoomView {
  return { code: 'ABCDE', hostId: players[0].id, status, players, settings: { turnSeconds: 30, responseSeconds: 12 }, youId, maxPlayers: 6, gameNumber: 1 };
}

function pub(id: string, seat: number, extra: Partial<PlayerPublic> = {}): PlayerPublic {
  return {
    id,
    name: id.toUpperCase(),
    seat,
    coins: 2,
    influences: [
      { slot: 0, revealed: false, character: null },
      { slot: 1, revealed: false, character: null },
    ],
    hiddenCount: 2,
    eliminated: false,
    ...extra,
  };
}

function game(players: PlayerPublic[], viewerId: string | null, extra: Partial<GameView> = {}): GameView {
  return {
    viewerId,
    players,
    deckCount: 15 - players.length * 2,
    treasury: 50 - players.length * 2,
    turn: 1,
    actorId: players[0].id,
    pendingAction: null,
    pendingBlock: null,
    phase: { kind: 'turn', actorId: players[0].id },
    phaseSeq: 1,
    prompt: null,
    winnerId: null,
    log: [],
    deadline: null,
    phaseDurationMs: null,
    serverNow: 0,
    ...extra,
  };
}

describe('buildSceneModel', () => {
  it('is home without a room', () => {
    expect(buildSceneModel(null, null).mode).toBe('home');
  });

  it('seats lobby players in fixed 6-seat slots relative to the local seat', () => {
    const r = room([lobbyPlayer('a', 0), lobbyPlayer('b', 2, { kind: 'bot', botLevel: 'hard' }), lobbyPlayer('c', 5, { connected: false })], 'b');
    const m = buildSceneModel(r, null);
    expect(m.mode).toBe('lobby');
    expect(m.layoutCount).toBe(6);
    const slot = Object.fromEntries(m.seats.map((s) => [s.id, s.slot]));
    expect(slot).toEqual({ b: 0, c: 3, a: 4 });
    expect(m.seats.find((s) => s.id === 'b')!.isLocal).toBe(true);
    expect(m.seats.find((s) => s.id === 'b')!.botBadge).toBe(true);
    expect(m.seats.find((s) => s.id === 'c')!.offline).toBe(true);
    expect(m.emptySlots).toEqual([1, 2, 5]);
  });

  it('orders game seats clockwise from the local player by seat number', () => {
    const lps = [lobbyPlayer('a', 0), lobbyPlayer('b', 1), lobbyPlayer('c', 3, { botControlled: true }), lobbyPlayer('d', 4)];
    const g = game([pub('a', 0), pub('b', 1), pub('c', 3), pub('d', 4)], 'c');
    const m = buildSceneModel(room(lps, 'c', 'playing'), g);
    expect(m.mode).toBe('game');
    expect(m.layoutCount).toBe(4);
    const slot = Object.fromEntries(m.seats.map((s) => [s.id, s.slot]));
    expect(slot).toEqual({ c: 0, d: 1, a: 2, b: 3 });
    expect(m.seats.find((s) => s.id === 'c')!.botBadge).toBe(true);
  });

  it('gives a spectator an empty camera seat', () => {
    const g = game([pub('a', 0), pub('b', 1)], null);
    const m = buildSceneModel(null, g);
    expect(m.layoutCount).toBe(3);
    expect(m.seats.every((s) => !s.isLocal && s.slot > 0)).toBe(true);
  });
});

describe('currentDeciders', () => {
  const players = [pub('a', 0), pub('b', 1), pub('c', 2)];
  const action = { type: 'tax' as const, actorId: 'a', claim: 'duke' as const };

  it('covers every phase', () => {
    expect(currentDeciders(game(players, 'a'))).toEqual(['a']);
    expect(
      currentDeciders(
        game(players, 'a', {
          phase: { kind: 'action_response', action, responders: ['b', 'c'], passed: ['b'], canChallenge: true, blockers: [], blockCharacters: [] },
        }),
      ),
    ).toEqual(['c']);
    expect(
      currentDeciders(
        game(players, 'a', {
          phase: { kind: 'block_response', action, block: { blockerId: 'b', character: 'duke' }, responders: ['a', 'c'], passed: [] },
        }),
      ),
    ).toEqual(['a', 'c']);
    expect(
      currentDeciders(game(players, 'a', { phase: { kind: 'lose_influence', playerId: 'b', reason: 'coup', action: null, block: null } })),
    ).toEqual(['b']);
    expect(currentDeciders(game(players, 'a', { phase: { kind: 'exchange', actorId: 'a', action } }))).toEqual(['a']);
    expect(currentDeciders(game(players, 'a', { phase: { kind: 'game_over', winnerId: 'a' } }))).toEqual([]);
    expect(currentDeciders(null)).toEqual([]);
  });

  it('a block declared while others may still challenge the action: rings go to the remaining responders', () => {
    const four = [pub('a', 0), pub('b', 1), pub('c', 2), pub('d', 3)];
    const stealB = { type: 'steal' as const, actorId: 'a', targetId: 'b', claim: 'captain' as const };
    const g = game(four, 'c', {
      pendingAction: stealB,
      pendingBlock: { blockerId: 'b', character: 'ambassador' },
      // SPEC §1.1: the blocker counts as responded (in `passed`), the window stays open.
      phase: {
        kind: 'action_response',
        action: stealB,
        responders: ['b', 'c', 'd'],
        passed: ['b'],
        canChallenge: true,
        blockers: ['b'],
        blockCharacters: ['captain', 'ambassador'],
      },
    });
    expect(currentDeciders(g)).toEqual(['c', 'd']);
    expect(currentDeciders({ ...g, phase: { ...g.phase, passed: ['b', 'd'] } as GameView['phase'] })).toEqual(['c']);
  });
});

describe('targetIds', () => {
  it('returns the enabled option targets only while choosing an action', () => {
    const players = [pub('a', 0), pub('b', 1), pub('c', 2)];
    const g = game(players, 'a', {
      prompt: {
        kind: 'choose_action',
        mustCoup: false,
        options: [
          { action: 'steal', enabled: true, targets: ['b', 'c'], claim: 'captain', cost: 0 },
          { action: 'coup', enabled: false, targets: ['b', 'c'], cost: 7, disabledReason: 'not_enough_coins' },
        ],
      },
    });
    expect(targetIds(g, 'steal')).toEqual(['b', 'c']);
    expect(targetIds(g, 'coup')).toEqual([]);
    expect(targetIds(g, null)).toEqual([]);
    expect(targetIds({ ...g, prompt: null }, 'steal')).toEqual([]);
  });
});
