/**
 * clientflow-8: a HUD target button clears the hover highlight it set when it unmounts (Esc, digit
 * key, Cancel via keyboard, phase change) — but never a hover the 3D scene owns.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { useGame } from '../../store/useGame';
import { claimHover, releaseHover, type HoverOwner } from './hoverOwner';

const hover = () => useGame.getState().ui.hoverPlayerId;

beforeEach(() => useGame.getState().setHoverPlayer(null));

describe('hover ownership', () => {
  it('unmount after mouseenter/focus (no mouseleave fired) clears the highlight', () => {
    const owner: HoverOwner = { current: false };
    claimHover(owner, 'p2');
    expect(hover()).toBe('p2');
    releaseHover(owner, 'p2'); // the unmount cleanup
    expect(hover()).toBeNull();
  });

  it('a button that never set the hover leaves a 3D hover alone', () => {
    useGame.getState().setHoverPlayer('p3'); // pointer over a 3D character
    const owner: HoverOwner = { current: false };
    releaseHover(owner, 'p3');
    expect(hover()).toBe('p3');
  });

  it('does not clear a hover that moved on to another player', () => {
    const owner: HoverOwner = { current: false };
    claimHover(owner, 'p2');
    useGame.getState().setHoverPlayer('p4'); // the scene took over
    releaseHover(owner, 'p2');
    expect(hover()).toBe('p4');
  });

  it('mouseleave then unmount is harmless', () => {
    const owner: HoverOwner = { current: false };
    claimHover(owner, 'p2');
    releaseHover(owner, 'p2');
    useGame.getState().setHoverPlayer('p5');
    releaseHover(owner, 'p2');
    expect(hover()).toBe('p5');
  });
});
