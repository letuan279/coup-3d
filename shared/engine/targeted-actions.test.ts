import { describe, expect, it } from 'vitest';
import type { Character } from '../types';
import { applyMove, getDeciders, getPrompt } from './index';
import { CHALLENGE, PASS, act, block, coinsOf, hiddenCount, newGame, play, player, reveal, rig, types } from './testing';

const assassinate = (targetId: string) => ({ type: 'action', action: 'assassinate', targetId }) as const;
const steal = (targetId: string) => ({ type: 'action', action: 'steal', targetId }) as const;

describe('assassinate', () => {
  const base = (p1: [Character, Character] = ['duke', 'captain']) =>
    rig(newGame(3), {
      hands: { p0: ['assassin', 'duke'], p1, p2: ['ambassador', 'contessa'] },
      coins: { p0: 3 },
    });

  it('pays 3 on declaration and opens a target-only Contessa block window', () => {
    const { state, events } = act(base(), 'p0', assassinate('p1'));
    expect(types(events)).toEqual(['action', 'coins']);
    expect(events[0]).toMatchObject({ actorId: 'p0', action: 'assassinate', targetId: 'p1', claim: 'assassin' });
    expect(events[1]).toMatchObject({ from: 'p0', to: 'treasury', amount: 3, reason: 'assassinate' });
    expect(coinsOf(state, 'p0')).toBe(0);
    expect(state.phase).toEqual({
      kind: 'action_response',
      responders: ['p1', 'p2'],
      passed: [],
      canChallenge: true,
      blockers: ['p1'],
      blockCharacters: ['contessa'],
    });
    expect(getPrompt(state, 'p1')).toEqual({ kind: 'respond_action', canChallenge: true, blockCharacters: ['contessa'] });
    expect(getPrompt(state, 'p2')).toEqual({ kind: 'respond_action', canChallenge: true, blockCharacters: [] });
    expect(applyMove(state, 'p2', block('contessa'))).toEqual({ ok: false, error: 'invalid_move' });
    expect(applyMove(state, 'p1', block('duke'))).toEqual({ ok: false, error: 'invalid_move' });
  });

  it('needs 3 coins', () => {
    const s = rig(newGame(3), { coins: { p0: 2 } });
    expect(applyMove(s, 'p0', assassinate('p1'))).toEqual({ ok: false, error: 'not_enough_coins' });
  });

  it('all pass → target loses an influence', () => {
    const { state, events } = play(base(), [
      ['p0', assassinate('p1')],
      ['p1', PASS],
      ['p2', PASS],
    ]);
    expect(types(events).slice(-1)).toEqual(['action_resolved']);
    expect(state.phase).toEqual({ kind: 'lose_influence', playerId: 'p1', reason: 'assassinate', then: { kind: 'end_turn' } });
    const after = act(state, 'p1', reveal(0));
    expect(after.events[0]).toMatchObject({ type: 'influence_lost', playerId: 'p1', reason: 'assassinate' });
    expect(hiddenCount(after.state, 'p1')).toBe(1);
    expect(after.state.actorId).toBe('p1');
  });

  it('blocked by Contessa → coins stay spent', () => {
    const { state, events } = play(base(['contessa', 'duke']), [
      ['p0', assassinate('p1')],
      ['p1', block('contessa')],
      ['p2', PASS], // still the action window: p2 lets the Assassin claim stand
      ['p2', PASS], // block window
      ['p0', PASS],
    ]);
    expect(types(events)).toEqual(['action', 'coins', 'block', 'pass', 'pass', 'pass', 'action_blocked', 'turn_start']);
    expect(coinsOf(state, 'p0')).toBe(0);
    expect(hiddenCount(state, 'p1')).toBe(2);
  });

  it('Contessa bluff caught → target loses both influences (double loss, eliminated)', () => {
    const s = play(base(['duke', 'captain']), [
      ['p0', assassinate('p1')],
      ['p1', block('contessa')],
      ['p2', PASS],
      ['p0', CHALLENGE],
    ]).state;
    expect(s.phase).toEqual({
      kind: 'lose_influence',
      playerId: 'p1',
      reason: 'caught_bluffing',
      then: { kind: 'resolve_action' },
    });
    const { state, events } = act(s, 'p1', reveal(0));
    expect(types(events)).toEqual(['influence_lost', 'action_resolved', 'influence_lost', 'eliminated', 'coins', 'turn_start']);
    expect(events[0]).toMatchObject({ slot: 0, reason: 'caught_bluffing' });
    expect(events[2]).toMatchObject({ slot: 1, reason: 'assassinate' });
    expect(player(state, 'p1').eliminated).toBe(true);
    expect(state.actorId).toBe('p2');
  });

  it('target challenges wrongly → loses one, still gets the block window, passes → loses the second', () => {
    const s = act(base(), 'p0', assassinate('p1')).state;
    const challenged = act(s, 'p1', CHALLENGE);
    expect(types(challenged.events)).toEqual(['challenge', 'challenge_result', 'card_replaced']);
    expect(challenged.state.phase).toMatchObject({ kind: 'lose_influence', playerId: 'p1', reason: 'wrong_challenge' });

    const lost = act(challenged.state, 'p1', reveal(0));
    expect(types(lost.events)).toEqual(['influence_lost']);
    expect(lost.state.phase).toEqual({
      kind: 'action_response',
      responders: ['p1'],
      passed: [],
      canChallenge: false,
      blockers: ['p1'],
      blockCharacters: ['contessa'],
    });
    expect(getDeciders(lost.state)).toEqual(['p1']);
    expect(getPrompt(lost.state, 'p1')).toEqual({ kind: 'respond_action', canChallenge: false, blockCharacters: ['contessa'] });
    expect(applyMove(lost.state, 'p2', PASS)).toEqual({ ok: false, error: 'not_your_decision' });
    expect(applyMove(lost.state, 'p1', CHALLENGE)).toEqual({ ok: false, error: 'invalid_move' });

    const done = act(lost.state, 'p1', PASS);
    expect(types(done.events)).toEqual(['pass', 'action_resolved', 'influence_lost', 'eliminated', 'coins', 'turn_start']);
    expect(player(done.state, 'p1').eliminated).toBe(true);
  });

  it('target challenges wrongly then blocks with Contessa in the new window', () => {
    const s = play(base(['contessa', 'duke']), [
      ['p0', assassinate('p1')],
      ['p1', CHALLENGE],
      ['p1', reveal(1)],
      ['p1', block('contessa')],
    ]).state;
    expect(s.phase).toEqual({ kind: 'block_response', responders: ['p2', 'p0'], passed: [] });
  });

  it('successful challenge → 3 coins refunded and the actor loses', () => {
    const s = rig(newGame(3), { hands: { p0: ['duke', 'captain'] }, coins: { p0: 3 } });
    const { state, events } = play(s, [
      ['p0', assassinate('p1')],
      ['p2', CHALLENGE],
    ]);
    expect(types(events)).toEqual(['action', 'coins', 'challenge', 'challenge_result', 'coins', 'action_failed']);
    expect(events[4]).toMatchObject({ from: 'treasury', to: 'p0', amount: 3, reason: 'refund' });
    expect(coinsOf(state, 'p0')).toBe(3);
    expect(state.phase).toMatchObject({ kind: 'lose_influence', playerId: 'p0', reason: 'caught_bluffing' });
    const after = act(state, 'p0', reveal(0));
    expect(hiddenCount(after.state, 'p1')).toBe(2);
    expect(after.state.actorId).toBe('p1');
  });

  it('fizzles when the target is eliminated by its own wrong challenge', () => {
    const s = rig(base(), { revealed: { p1: [0] } });
    const { state, events } = play(s, [
      ['p0', assassinate('p1')],
      ['p1', CHALLENGE],
    ]);
    expect(types(events)).toEqual([
      'action',
      'coins',
      'challenge',
      'challenge_result',
      'card_replaced',
      'influence_lost',
      'eliminated',
      'coins',
      'action_resolved',
      'turn_start',
    ]);
    expect(player(state, 'p1').eliminated).toBe(true);
    expect(state.actorId).toBe('p2');
  });
});

