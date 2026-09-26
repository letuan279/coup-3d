import { describe, expect, it } from 'vitest';
import { ACTION_TYPES } from '../types';
import type { GameState, Move } from '../types';
import {
  applyMove,
  getDeciders,
  getDefaultMove,
  getPrompt,
  isGameOver,
  listLegalMoves,
  phaseTimer,
} from './index';
import { CHALLENGE, INCOME, PASS, act, block, coinsOf, newGame, play, player, reveal, rig, types } from './testing';

const coup = (targetId: string): Move => ({ type: 'action', action: 'coup', targetId });
const steal = (targetId: string): Move => ({ type: 'action', action: 'steal', targetId });
const TAX: Move = { type: 'action', action: 'tax' };
const FOREIGN_AID: Move = { type: 'action', action: 'foreign_aid' };

describe('turn order & game over', () => {
  it('skips eliminated players', () => {
    const s = rig(newGame(4), { revealed: { p1: [0, 1], p2: [0, 1] } });
    const { state, events } = act(s, 'p0', INCOME);
    expect(state.actorId).toBe('p3');
    expect(events.at(-1)).toMatchObject({ type: 'turn_start', playerId: 'p3', turn: 2 });
    expect(act(state, 'p3', INCOME).state.actorId).toBe('p0');
  });

  it('ends the game when one player remains', () => {
    const s = rig(newGame(2), { coins: { p0: 7, p1: 4 }, revealed: { p1: [1] } });
    const { state, events } = act(s, 'p0', coup('p1'));
    expect(types(events)).toEqual(['action', 'coins', 'action_resolved', 'influence_lost', 'eliminated', 'coins', 'game_over']);
    expect(events.at(-1)).toMatchObject({ type: 'game_over', winnerId: 'p0' });
    expect(state.phase).toEqual({ kind: 'game_over' });
    expect(state.winnerId).toBe('p0');
    expect(state.pendingAction).toBeNull();
    expect(isGameOver(state)).toBe(true);
    expect(getDeciders(state)).toEqual([]);
    expect(phaseTimer(state)).toBeNull();
    expect(getPrompt(state, 'p0')).toBeNull();
    expect(getDefaultMove(state, 'p0')).toBeNull();
    expect(listLegalMoves(state, 'p0')).toEqual([]);
    expect(applyMove(state, 'p0', INCOME)).toEqual({ ok: false, error: 'game_over' });
    expect(state.treasury + state.players.reduce((n, p) => n + p.coins, 0)).toBe(50);
  });

  it('ends immediately when the actor is caught bluffing on their last card', () => {
    const s = rig(newGame(2), { hands: { p0: ['captain', 'contessa'] }, revealed: { p0: [0] } });
    const { state, events } = play(s, [
      ['p0', TAX],
      ['p1', CHALLENGE],
    ]);
    expect(types(events).slice(-6)).toEqual([
      'challenge_result',
      'action_failed',
      'influence_lost',
      'eliminated',
      'coins',
      'game_over',
    ]);
    expect(events.at(-2)).toMatchObject({ from: 'p0', to: 'treasury', amount: 1, reason: 'eliminated' });
    expect(state.winnerId).toBe('p1');
  });

  it('ends before the action resolves when a wrong challenger is eliminated (no action_resolved)', () => {
    const s = rig(newGame(2), { hands: { p0: ['duke', 'captain'] }, revealed: { p1: [0] } });
    const { state, events } = play(s, [
      ['p0', TAX],
      ['p1', CHALLENGE],
    ]);
    expect(types(events)).not.toContain('action_resolved');
    expect(state.winnerId).toBe('p0');
    expect(coinsOf(state, 'p0')).toBe(1);
  });
});

