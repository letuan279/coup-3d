/**
 * SPEC §1.1 "block while others may still challenge the action": a target's block during a
 * challengeable action_response (steal / assassinate) must not cut off the other players'
 * chance to challenge the ACTION's claim (official rules: "Once an action or counteraction is
 * declared other players must be given an opportunity to challenge").
 */
import { describe, expect, it } from 'vitest';
import type { Character, GameState, LoggedEvent, Move } from '../types';
import { applyMove, getDeciders, getDefaultMove, getPrompt, listLegalMoves, toView } from './index';
import { CHALLENGE, PASS, act, block, coinsOf, hiddenCount, newGame, play, player, reveal, rig, types } from './testing';

const steal = (targetId: string): Move => ({ type: 'action', action: 'steal', targetId });
const assassinate = (targetId: string): Move => ({ type: 'action', action: 'assassinate', targetId });
const FOREIGN_AID: Move = { type: 'action', action: 'foreign_aid' };
const RESPOND_ACTION_NO_BLOCK = { kind: 'respond_action', canChallenge: true, blockCharacters: [] };

/** Exactly one of action_resolved / action_blocked / action_failed per declared action. */
function outcomes(events: readonly LoggedEvent[]): string[] {
  return types(events).filter((t) => t === 'action_resolved' || t === 'action_blocked' || t === 'action_failed');
}

/**
 * 4 players, p0 to act with 3 coins, p1 (the target) has 4 coins and neither Captain,
 * Ambassador nor Contessa: its blocks are bluffs. p3's first card (a Captain) is face up. When
 * p0 has no Captain, p2 holds the other two, so p2 KNOWS p0's Captain claim is impossible.
 */
function fourPlayers(p0: [Character, Character], hands: Record<string, [Character, Character]> = {}): GameState {
  const p2: [Character, Character] = p0.includes('captain') ? ['duke', 'assassin'] : ['captain', 'captain'];
  return rig(newGame(4), {
    hands: { p0, p1: ['duke', 'assassin'], p2, p3: ['captain', 'contessa'], ...hands },
    revealed: { p3: [0] },
    coins: { p0: 3, p1: 4 },
  });
}

