import { describe, expect, it } from 'vitest';
import { TREASURY_COINS } from '../constants';
import { applyMove, getDeciders, getPrompt } from './index';
import {
  CHALLENGE,
  INCOME,
  PASS,
  act,
  block,
  coinsOf,
  hiddenCount,
  newGame,
  play,
  player,
  reveal,
  rig,
  types,
} from './testing';

const coup = (targetId: string) => ({ type: 'action', action: 'coup', targetId }) as const;
const FOREIGN_AID = { type: 'action', action: 'foreign_aid' } as const;
const TAX = { type: 'action', action: 'tax' } as const;

describe('income', () => {
  it('takes 1 coin and passes the turn', () => {
    const s = newGame(3);
    const { state, events } = act(s, 'p0', INCOME);
    expect(coinsOf(state, 'p0')).toBe(3);
    expect(state.treasury).toBe(s.treasury - 1);
    expect(types(events)).toEqual(['action', 'action_resolved', 'coins', 'turn_start']);
    expect(events[0]).toMatchObject({ type: 'action', actorId: 'p0', action: 'income' });
    expect(events[0]).not.toHaveProperty('targetId');
    expect(events[0]).not.toHaveProperty('claim');
    expect(events[2]).toMatchObject({ from: 'treasury', to: 'p0', amount: 1, reason: 'income' });
    expect(events[3]).toMatchObject({ type: 'turn_start', playerId: 'p1', turn: 2 });
    expect(state.actorId).toBe('p1');
    expect(state.turn).toBe(2);
    expect(state.pendingAction).toBeNull();
  });

  it('never mutates the input state', () => {
    const s = newGame(3);
    const snapshot = structuredClone(s);
    act(s, 'p0', INCOME);
    applyMove(s, 'p1', INCOME);
    expect(s).toEqual(snapshot);
  });

  it('caps gains by the treasury', () => {
    const s = rig(newGame(2), { coins: { p0: 9, p1: TREASURY_COINS - 9 } });
    expect(s.treasury).toBe(0);
    const { state, events } = act(s, 'p0', INCOME);
    expect(coinsOf(state, 'p0')).toBe(9);
    expect(types(events)).toEqual(['action', 'action_resolved', 'turn_start']);
  });
});

describe('foreign aid', () => {
  const base = () => rig(newGame(3), { hands: { p0: ['captain', 'captain'], p1: ['assassin', 'contessa'], p2: ['duke', 'ambassador'] } });

  it('opens a block window for every other living player', () => {
    const { state } = act(base(), 'p0', FOREIGN_AID);
    expect(state.phase).toEqual({
      kind: 'action_response',
      responders: ['p1', 'p2'],
      passed: [],
      canChallenge: false,
      blockers: ['p1', 'p2'],
      blockCharacters: ['duke'],
    });
    expect(getPrompt(state, 'p1')).toEqual({ kind: 'respond_action', canChallenge: false, blockCharacters: ['duke'] });
    expect(applyMove(state, 'p1', CHALLENGE)).toEqual({ ok: false, error: 'invalid_move' });
  });

  it('resolves +2 when everyone passes', () => {
    const { state, events } = play(base(), [
      ['p0', FOREIGN_AID],
      ['p1', PASS],
      ['p2', PASS],
    ]);
    expect(coinsOf(state, 'p0')).toBe(4);
    expect(types(events)).toEqual(['action', 'pass', 'pass', 'action_resolved', 'coins', 'turn_start']);
    expect(events[4]).toMatchObject({ from: 'treasury', to: 'p0', amount: 2, reason: 'foreign_aid' });
  });

  it('can be blocked by any player claiming Duke', () => {
    const blocked = act(act(base(), 'p0', FOREIGN_AID).state, 'p2', block('duke'));
    expect(blocked.events).toEqual([
      expect.objectContaining({ type: 'block', blockerId: 'p2', character: 'duke', actorId: 'p0', action: 'foreign_aid' }),
    ]);
    expect(blocked.state.phase).toEqual({ kind: 'block_response', responders: ['p0', 'p1'], passed: [] });
    expect(blocked.state.pendingBlock).toEqual({ blockerId: 'p2', character: 'duke' });
    expect(getPrompt(blocked.state, 'p0')).toEqual({ kind: 'respond_block' });

    const { state, events } = play(blocked.state, [
      ['p0', PASS],
      ['p1', PASS],
    ]);
    expect(coinsOf(state, 'p0')).toBe(2);
    expect(types(events)).toEqual(['pass', 'pass', 'action_blocked', 'turn_start']);
    expect(events[2]).toMatchObject({ actorId: 'p0', action: 'foreign_aid', blockerId: 'p2', character: 'duke' });
  });

  it('a Duke bluff by a non-target is also allowed as a block', () => {
    const { state } = play(base(), [
      ['p0', FOREIGN_AID],
      ['p1', block('duke')],
    ]);
    expect(state.phase).toMatchObject({ kind: 'block_response', responders: ['p2', 'p0'] });
  });

  it('block challenged, blocker has Duke → card replaced, challenger loses, action blocked', () => {
    const s = act(act(base(), 'p0', FOREIGN_AID).state, 'p2', block('duke')).state;
    const deckBefore = s.deck.length;
    const { state, events } = act(s, 'p1', CHALLENGE);
    expect(types(events)).toEqual(['challenge', 'challenge_result', 'card_replaced', 'action_blocked']);
    expect(events[0]).toMatchObject({ challengerId: 'p1', challengedId: 'p2', character: 'duke', against: 'block' });
    expect(events[1]).toMatchObject({ challengedHadCard: true, slot: 0 });
    expect(events[2]).toMatchObject({ playerId: 'p2', slot: 0, character: 'duke' });
    expect(state.deck).toHaveLength(deckBefore);
    expect(hiddenCount(state, 'p2')).toBe(2);
    expect(state.phase).toEqual({ kind: 'lose_influence', playerId: 'p1', reason: 'wrong_challenge', then: { kind: 'end_turn' } });

    const after = act(state, 'p1', reveal(1));
    expect(types(after.events)).toEqual(['influence_lost', 'turn_start']);
    expect(after.events[0]).toMatchObject({ playerId: 'p1', slot: 1, character: 'contessa', reason: 'wrong_challenge' });
    expect(coinsOf(after.state, 'p0')).toBe(2);
    expect(after.state.actorId).toBe('p1');
  });

  it('block challenged, blocker bluffed → blocker loses, foreign aid resolves', () => {
    const s = play(base(), [
      ['p0', FOREIGN_AID],
      ['p1', block('duke')],
    ]).state;
    const { state, events } = act(s, 'p0', CHALLENGE);
    expect(types(events)).toEqual(['challenge', 'challenge_result']);
    expect(events[1]).toMatchObject({ challengedHadCard: false });
    expect(events[1]).not.toHaveProperty('slot');
    expect(state.phase).toEqual({
      kind: 'lose_influence',
      playerId: 'p1',
      reason: 'caught_bluffing',
      then: { kind: 'resolve_action' },
    });
    const after = act(state, 'p1', reveal(0));
    expect(types(after.events)).toEqual(['influence_lost', 'action_resolved', 'coins', 'turn_start']);
    expect(coinsOf(after.state, 'p0')).toBe(4);
    expect(after.state.pendingBlock).toBeNull();
  });
});