describe('responder rules', () => {
  const declaredSteal = () =>
    act(rig(newGame(3), { hands: { p0: ['captain', 'duke'], p1: ['captain', 'contessa'] } }), 'p0', steal('p1')).state;

  it('rejects passing twice, non-responders and the actor challenging its own action', () => {
    const s = act(declaredSteal(), 'p1', PASS).state;
    expect(applyMove(s, 'p1', PASS)).toEqual({ ok: false, error: 'not_your_decision' });
    expect(applyMove(s, 'p1', CHALLENGE)).toEqual({ ok: false, error: 'not_your_decision' });
    expect(applyMove(s, 'p0', CHALLENGE)).toEqual({ ok: false, error: 'not_your_decision' });
    expect(applyMove(s, 'p0', PASS)).toEqual({ ok: false, error: 'not_your_decision' });
    expect(applyMove(s, 'ghost', PASS)).toEqual({ ok: false, error: 'unknown_player' });
    expect(applyMove(s, 'p2', INCOME)).toEqual({ ok: false, error: 'invalid_move' });
    expect(applyMove(s, 'p2', reveal(0))).toEqual({ ok: false, error: 'invalid_move' });
    expect(applyMove(s, 'p2', null as unknown as Move)).toEqual({ ok: false, error: 'invalid_move' });
    expect(applyMove(s, 'p2', { type: 'dance' } as unknown as Move)).toEqual({ ok: false, error: 'invalid_move' });
    expect(getDeciders(s)).toEqual(['p2']);
  });

  it('rejects the blocker challenging its own block; the actor may challenge the block', () => {
    const declaredBlock = act(declaredSteal(), 'p1', block('captain')).state;
    // Action window still open for p2: the blocker has responded, the actor is not a responder.
    expect(applyMove(declaredBlock, 'p1', CHALLENGE)).toEqual({ ok: false, error: 'not_your_decision' });
    expect(applyMove(declaredBlock, 'p1', block('ambassador'))).toEqual({ ok: false, error: 'not_your_decision' });
    expect(applyMove(declaredBlock, 'p0', CHALLENGE)).toEqual({ ok: false, error: 'not_your_decision' });
    expect(applyMove(declaredBlock, 'p2', block('captain'))).toEqual({ ok: false, error: 'invalid_move' });
    const blocked = act(declaredBlock, 'p2', PASS).state;
    expect(blocked.phase.kind).toBe('block_response');
    expect(applyMove(blocked, 'p1', CHALLENGE)).toEqual({ ok: false, error: 'not_your_decision' });
    expect(applyMove(blocked, 'p2', block('duke'))).toEqual({ ok: false, error: 'invalid_move' });
    const { events } = act(blocked, 'p0', CHALLENGE);
    expect(events[0]).toMatchObject({ type: 'challenge', challengerId: 'p0', challengedId: 'p1', against: 'block' });
  });

  it('only the current actor may act on its turn', () => {
    const s = newGame(3);
    expect(applyMove(s, 'p1', INCOME)).toEqual({ ok: false, error: 'not_your_decision' });
    expect(applyMove(s, 'p0', PASS)).toEqual({ ok: false, error: 'invalid_move' });
    expect(applyMove(s, 'p0', { type: 'action', action: 'fly' } as unknown as Move)).toEqual({
      ok: false,
      error: 'invalid_move',
    });
  });

  it('eliminated players have no decisions', () => {
    const s = act(rig(newGame(3), { revealed: { p2: [0, 1] } }), 'p0', FOREIGN_AID).state;
    expect(getDeciders(s)).toEqual(['p1']);
    expect(applyMove(s, 'p2', PASS)).toEqual({ ok: false, error: 'not_your_decision' });
  });

  it('rejects revealing an invalid slot', () => {
    const s = act(rig(newGame(3), { coins: { p0: 7 }, revealed: { p1: [] } }), 'p0', coup('p1')).state;
    for (const slot of [-1, 2, 0.5, Number.NaN]) {
      expect(applyMove(s, 'p1', reveal(slot))).toEqual({ ok: false, error: 'invalid_move' });
    }
    const one = act(s, 'p1', reveal(0)).state;
    expect(player(one, 'p1').influences[0].revealed).toBe(true);
  });

  it('reveal of an already revealed slot is rejected', () => {
    const prompted = act(rig(newGame(3), { coins: { p0: 7 } }), 'p0', coup('p1')).state;
    // Not reachable through play (a prompt needs 2 hidden cards) but validation must still hold.
    const s = rig(prompted, { revealed: { p1: [0] } });
    expect(getPrompt(s, 'p1')).toEqual({ kind: 'lose_influence', slots: [1], reason: 'coup' });
    expect(applyMove(s, 'p1', reveal(0))).toEqual({ ok: false, error: 'invalid_move' });
    expect(act(s, 'p1', reveal(1)).events.map((e) => e.type)).toEqual(['influence_lost', 'eliminated', 'coins', 'turn_start']);
  });
});

