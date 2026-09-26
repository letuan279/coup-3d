import { describe, expect, it } from 'vitest';
import type { GameState, GameView, Move } from '../types';
import { toView } from './index';
import { CHALLENGE, INCOME, PASS, act, block, newGame, play, player, reveal, rig } from './testing';

const CARD_ID = /"c\d{1,2}"/;

/** Asserts `view` hides everything `viewerId` must not know about `state`. */
function assertRedacted(state: GameState, view: GameView, viewerId: string | null): void {
  const json = JSON.stringify(view);
  expect(json).not.toMatch(CARD_ID);
  expect(json).not.toContain('"drawn"');
  expect(json).not.toContain('"deck"');
  expect(json).not.toContain('rngState');
  for (const p of state.players) {
    const pv = view.players.find((x) => x.id === p.id);
    expect(pv).toBeDefined();
    p.influences.forEach((inf, slot) => {
      const iv = pv?.influences[slot];
      expect(iv?.revealed).toBe(inf.revealed);
      const visible = inf.revealed || p.id === viewerId;
      expect(iv?.character).toBe(visible ? inf.card.character : null);
    });
    expect(pv?.hiddenCount).toBe(p.influences.filter((i) => !i.revealed).length);
  }
  if (viewerId === null) expect(view.prompt).toBeNull();
  if (view.phase.kind === 'exchange' && viewerId !== state.actorId) expect(view.prompt).toBeNull();
}

function everyViewer(state: GameState): Array<string | null> {
  return [null, ...state.players.map((p) => p.id)];
}

