import { describe, expect, it } from 'vitest';
import { getDeciders } from '@shared/engine';
import { newGame } from '@shared/engine/testing';
import { createRng } from '@shared/rng';
import type { LoggedEvent } from '@shared/types';
import { DEFAULT_TIMING } from '../timing';
import { botEmoteReactions } from './botEmotes';
import { botThinkDelay, playBotMove } from './botDriver';

describe('botThinkDelay', () => {
  const base = { level: 'normal' as const, timing: DEFAULT_TIMING };

  it('stays within the think range for the level', () => {
    for (let i = 0; i < 200; i++) {
      const d = botThinkDelay({ ...base, now: 10_000, phaseStartedAt: 0, deadline: 100_000, rand: Math.random });
      expect(d).toBeGreaterThanOrEqual(DEFAULT_TIMING.botThinkMs.normal[0]);
      expect(d).toBeLessThanOrEqual(DEFAULT_TIMING.botThinkMs.normal[1]);
    }
  });

  it('never acts before the phase settled', () => {
    const timing = { ...DEFAULT_TIMING, botThinkMs: { ...DEFAULT_TIMING.botThinkMs, normal: [10, 20] as [number, number] } };
    const d = botThinkDelay({ ...base, timing, now: 100, phaseStartedAt: 100, deadline: 10_000, rand: () => 0 });
    expect(d).toBe(DEFAULT_TIMING.minPhaseSettleMs);
  });

  it('always acts before deadline − margin', () => {
    const d = botThinkDelay({ ...base, now: 0, phaseStartedAt: 0, deadline: 1500, rand: () => 1 });
    expect(d).toBe(1500 - DEFAULT_TIMING.botDeadlineMarginMs);
    expect(botThinkDelay({ ...base, now: 0, phaseStartedAt: 0, deadline: 100, rand: () => 1 })).toBe(0);
  });
});

describe('playBotMove', () => {
  it('applies the AI move for the decider', () => {
    const g = newGame(3);
    const res = playBotMove(g, 'p0', { level: 'hard', rand: createRng(5) });
    expect(res?.ok).toBe(true);
    expect(res!.state.phaseSeq).toBeGreaterThanOrEqual(g.phaseSeq);
    expect(res!.events.some((e) => e.type === 'action' && e.actorId === 'p0')).toBe(true);
  });

  it('falls back to the default move on AI errors or illegal moves', () => {
    const g = newGame(3);
    const thrown = playBotMove(g, 'p0', { level: 'easy', rand: Math.random }, () => {
      throw new Error('nope');
    });
    expect(thrown!.events[0]).toMatchObject({ type: 'action', action: 'income' });
    const illegal = playBotMove(g, 'p0', { level: 'easy', rand: Math.random }, () => ({ type: 'challenge' }));
    expect(illegal!.events[0]).toMatchObject({ type: 'action', action: 'income' });
  });

  it('returns null for a player without a decision', () => {
    const g = newGame(3);
    expect(getDeciders(g)).toEqual(['p0']);
    expect(playBotMove(g, 'p1', { level: 'easy', rand: Math.random })).toBeNull();
  });
});

describe('botEmoteReactions', () => {
  const ev = (e: Record<string, unknown>, seq: number) => ({ ...e, seq, turn: 1 }) as LoggedEvent;

  it('calls out a caught bluff and celebrates a win — bots only', () => {
    const events = [
      ev({ type: 'challenge_result', challengerId: 'b1', challengedId: 'p0', character: 'duke', challengedHadCard: false }, 1),
      ev({ type: 'game_over', winnerId: 'b2' }, 2),
    ];
    const out = botEmoteReactions(events, (id) => id.startsWith('b'), () => 0);
    expect(out).toEqual([
      { playerId: 'b1', emote: 'liar' },
      { playerId: 'b2', emote: 'gg' },
    ]);
    expect(botEmoteReactions(events, () => false, () => 0)).toEqual([]);
    expect(botEmoteReactions(events, () => true, () => 0.99)).toEqual([]);
  });
});