describe('prompts', () => {
  it('choose_action lists all 7 actions in order with costs, claims and reasons', () => {
    const s = rig(newGame(3), { coins: { p0: 2 } });
    const prompt = getPrompt(s, 'p0');
    if (prompt?.kind !== 'choose_action') throw new Error('expected choose_action');
    expect(prompt.mustCoup).toBe(false);
    expect(prompt.options.map((o) => o.action)).toEqual([...ACTION_TYPES]);
    expect(prompt.options).toEqual([
      { action: 'income', enabled: true, targets: [], cost: 0 },
      { action: 'foreign_aid', enabled: true, targets: [], cost: 0 },
      { action: 'coup', enabled: false, targets: [], cost: 7, disabledReason: 'not_enough_coins' },
      { action: 'tax', enabled: true, targets: [], cost: 0, claim: 'duke' },
      { action: 'assassinate', enabled: false, targets: [], cost: 3, claim: 'assassin', disabledReason: 'not_enough_coins' },
      { action: 'steal', enabled: true, targets: ['p1', 'p2'], cost: 0, claim: 'captain' },
      { action: 'exchange', enabled: true, targets: [], cost: 0, claim: 'ambassador' },
    ]);
    expect(getPrompt(s, 'p1')).toBeNull();
  });

  it('at 10+ coins only coup is enabled', () => {
    const s = rig(newGame(4), { coins: { p0: 11 }, revealed: { p2: [0, 1] } });
    const prompt = getPrompt(s, 'p0');
    if (prompt?.kind !== 'choose_action') throw new Error('expected choose_action');
    expect(prompt.mustCoup).toBe(true);
    for (const o of prompt.options) {
      if (o.action === 'coup') expect(o).toMatchObject({ enabled: true, targets: ['p1', 'p3'] });
      else expect(o).toMatchObject({ enabled: false, disabledReason: 'must_coup' });
    }
    expect(listLegalMoves(s, 'p0')).toEqual([coup('p1'), coup('p3')]);
  });

  it('targets are listed clockwise from the actor', () => {
    const s = act(newGame(4), 'p0', INCOME).state;
    const prompt = getPrompt(s, 'p1');
    if (prompt?.kind !== 'choose_action') throw new Error('expected choose_action');
    expect(prompt.options.find((o) => o.action === 'steal')?.targets).toEqual(['p2', 'p3', 'p0']);
  });

  it('respond_block for responders who have not passed; lose_influence lists unrevealed slots', () => {
    let s = rig(newGame(3), { hands: { p1: ['captain', 'duke'] } });
    s = play(s, [
      ['p0', steal('p1')],
      ['p1', block('captain')],
      ['p2', PASS], // action window
      ['p2', PASS], // block window
    ]).state;
    expect(getPrompt(s, 'p2')).toBeNull();
    expect(getPrompt(s, 'p0')).toEqual({ kind: 'respond_block' });
    expect(listLegalMoves(s, 'p0')).toEqual([PASS, CHALLENGE]);
    s = act(s, 'p0', CHALLENGE).state;
    expect(getPrompt(s, 'p0')).toEqual({ kind: 'lose_influence', slots: [0, 1], reason: 'wrong_challenge' });
    expect(listLegalMoves(s, 'p0')).toEqual([reveal(0), reveal(1)]);
  });

  it('phaseTimer maps phases to timers', () => {
    let s = rig(newGame(3), { hands: { p0: ['ambassador', 'duke'] } });
    expect(phaseTimer(s)).toBe('turn');
    s = act(s, 'p0', { type: 'action', action: 'exchange' }).state;
    expect(phaseTimer(s)).toBe('response');
    s = act(s, 'p1', CHALLENGE).state;
    expect(phaseTimer(s)).toBe('lose_influence');
    s = act(s, 'p1', reveal(0)).state;
    expect(phaseTimer(s)).toBe('exchange');
  });
});