describe('block during a challengeable action window', () => {
  it('keeps the same action_response window open for the other responders (no phaseSeq bump)', () => {
    const declared = act(fourPlayers(['duke', 'contessa']), 'p0', steal('p1')).state;
    const { state: s, events } = act(declared, 'p1', block('ambassador'));

    expect(types(events)).toEqual(['block']);
    expect(events[0]).toMatchObject({ blockerId: 'p1', character: 'ambassador', actorId: 'p0', action: 'steal' });
    expect(s.phaseSeq).toBe(declared.phaseSeq);
    expect(s.pendingBlock).toEqual({ blockerId: 'p1', character: 'ambassador' });
    expect(s.phase).toEqual({
      kind: 'action_response',
      responders: ['p1', 'p2', 'p3'],
      passed: ['p1'],
      canChallenge: true,
      blockers: ['p1'],
      blockCharacters: ['captain', 'ambassador'],
    });

    // The remaining responders' prompts are unchanged: challenge the action or pass.
    for (const id of ['p2', 'p3']) {
      expect(getPrompt(s, id)).toEqual(RESPOND_ACTION_NO_BLOCK);
      expect(getPrompt(s, id)).toEqual(getPrompt(declared, id));
      expect(listLegalMoves(s, id)).toEqual([PASS, CHALLENGE]);
      expect(getDefaultMove(s, id)).toEqual(PASS);
    }
    expect(getDeciders(s)).toEqual(['p2', 'p3']);
    // The blocker has responded; the actor is not a responder of the action window.
    expect(getPrompt(s, 'p1')).toBeNull();
    expect(getDefaultMove(s, 'p1')).toBeNull();
    expect(listLegalMoves(s, 'p1')).toEqual([]);
    expect(applyMove(s, 'p1', block('captain'))).toEqual({ ok: false, error: 'not_your_decision' });
    expect(applyMove(s, 'p1', CHALLENGE)).toEqual({ ok: false, error: 'not_your_decision' });
    expect(applyMove(s, 'p0', CHALLENGE)).toEqual({ ok: false, error: 'not_your_decision' });
    expect(applyMove(s, 'p2', block('captain'))).toEqual({ ok: false, error: 'invalid_move' });

    // Every view exposes the pending block during this action_response.
    for (const viewer of [null, 'p0', 'p1', 'p2', 'p3']) {
      const view = toView(s, viewer);
      expect(view.pendingBlock).toEqual({ blockerId: 'p1', character: 'ambassador' });
      expect(view.phase.kind).toBe('action_response');
      if (view.phase.kind === 'action_response') expect(view.phase.passed).toEqual(['p1']);
    }
  });

  it('all remaining responders pass → block_response for the recorded block (new phaseSeq)', () => {
    const blocked = play(fourPlayers(['captain', 'contessa']), [
      ['p0', steal('p1')],
      ['p1', block('ambassador')],
    ]).state;
    const oneLeft = act(blocked, 'p2', PASS);
    expect(types(oneLeft.events)).toEqual(['pass']);
    expect(oneLeft.state.phaseSeq).toBe(blocked.phaseSeq);
    expect(oneLeft.state.phase.kind).toBe('action_response');

    const { state: s, events } = act(oneLeft.state, 'p3', PASS);
    expect(types(events)).toEqual(['pass']);
    expect(s.phaseSeq).toBe(blocked.phaseSeq + 1);
    expect(s.phase).toEqual({ kind: 'block_response', responders: ['p2', 'p3', 'p0'], passed: [] });
    expect(s.pendingBlock).toEqual({ blockerId: 'p1', character: 'ambassador' });
    for (const id of ['p2', 'p3', 'p0']) expect(getPrompt(s, id)).toEqual({ kind: 'respond_block' });
    expect(getPrompt(s, 'p1')).toBeNull();

    // Everyone lets the block stand.
    const done = play(s, [
      ['p2', PASS],
      ['p3', PASS],
      ['p0', PASS],
    ]);
    expect(types(done.events)).toEqual(['pass', 'pass', 'pass', 'action_blocked', 'turn_start']);
    expect(coinsOf(done.state, 'p0')).toBe(3);
    expect(coinsOf(done.state, 'p1')).toBe(4);
    expect(outcomes(done.state.log)).toEqual(['action_blocked']);
  });

  it('a pass-through block can still be challenged: blocker bluffed → steal resolves', () => {
    const { state, events } = play(fourPlayers(['captain', 'contessa']), [
      ['p0', steal('p1')],
      ['p1', block('ambassador')],
      ['p2', PASS],
      ['p3', PASS],
      ['p0', CHALLENGE],
      ['p1', reveal(1)],
    ]);
    expect(events.find((e) => e.type === 'challenge')).toMatchObject({ challengerId: 'p0', against: 'block' });
    expect(outcomes(events)).toEqual(['action_resolved']);
    expect(coinsOf(state, 'p0')).toBe(5);
    expect(coinsOf(state, 'p1')).toBe(2);
  });

  it('challenge of the action, actor bluffed → action_failed, block discarded (steal)', () => {
    const blocked = play(fourPlayers(['duke', 'contessa']), [
      ['p0', steal('p1')],
      ['p1', block('ambassador')],
    ]).state;
    const { state: s, events } = act(blocked, 'p2', CHALLENGE);
    expect(types(events)).toEqual(['challenge', 'challenge_result', 'action_failed']);
    expect(events[0]).toMatchObject({ challengerId: 'p2', challengedId: 'p0', character: 'captain', against: 'action' });
    expect(events[1]).toMatchObject({ challengedHadCard: false });
    expect(s.pendingBlock).toBeNull();
    expect(s.phase).toEqual({ kind: 'lose_influence', playerId: 'p0', reason: 'caught_bluffing', then: { kind: 'end_turn' } });
    const view = toView(s, 'p0');
    expect(view.pendingBlock).toBeNull();
    expect(view.phase).toMatchObject({ kind: 'lose_influence', playerId: 'p0', reason: 'caught_bluffing', block: null });

    const after = act(s, 'p0', reveal(0));
    expect(types(after.events)).toEqual(['influence_lost', 'turn_start']);
    expect(outcomes(after.state.log)).toEqual(['action_failed']);
    expect(coinsOf(after.state, 'p0')).toBe(3);
    expect(coinsOf(after.state, 'p1')).toBe(4);
    // The bluffing blocker is never exposed: nobody challenged the block.
    expect(hiddenCount(after.state, 'p1')).toBe(2);
    expect(after.state.actorId).toBe('p1');
  });

  it('challenge of the action, actor bluffed → Assassinate refunded, no action_blocked', () => {
    // p2 + p3 hold every Assassin (p3's face up): p0's Assassin claim is impossible.
    const s = fourPlayers(['duke', 'contessa'], {
      p1: ['duke', 'captain'],
      p2: ['assassin', 'assassin'],
      p3: ['assassin', 'captain'],
    });
    const { state, events } = play(s, [
      ['p0', assassinate('p1')],
      ['p1', block('contessa')],
      ['p3', CHALLENGE],
    ]);
    expect(types(events)).toEqual([
      'action',
      'coins',
      'block',
      'challenge',
      'challenge_result',
      'coins',
      'action_failed',
    ]);
    expect(events[5]).toMatchObject({ from: 'treasury', to: 'p0', amount: 3, reason: 'refund' });
    expect(coinsOf(state, 'p0')).toBe(3);
    expect(state.pendingBlock).toBeNull();
    expect(state.phase).toMatchObject({ kind: 'lose_influence', playerId: 'p0', reason: 'caught_bluffing' });
  });

  it('challenge of the action, actor proven → challenger loses, then straight to block_response (no second target window)', () => {
    const blocked = play(fourPlayers(['captain', 'contessa']), [
      ['p0', steal('p1')],
      ['p1', block('ambassador')],
    ]).state;
    const challenged = act(blocked, 'p2', CHALLENGE);
    expect(types(challenged.events)).toEqual(['challenge', 'challenge_result', 'card_replaced']);
    expect(challenged.events[0]).toMatchObject({ challengerId: 'p2', challengedId: 'p0', against: 'action' });
    const losing = challenged.state;
    expect(losing.phase).toEqual({
      kind: 'lose_influence',
      playerId: 'p2',
      reason: 'wrong_challenge',
      then: { kind: 'after_action_proven' },
    });
    expect(losing.pendingBlock).toEqual({ blockerId: 'p1', character: 'ambassador' });
    // The loss is about the ACTION challenge, not the block (the block stays public at the top level).
    const view = toView(losing, 'p2');
    expect(view.phase).toMatchObject({ kind: 'lose_influence', reason: 'wrong_challenge', block: null });
    expect(view.pendingBlock).toEqual({ blockerId: 'p1', character: 'ambassador' });

    const { state: s, events } = act(losing, 'p2', reveal(0));
    expect(types(events)).toEqual(['influence_lost']);
    expect(s.phase).toEqual({ kind: 'block_response', responders: ['p2', 'p3', 'p0'], passed: [] });
    expect(s.pendingBlock).toEqual({ blockerId: 'p1', character: 'ambassador' });
    expect(getPrompt(s, 'p1')).toBeNull();
    expect(getPrompt(s, 'p0')).toEqual({ kind: 'respond_block' });

    // The actor catches the bluffed block → p1 loses a card and the steal resolves.
    const done = play(s, [
      ['p0', CHALLENGE],
      ['p1', reveal(0)],
    ]);
    expect(outcomes(done.state.log)).toEqual(['action_resolved']);
    expect(coinsOf(done.state, 'p0')).toBe(5);
    expect(hiddenCount(done.state, 'p2')).toBe(1);
    expect(hiddenCount(done.state, 'p1')).toBe(1);
  });

  it('a wrong action challenger on its last card is eliminated and left out of the block_response', () => {
    const s = rig(fourPlayers(['captain', 'contessa']), { revealed: { p2: [0], p3: [0] } });
    const { state, events } = play(s, [
      ['p0', steal('p1')],
      ['p1', block('captain')],
      ['p2', CHALLENGE],
    ]);
    // Straight into block_response after the elimination: no further event.
    expect(types(events)).toEqual([
      'action',
      'block',
      'challenge',
      'challenge_result',
      'card_replaced',
      'influence_lost',
      'eliminated',
      'coins',
    ]);
    expect(player(state, 'p2').eliminated).toBe(true);
    expect(state.phase).toEqual({ kind: 'block_response', responders: ['p3', 'p0'], passed: [] });
    expect(outcomes(state.log)).toEqual([]);
    const done = play(state, [
      ['p3', PASS],
      ['p0', PASS],
    ]);
    expect(outcomes(done.state.log)).toEqual(['action_blocked']);
  });

  it('proven Assassin, bluffed Contessa pending → the target can still lose both cards', () => {
    const s = rig(newGame(3), {
      hands: { p0: ['assassin', 'duke'], p1: ['duke', 'captain'], p2: ['contessa', 'ambassador'] },
      coins: { p0: 3 },
    });
    const { state, events } = play(s, [
      ['p0', assassinate('p1')],
      ['p1', block('contessa')],
      ['p2', CHALLENGE], // wrong: p0 has the Assassin
      ['p2', reveal(1)],
      ['p0', CHALLENGE], // block_response: p1 has no Contessa
      ['p1', reveal(0)],
    ]);
    expect(outcomes(events)).toEqual(['action_resolved']);
    expect(player(state, 'p1').eliminated).toBe(true);
    expect(hiddenCount(state, 'p2')).toBe(1);
    expect(state.actorId).toBe('p2');
  });

  it('block after every other responder already passed → block_response at once', () => {
    const passed = play(fourPlayers(['captain', 'contessa']), [
      ['p0', steal('p1')],
      ['p2', PASS],
      ['p3', PASS],
    ]).state;
    const { state, events } = act(passed, 'p1', block('captain'));
    expect(types(events)).toEqual(['block']);
    expect(state.phaseSeq).toBe(passed.phaseSeq + 1);
    expect(state.phase).toEqual({ kind: 'block_response', responders: ['p2', 'p3', 'p0'], passed: [] });
  });

  it('2-player game: the target is the only responder → block_response at once', () => {
    const s = rig(newGame(2), { hands: { p0: ['captain', 'duke'], p1: ['contessa', 'duke'] }, coins: { p0: 3 } });
    for (const [move, character] of [
      [steal('p1'), 'captain'],
      [assassinate('p1'), 'contessa'],
    ] as const) {
      const declared = act(s, 'p0', move).state;
      const { state, events } = act(declared, 'p1', block(character));
      expect(types(events)).toEqual(['block']);
      expect(state.phaseSeq).toBe(declared.phaseSeq + 1);
      expect(state.phase).toEqual({ kind: 'block_response', responders: ['p0'], passed: [] });
    }
  });

  it('foreign aid is unchanged: a Duke block goes straight to block_response', () => {
    const declared = act(fourPlayers(['captain', 'contessa']), 'p0', FOREIGN_AID).state;
    expect(getPrompt(declared, 'p2')).toEqual({ kind: 'respond_action', canChallenge: false, blockCharacters: ['duke'] });
    const { state, events } = act(declared, 'p1', block('duke'));
    expect(types(events)).toEqual(['block']);
    expect(state.phaseSeq).toBe(declared.phaseSeq + 1);
    expect(state.phase).toEqual({ kind: 'block_response', responders: ['p2', 'p3', 'p0'], passed: [] });
    // Would-be Duke blockers are cut off (they can only challenge or accept p1's block).
    expect(getPrompt(state, 'p2')).toEqual({ kind: 'respond_block' });
    expect(applyMove(state, 'p2', block('duke'))).toEqual({ ok: false, error: 'invalid_move' });
  });

  it('timeouts in the kept-open window pass for the remaining responders, then the block window starts', () => {
    let s = play(fourPlayers(['captain', 'contessa']), [
      ['p0', steal('p1')],
      ['p1', block('ambassador')],
    ]).state;
    const windowSeq = s.phaseSeq;
    // What the server does on expiry: default move for every current decider while phaseSeq holds.
    const events: LoggedEvent[] = [];
    for (const id of getDeciders(s)) {
      if (s.phaseSeq !== windowSeq) break;
      const move = getDefaultMove(s, id) as Move;
      const r = act(s, id, move, { auto: true });
      s = r.state;
      events.push(...r.events);
    }
    expect(events.map((e) => (e.type === 'timeout' ? `timeout:${e.playerId}:${e.phase}` : e.type))).toEqual([
      'timeout:p2:action_response',
      'pass',
      'timeout:p3:action_response',
      'pass',
    ]);
    expect(s.phaseSeq).toBe(windowSeq + 1);
    expect(s.phase).toEqual({ kind: 'block_response', responders: ['p2', 'p3', 'p0'], passed: [] });

    // Block window times out too → the block stands.
    for (const id of getDeciders(s)) s = act(s, id, getDefaultMove(s, id) as Move, { auto: true }).state;
    expect(outcomes(s.log)).toEqual(['action_blocked']);
    expect(s.phase.kind).toBe('turn');
    expect(s.actorId).toBe('p1');
  });

  it('a late human challenge in the kept-open window is still valid (same phaseSeq)', () => {
    const declared = act(fourPlayers(['duke', 'contessa']), 'p0', steal('p1')).state;
    const seenBy = { p2: declared.phaseSeq };
    const blocked = act(declared, 'p1', block('ambassador')).state;
    // p2 answers the prompt it saw before the block arrived.
    expect(blocked.phaseSeq).toBe(seenBy.p2);
    const res = applyMove(blocked, 'p2', CHALLENGE);
    expect(res.ok).toBe(true);
    if (res.ok) expect(outcomes(res.events)).toEqual(['action_failed']);
  });
});