describe('coup', () => {
  it('costs 7 and makes the target lose an influence', () => {
    const s = rig(newGame(3), { coins: { p0: 7 }, hands: { p1: ['duke', 'captain'] } });
    const { state, events } = act(s, 'p0', coup('p1'));
    expect(types(events)).toEqual(['action', 'coins', 'action_resolved']);
    expect(events[0]).toMatchObject({ actorId: 'p0', action: 'coup', targetId: 'p1' });
    expect(events[1]).toMatchObject({ from: 'p0', to: 'treasury', amount: 7, reason: 'coup' });
    expect(coinsOf(state, 'p0')).toBe(0);
    expect(state.treasury).toBe(s.treasury + 7);
    expect(state.phase).toEqual({ kind: 'lose_influence', playerId: 'p1', reason: 'coup', then: { kind: 'end_turn' } });
    expect(getDeciders(state)).toEqual(['p1']);
    expect(getPrompt(state, 'p1')).toEqual({ kind: 'lose_influence', slots: [0, 1], reason: 'coup' });

    const after = act(state, 'p1', reveal(1));
    expect(types(after.events)).toEqual(['influence_lost', 'turn_start']);
    expect(after.events[0]).toMatchObject({ playerId: 'p1', slot: 1, character: 'captain', reason: 'coup' });
    expect(player(after.state, 'p1').influences[1].revealed).toBe(true);
  });

  it('auto-reveals the last influence and eliminates the target', () => {
    const s = rig(newGame(3), { coins: { p0: 8, p1: 5 }, revealed: { p1: [0] } });
    const { state, events } = act(s, 'p0', coup('p1'));
    expect(types(events)).toEqual([
      'action',
      'coins',
      'action_resolved',
      'influence_lost',
      'eliminated',
      'coins',
      'turn_start',
    ]);
    expect(events[5]).toMatchObject({ from: 'p1', to: 'treasury', amount: 5, reason: 'eliminated' });
    expect(player(state, 'p1').eliminated).toBe(true);
    expect(coinsOf(state, 'p1')).toBe(0);
    expect(state.actorId).toBe('p2');
  });

  it('is forced at 10+ coins', () => {
    const s = rig(newGame(3), { coins: { p0: 10 } });
    expect(applyMove(s, 'p0', INCOME)).toEqual({ ok: false, error: 'must_coup' });
    expect(applyMove(s, 'p0', TAX)).toEqual({ ok: false, error: 'must_coup' });
    expect(applyMove(s, 'p0', { type: 'action', action: 'assassinate', targetId: 'p1' })).toEqual({
      ok: false,
      error: 'must_coup',
    });
    expect(act(s, 'p0', coup('p2')).state.phase).toMatchObject({ kind: 'lose_influence', playerId: 'p2' });
  });

  it('needs 7 coins', () => {
    const s = rig(newGame(3), { coins: { p0: 6 } });
    expect(applyMove(s, 'p0', coup('p1'))).toEqual({ ok: false, error: 'not_enough_coins' });
  });

  it('rejects self, eliminated, unknown or missing targets', () => {
    const s = rig(newGame(3), { coins: { p0: 7 }, revealed: { p2: [0, 1] } });
    expect(applyMove(s, 'p0', coup('p0'))).toEqual({ ok: false, error: 'invalid_target' });
    expect(applyMove(s, 'p0', coup('p2'))).toEqual({ ok: false, error: 'invalid_target' });
    expect(applyMove(s, 'p0', coup('nobody'))).toEqual({ ok: false, error: 'invalid_target' });
    expect(applyMove(s, 'p0', { type: 'action', action: 'coup' })).toEqual({ ok: false, error: 'invalid_target' });
    expect(applyMove(s, 'p0', { type: 'action', action: 'income', targetId: 'p1' })).toEqual({
      ok: false,
      error: 'invalid_target',
    });
  });
});