describe('toView', () => {
  it('shows only the viewer’s own hidden cards and fills server fields with placeholders', () => {
    const s = newGame(4);
    for (const viewer of everyViewer(s)) {
      const view = toView(s, viewer);
      assertRedacted(s, view, viewer);
      expect(view.viewerId).toBe(viewer);
      expect(view.deadline).toBeNull();
      expect(view.phaseDurationMs).toBeNull();
      expect(view.serverNow).toBe(0);
      expect(view.deckCount).toBe(7);
      expect(view.treasury).toBe(s.treasury);
      expect(view.phase).toEqual({ kind: 'turn', actorId: 'p0' });
    }
    expect(toView(s, 'p0').prompt?.kind).toBe('choose_action');
    expect(toView(s, 'p1').prompt).toBeNull();
    expect(toView(s, null).prompt).toBeNull();
  });

  it('shows revealed cards to everyone', () => {
    const s = rig(newGame(3), { hands: { p1: ['duke', 'contessa'] }, revealed: { p1: [1] } });
    for (const viewer of everyViewer(s)) {
      const view = toView(s, viewer);
      assertRedacted(s, view, viewer);
      expect(view.players[1].influences[1]).toEqual({ slot: 1, revealed: true, character: 'contessa' });
    }
  });

  it('keeps an exchange draw private to the actor and excludes it from deckCount', () => {
    let s = rig(newGame(3), { hands: { p0: ['duke', 'captain'] }, deckTop: ['contessa', 'assassin'] });
    s = play(s, [
      ['p0', { type: 'action', action: 'exchange' }],
      ['p1', PASS],
      ['p2', PASS],
    ]).state;
    expect(s.phase.kind).toBe('exchange');
    for (const viewer of everyViewer(s)) {
      const view = toView(s, viewer);
      assertRedacted(s, view, viewer);
      expect(view.deckCount).toBe(7);
      expect(view.phase).toEqual({
        kind: 'exchange',
        actorId: 'p0',
        action: { type: 'exchange', actorId: 'p0', claim: 'ambassador' },
      });
    }
    expect(toView(s, 'p0').prompt).toEqual({
      kind: 'exchange',
      cards: ['duke', 'captain', 'contessa', 'assassin'],
      keepCount: 2,
    });
    expect(toView(s, 'p1').prompt).toBeNull();
  });

  it('carries action / block context in response and lose_influence phases', () => {
    let s = rig(newGame(3), { hands: { p1: ['duke', 'contessa'] }, coins: { p0: 3 } });
    s = act(s, 'p0', { type: 'action', action: 'assassinate', targetId: 'p1' }).state;
    const action = { type: 'assassinate', actorId: 'p0', targetId: 'p1', claim: 'assassin' };
    expect(toView(s, 'p2').phase).toEqual({
      kind: 'action_response',
      action,
      responders: ['p1', 'p2'],
      passed: [],
      canChallenge: true,
      blockers: ['p1'],
      blockCharacters: ['contessa'],
    });
    expect(toView(s, 'p2').prompt).toEqual({ kind: 'respond_action', canChallenge: true, blockCharacters: [] });
    s = act(s, 'p1', block('contessa')).state;
    const blockDecl = { blockerId: 'p1', character: 'contessa' };
    expect(toView(s, 'p0').phase).toEqual({ kind: 'block_response', action, block: blockDecl, responders: ['p2', 'p0'], passed: [] });
    expect(toView(s, 'p0').pendingBlock).toEqual(blockDecl);
    s = play(s, [
      ['p2', PASS],
      ['p0', CHALLENGE],
    ]).state;
    // p1 really had the Contessa → p0 loses (single choice needed: p0 has 2 cards).
    expect(toView(s, 'p1').phase).toEqual({
      kind: 'lose_influence',
      playerId: 'p0',
      reason: 'wrong_challenge',
      action,
      block: blockDecl,
    });
    for (const viewer of everyViewer(s)) assertRedacted(s, toView(s, viewer), viewer);
  });

  it('limits the log to the most recent entries', () => {
    const s = play(newGame(3), [
      ['p0', INCOME],
      ['p1', INCOME],
    ]).state;
    expect(toView(s, 'p0').log).toEqual(s.log);
    expect(toView(s, 'p0', { logLimit: 3 }).log).toEqual(s.log.slice(-3));
    expect(toView(s, 'p0', { logLimit: 0 }).log).toEqual([]);
    expect(toView(s, 'p0', { logLimit: 500 }).log).toEqual(s.log);
  });

  it('returns detached copies (mutating a view never touches the state)', () => {
    const s = act(newGame(3), 'p0', { type: 'action', action: 'foreign_aid' }).state;
    const snapshot = structuredClone(s);
    const view = toView(s, 'p1');
    view.players[1].influences[0].character = 'duke';
    view.log[0].turn = 99;
    view.pendingAction!.actorId = 'x';
    if (view.phase.kind === 'action_response') view.phase.passed.push('p9');
    expect(s).toEqual(snapshot);
  });

  it('never leaks card ids or hidden cards through a whole scripted game', () => {
    let s = rig(newGame(3), {
      hands: { p0: ['duke', 'captain'], p1: ['ambassador', 'contessa'], p2: ['assassin', 'duke'] },
      coins: { p0: 3, p1: 3, p2: 3 },
    });
    const steps: Array<[string, Move]> = [
      ['p0', { type: 'action', action: 'tax' }],
      ['p1', CHALLENGE],
      ['p1', reveal(1)],
      ['p1', { type: 'action', action: 'exchange' }],
      ['p2', PASS],
      ['p0', PASS],
      ['p1', { type: 'exchange', keep: [1] }],
      ['p2', { type: 'action', action: 'assassinate', targetId: 'p0' }],
      ['p0', PASS],
      ['p1', PASS],
      ['p0', reveal(0)],
    ];
    for (const [id, move] of steps) {
      s = act(s, id, move).state;
      for (const viewer of everyViewer(s)) assertRedacted(s, toView(s, viewer), viewer);
      expect(JSON.stringify(s.log)).not.toMatch(CARD_ID);
    }
    expect(player(s, 'p0').influences[0].revealed).toBe(true);
  });
});