describe('default moves', () => {
  it('turn → income, or coup on the first legal target when forced', () => {
    expect(getDefaultMove(newGame(3), 'p0')).toEqual(INCOME);
    expect(getDefaultMove(newGame(3), 'p1')).toBeNull();
    const forced = rig(newGame(4), { coins: { p0: 10 }, revealed: { p1: [0, 1] } });
    expect(getDefaultMove(forced, 'p0')).toEqual(coup('p2'));
    const { events } = act(forced, 'p0', coup('p2'), { auto: true });
    expect(events[0]).toMatchObject({ type: 'timeout', playerId: 'p0', phase: 'turn', turn: 1 });
    expect(events[1]).toMatchObject({ type: 'action', action: 'coup', targetId: 'p2' });
  });

  it('responses → pass', () => {
    let s = rig(newGame(3), { hands: { p1: ['duke', 'duke'] } });
    s = act(s, 'p0', FOREIGN_AID).state;
    expect(getDefaultMove(s, 'p1')).toEqual(PASS);
    expect(getDefaultMove(s, 'p0')).toBeNull();
    s = act(s, 'p1', block('duke')).state;
    expect(getDefaultMove(s, 'p0')).toEqual(PASS);
    expect(getDefaultMove(s, 'p1')).toBeNull();
    const { events } = act(s, 'p0', PASS, { auto: true });
    expect(types(events)).toEqual(['timeout', 'pass']);
    expect(events[0]).toMatchObject({ phase: 'block_response' });
  });

  it('lose_influence → a seeded random unrevealed slot', () => {
    const slots = new Set<number>();
    for (let seed = 1; seed <= 30; seed++) {
      const s = act(rig(newGame(3, { seed }), { coins: { p0: 7 } }), 'p0', coup('p1')).state;
      const move = getDefaultMove(s, 'p1');
      expect(move).toEqual(getDefaultMove(s, 'p1'));
      if (move?.type !== 'reveal') throw new Error('expected reveal');
      slots.add(move.slot);
      const { events } = act(s, 'p1', move, { auto: true });
      expect(types(events).slice(0, 2)).toEqual(['timeout', 'influence_lost']);
    }
    expect([...slots].sort()).toEqual([0, 1]);

    const one = act(rig(newGame(3), { coins: { p0: 7 }, revealed: { p1: [] } }), 'p0', coup('p1')).state;
    const withRevealed = rig(one, { revealed: { p1: [0] } });
    // A prompt only exists with >= 2 hidden cards; with one left the default must still be legal.
    expect(getDefaultMove(withRevealed, 'p1')).toEqual(reveal(1));
  });

  it('an invalid auto move logs nothing', () => {
    const s = newGame(3);
    expect(applyMove(s, 'p0', PASS, { auto: true })).toEqual({ ok: false, error: 'invalid_move' });
  });

  it('every default move is legal in every phase', () => {
    let s: GameState = rig(newGame(4, { seed: 3 }), { hands: { p0: ['ambassador', 'duke'] } });
    const moves: Array<[string, Move]> = [
      ['p0', { type: 'action', action: 'exchange' }],
      ['p1', CHALLENGE],
    ];
    s = play(s, moves).state;
    for (let i = 0; i < 200 && !isGameOver(s); i++) {
      const [id] = getDeciders(s);
      const move = getDefaultMove(s, id);
      if (!move) throw new Error(`no default for ${id}`);
      expect(listLegalMoves(s, id)).toContainEqual(move);
      s = act(s, id, move, { auto: true }).state;
    }
  });
});

describe('phaseSeq', () => {
  it('strictly increases on each phase change, not on a non-final pass', () => {
    const seqs: number[] = [];
    let s = rig(newGame(3), { hands: { p0: ['captain', 'duke'], p1: ['assassin', 'contessa'] } });
    const step = (id: string, move: Move) => {
      s = act(s, id, move).state;
      seqs.push(s.phaseSeq);
    };
    seqs.push(s.phaseSeq);
    step('p0', steal('p1')); // turn → action_response
    const windowSeq = s.phaseSeq;
    step('p1', PASS); // still action_response
    expect(s.phaseSeq).toBe(windowSeq);
    step('p2', CHALLENGE); // → lose_influence (p2)
    step('p2', reveal(0)); // → re-opened action_response for the target
    step('p1', block('ambassador')); // → block_response
    step('p0', PASS);
    step('p2', PASS); // → action_blocked → turn
    expect(s.phase.kind).toBe('turn');
    expect(seqs).toEqual([seqs[0], seqs[0] + 1, seqs[0] + 1, seqs[0] + 2, seqs[0] + 3, seqs[0] + 4, seqs[0] + 4, seqs[0] + 5]);
  });

  it('counts every intermediate phase inside a single move', () => {
    const s = rig(newGame(3), { hands: { p0: ['duke', 'captain'] } });
    const declared = act(s, 'p0', TAX).state;
    const passed = act(declared, 'p1', PASS).state;
    // Final pass: resolve → turn (one phase change).
    expect(act(passed, 'p2', PASS).state.phaseSeq).toBe(passed.phaseSeq + 1);
  });
});
