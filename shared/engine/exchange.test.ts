import { describe, expect, it } from 'vitest';
import type { Move } from '../types';
import { applyMove, getDefaultMove, getPrompt, listLegalMoves, toView } from './index';
import { CHALLENGE, PASS, act, hand, newGame, play, player, reveal, rig, types } from './testing';

const EXCHANGE = { type: 'action', action: 'exchange' } as const;
const keep = (...indexes: number[]): Move => ({ type: 'exchange', keep: indexes });

/** 3 players, p0 declares Exchange and everyone passes; the deck top is contessa, assassin. */
function exchanging(revealedP0: number[] = []) {
  const s = rig(newGame(3), {
    hands: { p0: ['duke', 'captain'] },
    revealed: { p0: revealedP0 },
    deckTop: ['contessa', 'assassin'],
  });
  return { before: s, ...play(s, [['p0', EXCHANGE], ['p1', PASS], ['p2', PASS]]) };
}

describe('exchange', () => {
  it('draws 2 and prompts the actor with hand + drawn (2 influences)', () => {
    const { before, state, events } = exchanging();
    expect(events[0]).toMatchObject({ type: 'action', action: 'exchange', claim: 'ambassador' });
    expect(types(events).slice(-2)).toEqual(['action_resolved', 'exchange_draw']);
    expect(events.at(-1)).toMatchObject({ playerId: 'p0', count: 2 });
    expect(state.phase.kind).toBe('exchange');
    expect(state.deck).toHaveLength(before.deck.length - 2);
    expect(getPrompt(state, 'p0')).toEqual({
      kind: 'exchange',
      cards: ['duke', 'captain', 'contessa', 'assassin'],
      keepCount: 2,
    });
    expect(getPrompt(state, 'p1')).toBeNull();
    expect(toView(state, 'p0').deckCount).toBe(before.deck.length - 2);
  });

  it('keeps the chosen cards, returns the rest and preserves the deck count', () => {
    const { before, state } = exchanging();
    const { state: after, events } = act(state, 'p0', keep(3, 2));
    expect(hand(after, 'p0')).toEqual(['contessa', 'assassin']);
    expect(after.deck).toHaveLength(before.deck.length);
    expect(after.deck.filter((c) => c.character === 'duke' || c.character === 'captain').length).toBeGreaterThanOrEqual(2);
    expect(types(events)).toEqual(['exchange_done', 'turn_start']);
    expect(events[0]).toMatchObject({ playerId: 'p0', returned: 2 });
    expect(after.actorId).toBe('p1');
  });

  it('kept hand cards stay in their own slot', () => {
    const { before, state } = exchanging();
    const ids = player(before, 'p0').influences.map((i) => i.card.id);
    expect(player(act(state, 'p0', keep(0, 1)).state, 'p0').influences.map((i) => i.card.id)).toEqual(ids);
    const mixed = act(state, 'p0', keep(3, 1)).state;
    expect(hand(mixed, 'p0')).toEqual(['assassin', 'captain']);
    expect(player(mixed, 'p0').influences[1].card.id).toBe(ids[1]);
  });

  it('with 1 influence: keeps 1 of 3, revealed slot untouched', () => {
    const { before, state } = exchanging([0]);
    expect(getPrompt(state, 'p0')).toEqual({ kind: 'exchange', cards: ['captain', 'contessa', 'assassin'], keepCount: 1 });
    expect(listLegalMoves(state, 'p0')).toEqual([keep(0), keep(1), keep(2)]);
    const { state: after, events } = act(state, 'p0', keep(2));
    const p0 = player(after, 'p0');
    expect(p0.influences[0]).toEqual(player(before, 'p0').influences[0]);
    expect(p0.influences[0].revealed).toBe(true);
    expect(p0.influences[1]).toMatchObject({ revealed: false, card: { character: 'assassin' } });
    expect(events[0]).toMatchObject({ type: 'exchange_done', returned: 2 });
    expect(after.deck).toHaveLength(before.deck.length);
  });

  it('rejects invalid selections', () => {
    const { state } = exchanging();
    const bad: unknown[] = [[0], [0, 1, 2], [0, 0], [0, 4], [-1, 0], [0.5, 1], ['0', '1'], 'nope', null];
    for (const k of bad) {
      expect(applyMove(state, 'p0', { type: 'exchange', keep: k } as unknown as Move)).toEqual({
        ok: false,
        error: 'invalid_move',
      });
    }
    expect(applyMove(state, 'p0', PASS)).toEqual({ ok: false, error: 'invalid_move' });
    expect(applyMove(state, 'p0', reveal(0))).toEqual({ ok: false, error: 'invalid_move' });
    expect(applyMove(state, 'p1', keep(0, 1))).toEqual({ ok: false, error: 'not_your_decision' });
  });

  it('lists every keep combination as a legal move', () => {
    const { state } = exchanging();
    expect(listLegalMoves(state, 'p0')).toEqual([keep(0, 1), keep(0, 2), keep(0, 3), keep(1, 2), keep(1, 3), keep(2, 3)]);
  });

  it('defaults to keeping the current hand', () => {
    const { before, state } = exchanging();
    expect(getDefaultMove(state, 'p0')).toEqual(keep(0, 1));
    const { state: after, events } = act(state, 'p0', keep(0, 1), { auto: true });
    expect(events[0]).toMatchObject({ type: 'timeout', playerId: 'p0', phase: 'exchange' });
    expect(hand(after, 'p0')).toEqual(hand(before, 'p0'));
  });

  it('challenged exchange: proven Ambassador is replaced before the draw', () => {
    const s = rig(newGame(3), { hands: { p0: ['ambassador', 'duke'] } });
    const { state } = play(s, [
      ['p0', EXCHANGE],
      ['p1', CHALLENGE],
      ['p1', reveal(0)],
    ]);
    expect(state.phase.kind).toBe('exchange');
    const prompt = getPrompt(state, 'p0');
    expect(prompt).toMatchObject({ kind: 'exchange', keepCount: 2 });
    if (prompt?.kind !== 'exchange') throw new Error('expected exchange prompt');
    expect(prompt.cards).toHaveLength(4);
    expect(prompt.cards[1]).toBe('duke');
  });
});
