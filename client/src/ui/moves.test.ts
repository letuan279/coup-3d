/**
 * In-flight move lock (clientflow-6 / -7) and the B-hotkey block character (clientflow-4).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GameView, InfluenceView, Move } from '@shared/types';

const net = vi.hoisted(() => ({
  sent: [] as Move[],
  pending: [] as ((r: { ok: boolean; error?: string }) => void)[],
}));

vi.mock('../net/socket', () => ({
  api: {
    move: (move: Move) => {
      net.sent.push(move);
      return new Promise((resolve) => net.pending.push(resolve));
    },
  },
}));

import { useGame } from '../store/useGame';
import { useHud } from './hudStore';
import { hotkeyBlockCharacter, isMoveLocked, pickAction, pickTarget, respond, sendMove } from './moves';

function game(phaseSeq: number, prompt: GameView['prompt'] = { kind: 'respond_action', canChallenge: true, blockCharacters: [] }): GameView {
  return {
    viewerId: 'me',
    players: [],
    deckCount: 5,
    treasury: 40,
    turn: 3,
    actorId: 'x',
    pendingAction: null,
    pendingBlock: null,
    knownInDeck: [],
    phase: { kind: 'turn', actorId: 'x' },
    phaseSeq,
    prompt,
    winnerId: null,
    log: [],
    deadline: null,
    phaseDurationMs: null,
    serverNow: 0,
  };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

const choose: GameView['prompt'] = {
  kind: 'choose_action',
  mustCoup: false,
  options: [
    { action: 'income', enabled: true, targets: [], cost: 0 },
    { action: 'steal', enabled: true, targets: ['p2', 'p3'], claim: 'captain', cost: 0 },
  ],
};

beforeEach(() => {
  net.sent.length = 0;
  net.pending.length = 0;
  useHud.setState({ moveInFlight: false, moveSeq: null });
  useGame.setState((s) => ({ game: game(10), ui: { ...s.ui, targeting: null, hoverPlayerId: null } }));
});

describe('move lock', () => {
  it('blocks a second move while the first awaits its ack, then unlocks', async () => {
    const first = sendMove({ type: 'pass' });
    expect(isMoveLocked()).toBe(true);
    expect(await sendMove({ type: 'challenge' })).toBe(false);
    expect(net.sent).toEqual([{ type: 'pass' }]);
    net.pending[0]({ ok: true });
    expect(await first).toBe(true);
    expect(useHud.getState().moveInFlight).toBe(false);
  });

  it('a new phase (e.g. a resync after the ack was lost) releases the lock at once', async () => {
    void sendMove({ type: 'pass' });
    expect(useHud.getState().moveInFlight).toBe(true);
    useGame.setState({ game: game(11) }); // game:state for another phase
    expect(useHud.getState().moveInFlight).toBe(false);
    expect(isMoveLocked()).toBe(false);

    // Inputs work again immediately…
    respond.challenge();
    expect(net.sent).toEqual([{ type: 'pass' }, { type: 'challenge' }]);
    expect(useHud.getState().moveInFlight).toBe(true);
    // …and the old move settling late must not unlock the newer one.
    net.pending[0]({ ok: false, error: 'timeout' });
    await flush();
    expect(useHud.getState().moveInFlight).toBe(true);
    net.pending[1]({ ok: true });
    await flush();
    expect(useHud.getState().moveInFlight).toBe(false);
  });

  it('the same phase pushed again (resync of the same phase) keeps the lock', () => {
    void sendMove({ type: 'pass' });
    useGame.setState({ game: game(10) });
    expect(isMoveLocked()).toBe(true);
  });

  it('pickTarget (HUD button, digit key or 3D click) takes the lock and ignores repeats', () => {
    useGame.setState((s) => ({ game: game(20, choose), ui: { ...s.ui, targeting: 'steal' } }));
    pickTarget('steal', 'p2');
    expect(net.sent).toEqual([{ type: 'action', action: 'steal', targetId: 'p2' }]);
    expect(useGame.getState().ui.targeting).toBeNull();
    expect(isMoveLocked()).toBe(true);
    // A quick second click / digit during the round trip does nothing.
    pickTarget('steal', 'p3');
    pickAction(choose.options[0]);
    expect(net.sent).toHaveLength(1);
  });

  it('pickTarget does nothing when no action is being chosen', () => {
    pickTarget('steal', 'p2');
    expect(net.sent).toEqual([]);
  });
});

describe('B hotkey block character', () => {
  const hand = (...cs: [string, boolean][]): InfluenceView[] =>
    cs.map(([c, revealed], slot) => ({ slot, revealed, character: c as InfluenceView['character'] }));

  it('prefers a block character the player really holds', () => {
    expect(hotkeyBlockCharacter(['captain', 'ambassador'], hand(['duke', false], ['ambassador', false]))).toBe('ambassador');
    expect(hotkeyBlockCharacter(['captain', 'ambassador'], hand(['captain', false], ['ambassador', false]))).toBe('captain');
  });

  it('ignores revealed cards and falls back to the first listed character', () => {
    expect(hotkeyBlockCharacter(['captain', 'ambassador'], hand(['duke', false], ['ambassador', true]))).toBe('captain');
    expect(hotkeyBlockCharacter(['captain', 'ambassador'], undefined)).toBe('captain');
    expect(hotkeyBlockCharacter([], hand(['duke', false]))).toBeNull();
  });
});