describe('steal', () => {
  const base = (p1Coins: number) =>
    rig(newGame(3), {
      hands: { p0: ['captain', 'duke'], p1: ['captain', 'ambassador'], p2: ['assassin', 'contessa'] },
      coins: { p1: p1Coins },
    });

  for (const [coins, taken] of [
    [2, 2],
    [5, 2],
    [1, 1],
    [0, 0],
  ] as const) {
    it(`from a player with ${coins} coins takes ${taken}`, () => {
      const s = base(coins);
      const { state, events } = play(s, [
        ['p0', steal('p1')],
        ['p1', PASS],
        ['p2', PASS],
      ]);
      expect(coinsOf(state, 'p0')).toBe(2 + taken);
      expect(coinsOf(state, 'p1')).toBe(coins - taken);
      expect(state.treasury).toBe(s.treasury);
      const coinEvents = events.filter((e) => e.type === 'coins');
      if (taken === 0) expect(coinEvents).toEqual([]);
      else expect(coinEvents).toEqual([expect.objectContaining({ from: 'p1', to: 'p0', amount: taken, reason: 'steal' })]);
      expect(events.filter((e) => e.type === 'action_resolved')).toHaveLength(1);
    });
  }

  for (const character of ['captain', 'ambassador'] as const) {
    it(`can be blocked by the target with ${character}`, () => {
      const declared = act(base(2), 'p0', steal('p1')).state;
      expect(getPrompt(declared, 'p1')).toEqual({
        kind: 'respond_action',
        canChallenge: true,
        blockCharacters: ['captain', 'ambassador'],
      });
      const { state, events } = play(declared, [
        ['p1', block(character)],
        ['p2', PASS],
        ['p2', PASS],
        ['p0', PASS],
      ]);
      expect(types(events)).toEqual(['block', 'pass', 'pass', 'pass', 'action_blocked', 'turn_start']);
      expect(coinsOf(state, 'p0')).toBe(2);
      expect(coinsOf(state, 'p1')).toBe(2);
    });
  }

  it('rejects a block by a non-target or with the wrong character', () => {
    const declared = act(base(2), 'p0', steal('p1')).state;
    expect(applyMove(declared, 'p2', block('captain'))).toEqual({ ok: false, error: 'invalid_move' });
    expect(applyMove(declared, 'p1', block('contessa'))).toEqual({ ok: false, error: 'invalid_move' });
    expect(applyMove(declared, 'p1', block('duke'))).toEqual({ ok: false, error: 'invalid_move' });
  });

  it('challenged, actor bluffed → actor loses, nothing stolen', () => {
    const s = rig(base(2), { hands: { p0: ['duke', 'contessa'] } });
    const { state } = play(s, [
      ['p0', steal('p1')],
      ['p1', CHALLENGE],
      ['p0', reveal(0)],
    ]);
    expect(coinsOf(state, 'p0')).toBe(2);
    expect(coinsOf(state, 'p1')).toBe(2);
    expect(hiddenCount(state, 'p0')).toBe(1);
    expect(state.actorId).toBe('p1');
  });

  it('challenged by the target, actor has Captain → target loses one then gets its block window', () => {
    const s = play(base(2), [
      ['p0', steal('p1')],
      ['p1', CHALLENGE],
      ['p1', reveal(1)],
    ]).state;
    expect(s.phase).toMatchObject({ kind: 'action_response', responders: ['p1'], blockers: ['p1'], canChallenge: false });
    const { state } = act(s, 'p1', PASS);
    expect(coinsOf(state, 'p0')).toBe(4);
    expect(coinsOf(state, 'p1')).toBe(0);
  });

  it('a NON-target wrong challenger → the target still gets a block window afterwards (even after passing)', () => {
    const s = play(base(2), [
      ['p0', steal('p1')],
      ['p1', PASS],
      ['p2', CHALLENGE],
    ]).state;
    expect(s.phase).toEqual({
      kind: 'lose_influence',
      playerId: 'p2',
      reason: 'wrong_challenge',
      then: { kind: 'after_action_proven' },
    });
    const window = act(s, 'p2', reveal(0)).state;
    expect(window.phase).toEqual({
      kind: 'action_response',
      responders: ['p1'],
      passed: [],
      canChallenge: false,
      blockers: ['p1'],
      blockCharacters: ['captain', 'ambassador'],
    });
    expect(window.phaseSeq).toBeGreaterThan(s.phaseSeq);
    const { state, events } = play(window, [
      ['p1', block('ambassador')],
      ['p2', PASS],
      ['p0', PASS],
    ]);
    expect(types(events)).toEqual(['block', 'pass', 'pass', 'action_blocked', 'turn_start']);
    expect(coinsOf(state, 'p0')).toBe(2);
  });

  it('actor challenges the block; blocker bluffed → blocker loses and the steal resolves', () => {
    const s = rig(base(2), { hands: { p1: ['duke', 'contessa'] } });
    const { state, events } = play(s, [
      ['p0', steal('p1')],
      ['p1', block('captain')],
      ['p2', PASS],
      ['p0', CHALLENGE],
      ['p1', reveal(0)],
    ]);
    expect(types(events).slice(-4)).toEqual(['influence_lost', 'action_resolved', 'coins', 'turn_start']);
    expect(coinsOf(state, 'p0')).toBe(4);
  });

  it('steal from a target eliminated by its bluffed block takes nothing (coins went to the treasury)', () => {
    const s = rig(base(3), { hands: { p1: ['duke', 'contessa'] }, revealed: { p1: [0] } });
    const { state, events } = play(s, [
      ['p0', steal('p1')],
      ['p1', block('captain')],
      ['p2', PASS],
      ['p2', CHALLENGE],
    ]);
    expect(types(events).slice(-6)).toEqual([
      'challenge_result',
      'influence_lost',
      'eliminated',
      'coins',
      'action_resolved',
      'turn_start',
    ]);
    expect(events.at(-3)).toMatchObject({ from: 'p1', to: 'treasury', amount: 3, reason: 'eliminated' });
    expect(coinsOf(state, 'p0')).toBe(2);
    expect(state.actorId).toBe('p2');
  });
});
