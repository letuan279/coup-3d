import { describe, expect, it } from 'vitest';
import { createRng } from '../rng';
import type { BotLevel, GameEvent, GameView, PromptKind } from '../types';
import { decideBotMove } from './index';
import { decidePolicyMove } from './policy';
import { actionEvent, buildView, chooseActionPrompt, declared, legalityError, randomView } from './test-helpers';
import type { SeatSpec } from './test-helpers';

const LEVELS: readonly BotLevel[] = ['easy', 'normal', 'hard'];

describe('bot legality (property)', () => {
  it('returns a legal move for thousands of random views, every prompt kind and level', () => {
    const rand = createRng(12345);
    const seen = new Map<PromptKind, number>();
    let policyThrows = 0;
    let policyIllegal = 0;
    for (let i = 0; i < 3000; i++) {
      const view = randomView(rand);
      const prompt = view.prompt!;
      seen.set(prompt.kind, (seen.get(prompt.kind) ?? 0) + 1);
      for (const level of LEVELS) {
        const ctx = { level, rand: createRng(i * 7 + level.length) };
        const move = decideBotMove(view, ctx);
        const err = legalityError(prompt, move);
        if (err) throw new Error(`illegal move ${JSON.stringify(move)} for ${JSON.stringify(prompt)}: ${err}`);
        try {
          const raw = decidePolicyMove(view, prompt, { level, rand: createRng(i) });
          if (legalityError(prompt, raw)) policyIllegal++;
        } catch {
          policyThrows++;
        }
      }
    }
    // The policy itself (not only the safety net) must cope with every view.
    expect(policyThrows).toBe(0);
    expect(policyIllegal).toBe(0);
    for (const kind of ['choose_action', 'respond_action', 'respond_block', 'lose_influence', 'exchange'] as const) {
      expect(seen.get(kind) ?? 0).toBeGreaterThan(300);
    }
  });

  it('never throws on malformed input and falls back to a legal move', () => {
    const rand = createRng(7);
    const view = randomView(rand);
    const broken = { ...view, players: [], log: [{ type: 'nonsense' }] } as unknown as GameView;
    const move = decideBotMove(broken, { level: 'hard', rand: () => Number.NaN });
    expect(legalityError(view.prompt!, move)).toBeNull();
    const throwingRand = () => {
      throw new Error('boom');
    };
    expect(legalityError(view.prompt!, decideBotMove(view, { level: 'normal', rand: throwingRand }))).toBeNull();
    expect(decideBotMove({ ...view, prompt: null }, { level: 'easy', rand })).toEqual({ type: 'pass' });
  });

  it('is deterministic for a fixed random source', () => {
    const gen = createRng(99);
    for (let i = 0; i < 400; i++) {
      const view = randomView(gen);
      for (const level of LEVELS) {
        const a = decideBotMove(view, { level, rand: createRng(1000 + i) });
        const b = decideBotMove(structuredClone(view), { level, rand: createRng(1000 + i) });
        expect(b).toEqual(a);
      }
    }
  });

  it('decides in well under 2ms on average, even with a long log', () => {
    const s: SeatSpec[] = [
      { id: 'bot', cards: ['duke', 'captain'], coins: 4 },
      { id: 'a', cards: ['assassin', 'contessa'], coins: 5 },
      { id: 'b', cards: ['ambassador', 'duke'], coins: 3 },
      { id: 'c', cards: ['captain', 'contessa'], coins: 6 },
      { id: 'd', cards: ['assassin', 'ambassador'], coins: 1 },
      { id: 'e', cards: ['duke', 'contessa'], coins: 2 },
    ];
    const ids = s.map((x) => x.id);
    const log: GameEvent[] = [];
    for (let t = 0; t < 400; t++) {
      const actor = ids[t % ids.length];
      log.push({ type: 'turn_start', playerId: actor, turn: t + 1 });
      log.push(actionEvent(declared('tax', actor)));
      log.push({ type: 'pass', playerId: ids[(t + 1) % ids.length] });
      log.push({ type: 'action_resolved', actorId: actor, action: 'tax' });
    }
    const long = buildView({ me: 'bot', seats: s, prompt: chooseActionPrompt(s, 'bot'), log });

    const gen = createRng(5);
    const views = [long, ...Array.from({ length: 400 }, () => randomView(gen))];
    const rand = createRng(3);
    // Warm up the JIT before timing.
    for (const v of views) decideBotMove(v, { level: 'hard', rand });
    const start = performance.now();
    let n = 0;
    for (let rep = 0; rep < 3; rep++) {
      for (const v of views) {
        decideBotMove(v, { level: LEVELS[n % 3], rand });
        n++;
      }
    }
    const avg = (performance.now() - start) / n;
    expect(avg).toBeLessThan(2);

    const t0 = performance.now();
    for (let i = 0; i < 20; i++) decideBotMove(long, { level: 'hard', rand });
    expect((performance.now() - t0) / 20).toBeLessThan(2);
  });
});
