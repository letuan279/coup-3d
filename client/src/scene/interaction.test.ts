/**
 * 3D target picking shares the HUD's in-flight lock (clientflow-7), and the cursor / hover
 * highlight follow targeting when it ends under the pointer (perf3d-3, clientflow-8).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ActionOption, GameView, PlayerPublic } from '@shared/types';

const sent: unknown[] = [];
let ack: ((r: { ok: boolean }) => void) | null = null;
vi.mock('../net/socket', () => ({
  api: {
    move: (m: unknown) => {
      sent.push(m);
      return new Promise((r) => (ack = r));
    },
  },
}));

import { useGame } from '../store/useGame';
import { useHud } from '../ui/hudStore';
import { pickAction } from '../ui/moves';
import { chooseTarget, hoverEnter, hoverLeave, isTargetable, registerCursorElement, resetPointer, syncTargeting } from './interaction';

function pub(id: string, seat: number): PlayerPublic {
  return {
    id,
    name: id,
    seat,
    coins: 3,
    influences: [
      { slot: 0, revealed: false, character: null },
      { slot: 1, revealed: false, character: null },
    ],
    hiddenCount: 2,
    eliminated: false,
  };
}

const income: ActionOption = { action: 'income', enabled: true, targets: [], cost: 0 };
const steal: ActionOption = { action: 'steal', enabled: true, targets: ['p2', 'p3'], claim: 'captain', cost: 0 };

function view(): GameView {
  return {
    viewerId: 'p1',
    players: [pub('p1', 0), pub('p2', 1), pub('p3', 2)],
    deckCount: 9,
    treasury: 41,
    turn: 1,
    actorId: 'p1',
    pendingAction: null,
    pendingBlock: null,
    phase: { kind: 'turn', actorId: 'p1' },
    phaseSeq: 7,
    prompt: { kind: 'choose_action', options: [income, steal], mustCoup: false },
    winnerId: null,
    log: [],
    deadline: null,
    phaseDurationMs: null,
    serverNow: 0,
  };
}

const cursorEl = { style: { cursor: '' } } as unknown as HTMLElement;
const hover = () => useGame.getState().ui.hoverPlayerId;

beforeEach(async () => {
  sent.length = 0;
  ack?.({ ok: true });
  await Promise.resolve();
  ack = null;
  useHud.setState({ moveInFlight: false, moveSeq: null });
  useGame.setState((s) => ({ game: view(), ui: { ...s.ui, targeting: null, hoverPlayerId: null } }));
  registerCursorElement(cursorEl);
  resetPointer();
});

afterEach(() => {
  registerCursorElement(null);
});

describe('clicking a character in 3D to pick a target', () => {
  it('goes through the HUD lock: one move, targeting ends, further input waits for the ack', async () => {
    useGame.getState().beginTargeting('steal');
    expect(isTargetable('p2')).toBe(true);
    chooseTarget('p2');
    expect(sent).toEqual([{ type: 'action', action: 'steal', targetId: 'p2' }]);
    expect(useHud.getState().moveInFlight).toBe(true);
    expect(useGame.getState().ui.targeting).toBeNull();

    // The action bar is back for one round trip: a quick second input must not send.
    pickAction(income);
    useGame.getState().beginTargeting('steal');
    chooseTarget('p3');
    expect(sent.length).toBe(1);
    // …and the 3D view shows no valid target meanwhile.
    expect(isTargetable('p3')).toBe(false);

    ack!({ ok: true });
    await Promise.resolve();
    await Promise.resolve();
    expect(useHud.getState().moveInFlight).toBe(false);
    expect(isTargetable('p3')).toBe(true);
  });

  it('ignores clicks on non-targets and outside targeting', () => {
    chooseTarget('p2');
    useGame.getState().beginTargeting('steal');
    chooseTarget('p1');
    chooseTarget('nobody');
    expect(sent).toEqual([]);
    expect(useGame.getState().ui.targeting).toBe('steal');
  });
});

describe('cursor and hover when targeting ends under the pointer', () => {
  it('drops the pointer cursor on Esc but keeps the real 3D hover until the pointer leaves', () => {
    useGame.getState().beginTargeting('steal');
    syncTargeting();
    hoverEnter('p2');
    expect(cursorEl.style.cursor).toBe('pointer');
    useGame.getState().cancelTargeting(); // Esc / digit key / timeout
    syncTargeting();
    expect(cursorEl.style.cursor).toBe('');
    expect(hover()).toBe('p2');
    hoverLeave('p2');
    expect(hover()).toBeNull();
  });

  it('shows the pointer cursor when targeting starts with the pointer already on a target', () => {
    hoverEnter('p3');
    expect(cursorEl.style.cursor).toBe('');
    useGame.getState().beginTargeting('steal');
    syncTargeting();
    expect(cursorEl.style.cursor).toBe('pointer');
  });

  it("clears a HUD target button's hover that outlived the picker", () => {
    useGame.getState().beginTargeting('steal');
    syncTargeting();
    useGame.getState().setHoverPlayer('p3'); // TargetPicker button hovered, no 3D pointer
    syncTargeting();
    expect(hover()).toBe('p3'); // still targeting: keep it
    useGame.getState().cancelTargeting(); // picker unmounts without mouseleave
    syncTargeting();
    expect(hover()).toBeNull();
  });

  it('a new game / mode forgets the pointer and the hover', () => {
    hoverEnter('p2');
    resetPointer();
    expect(hover()).toBeNull();
    expect(cursorEl.style.cursor).toBe('');
  });
});