describe('tax', () => {
  it('unchallenged → +3', () => {
    const s = newGame(3);
    const declared = act(s, 'p0', TAX);
    expect(declared.events[0]).toMatchObject({ type: 'action', action: 'tax', claim: 'duke' });
    expect(declared.state.phase).toEqual({
      kind: 'action_response',
      responders: ['p1', 'p2'],
      passed: [],
      canChallenge: true,
      blockers: [],
      blockCharacters: [],
    });
    expect(applyMove(declared.state, 'p1', block('duke'))).toEqual({ ok: false, error: 'invalid_move' });
    const { state, events } = play(declared.state, [
      ['p1', PASS],
      ['p2', PASS],
    ]);
    expect(coinsOf(state, 'p0')).toBe(5);
    expect(types(events)).toEqual(['pass', 'pass', 'action_resolved', 'coins', 'turn_start']);
    expect(events[3]).toMatchObject({ amount: 3, reason: 'tax' });
  });

  it('challenged, actor has Duke → card replaced, challenger loses, tax resolves', () => {
    const s = rig(newGame(3), { hands: { p0: ['captain', 'duke'], p1: ['assassin', 'contessa'] } });
    const deckBefore = s.deck.length;
    const provenId = player(s, 'p0').influences[1].card.id;
    const { state, events } = play(s, [
      ['p0', TAX],
      ['p1', CHALLENGE],
    ]);
    expect(types(events)).toEqual(['action', 'challenge', 'challenge_result', 'card_replaced']);
    expect(events[1]).toMatchObject({ challengerId: 'p1', challengedId: 'p0', character: 'duke', against: 'action' });
    expect(events[2]).toMatchObject({ challengedHadCard: true, slot: 1 });
    expect(events[3]).toMatchObject({ playerId: 'p0', slot: 1, character: 'duke' });
    expect(state.deck).toHaveLength(deckBefore);
    expect(hiddenCount(state, 'p0')).toBe(2);
    expect(player(state, 'p0').influences[0].card.character).toBe('captain');
    const allIds = [...state.players.flatMap((p) => p.influences.map((i) => i.card.id)), ...state.deck.map((c) => c.id)];
    expect(allIds).toContain(provenId);
    expect(state.phase).toEqual({
      kind: 'lose_influence',
      playerId: 'p1',
      reason: 'wrong_challenge',
      then: { kind: 'after_action_proven' },
    });

    const after = act(state, 'p1', reveal(0));
    expect(types(after.events)).toEqual(['influence_lost', 'action_resolved', 'coins', 'turn_start']);
    expect(coinsOf(after.state, 'p0')).toBe(5);
    expect(hiddenCount(after.state, 'p1')).toBe(1);
  });

  it('challenged, actor bluffed → actor loses, no coins', () => {
    const s = rig(newGame(3), { hands: { p0: ['captain', 'contessa'] } });
    const { state, events } = play(s, [
      ['p0', TAX],
      ['p1', PASS],
      ['p2', CHALLENGE],
    ]);
    expect(types(events)).toEqual(['action', 'pass', 'challenge', 'challenge_result', 'action_failed']);
    expect(events[3]).toMatchObject({ challengedHadCard: false });
    expect(state.phase).toEqual({ kind: 'lose_influence', playerId: 'p0', reason: 'caught_bluffing', then: { kind: 'end_turn' } });
    const after = act(state, 'p0', reveal(1));
    expect(types(after.events)).toEqual(['influence_lost', 'turn_start']);
    expect(coinsOf(after.state, 'p0')).toBe(2);
    expect(after.state.actorId).toBe('p1');
  });
});
