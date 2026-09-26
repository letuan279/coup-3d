import { describe, expect, it } from 'vitest';
import { STARTING_COINS, TREASURY_COINS, TWO_PLAYER_FIRST_PLAYER_COINS } from '../constants';
import { CHARACTERS } from '../types';
import { applyMove, createGame, getDeciders, getPrompt } from './index';
import { INCOME, newGame, play, playerIds, types } from './testing';

describe('createGame', () => {
  for (let n = 2; n <= 6; n++) {
    it(`sets up a ${n}-player game`, () => {
      const s = newGame(n);
      expect(s.players.map((p) => p.id)).toEqual(playerIds(n));
      expect(s.deck).toHaveLength(15 - 2 * n);
      for (const p of s.players) {
        expect(p.influences).toHaveLength(2);
        expect(p.influences.every((inf) => !inf.revealed)).toBe(true);
        expect(p.eliminated).toBe(false);
        const expected = n === 2 && p.id === 'p0' ? TWO_PLAYER_FIRST_PLAYER_COINS : STARTING_COINS;
        expect(p.coins).toBe(expected);
      }
      expect(s.treasury).toBe(TREASURY_COINS - s.players.reduce((sum, p) => sum + p.coins, 0));

      const cards = [...s.players.flatMap((p) => p.influences.map((i) => i.card)), ...s.deck];
      expect(new Set(cards.map((c) => c.id))).toEqual(new Set(Array.from({ length: 15 }, (_, i) => `c${i}`)));
      for (const ch of CHARACTERS) expect(cards.filter((c) => c.character === ch)).toHaveLength(3);

      expect(s.phase).toEqual({ kind: 'turn' });
      expect(s.turn).toBe(1);
      expect(s.actorId).toBe('p0');
      expect(s.winnerId).toBeNull();
      expect(s.pendingAction).toBeNull();
      expect(types(s.log)).toEqual(['game_start', 'turn_start']);
      expect(s.log[0]).toMatchObject({ type: 'game_start', playerIds: playerIds(n), firstPlayerId: 'p0', turn: 1 });
      expect(s.log[1]).toMatchObject({ type: 'turn_start', playerId: 'p0', turn: 1 });
      expect(s.log[1].seq).toBeGreaterThan(s.log[0].seq);
      expect(s.nextEventSeq).toBe(s.log[1].seq + 1);
      expect(getDeciders(s)).toEqual(['p0']);
    });
  }

  it('gives the 2-player first player 1 coin when the first player is random', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const s = createGame({ players: [{ id: 'a', name: 'A', seat: 0 }, { id: 'b', name: 'B', seat: 1 }], seed });
      const first = s.players.find((p) => p.id === s.actorId);
      const other = s.players.find((p) => p.id !== s.actorId);
      expect(first?.coins).toBe(TWO_PLAYER_FIRST_PLAYER_COINS);
      expect(other?.coins).toBe(STARTING_COINS);
      expect(s.treasury).toBe(TREASURY_COINS - 3);
    }
  });

  it('picks a seeded random first player and is reproducible', () => {
    const players = playerIds(5).map((id, seat) => ({ id, name: id, seat }));
    const firsts = new Set<string>();
    for (let seed = 0; seed < 40; seed++) {
      const a = createGame({ players, seed });
      const b = createGame({ players, seed });
      expect(a).toEqual(b);
      firsts.add(a.actorId);
    }
    expect(firsts.size).toBeGreaterThan(1);
  });

  it('sorts players by seat and supports non-contiguous seats', () => {
    const s = createGame({
      players: [
        { id: 'x', name: 'X', seat: 5 },
        { id: 'y', name: 'Y', seat: 0 },
        { id: 'z', name: 'Z', seat: 2 },
      ],
      seed: 7,
      firstPlayerId: 'x',
    });
    expect(s.players.map((p) => p.id)).toEqual(['y', 'z', 'x']);
    const { state } = play(s, [['x', INCOME]]);
    expect(state.actorId).toBe('y');
  });

  it('rejects invalid setups', () => {
    const one = [{ id: 'a', name: 'A', seat: 0 }];
    expect(() => createGame({ players: one, seed: 1 })).toThrow();
    const seven = playerIds(7).map((id, seat) => ({ id, name: id, seat }));
    expect(() => createGame({ players: seven, seed: 1 })).toThrow();
    const dupe = [
      { id: 'a', name: 'A', seat: 0 },
      { id: 'a', name: 'B', seat: 1 },
    ];
    expect(() => createGame({ players: dupe, seed: 1 })).toThrow();
    const two = [
      { id: 'a', name: 'A', seat: 0 },
      { id: 'b', name: 'B', seat: 1 },
    ];
    expect(() => createGame({ players: two, seed: 1, firstPlayerId: 'zzz' })).toThrow();
  });

  it('is deterministic: same seed and moves → identical states', () => {
    const run = () => {
      let s = newGame(4, { seed: 99 });
      for (let i = 0; i < 8; i++) {
        const r = applyMove(s, s.actorId, { type: 'action', action: 'exchange' });
        if (!r.ok) throw new Error(r.error);
        s = r.state;
        for (const id of getDeciders(s)) {
          if (getPrompt(s, id)?.kind !== 'respond_action') continue;
          const p = applyMove(s, id, { type: 'pass' });
          if (!p.ok) throw new Error(p.error);
          s = p.state;
        }
        const ex = applyMove(s, s.actorId, { type: 'exchange', keep: [1, 2] });
        if (!ex.ok) throw new Error(ex.error);
        s = ex.state;
      }
      return s;
    };
    expect(run()).toEqual(run());
  });
});
