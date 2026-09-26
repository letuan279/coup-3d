import { describe, expect, it } from 'vitest';
import { createRng } from '../rng';
import type { BotLevel, GameEvent } from '../types';
import { challengeRisk } from './risk';
import { buildSituation } from './situation';
import { actionEvent, buildView, chooseActionPrompt, declared } from './test-helpers';
import type { SeatSpec } from './test-helpers';

const seats: SeatSpec[] = [
  { id: 'bot', cards: ['contessa', 'ambassador'], coins: 2 },
  { id: 'a', cards: ['duke', 'captain'], coins: 2 },
  { id: 'b', cards: ['assassin', 'captain'], coins: 2 },
];

/** Opponents exchange a dozen times; optionally they challenge every claim (and lose). */
function history(challenging: boolean): GameEvent[] {
  const out: GameEvent[] = [];
  for (let i = 0; i < 12; i++) {
    const actor = i % 2 === 0 ? 'a' : 'b';
    const other = actor === 'a' ? 'b' : 'a';
    out.push(actionEvent(declared('exchange', actor)));
    if (challenging) {
      out.push({ type: 'challenge', challengerId: other, challengedId: actor, character: 'ambassador', against: 'action' });
      out.push({ type: 'challenge_result', challengerId: other, challengedId: actor, character: 'ambassador', challengedHadCard: true, slot: 0 });
      out.push({ type: 'card_replaced', playerId: actor, slot: 0, character: 'ambassador' });
    }
    out.push({ type: 'exchange_done', playerId: actor, returned: 2 });
  }
  return out;
}

function situation(level: BotLevel, log: GameEvent[], s: SeatSpec[] = seats) {
  const view = buildView({ me: 'bot', seats: s, prompt: chooseActionPrompt(s, 'bot'), log });
  return buildSituation(view, view.prompt!, { level, rand: createRng(1) });
}

const TAX = { via: 'action' as const, stakes: { a: 0.21, b: 0.21 } };

describe('challengeRisk', () => {
  it('rises at a table that challenges a lot (every level)', () => {
    for (const level of ['easy', 'normal', 'hard'] as const) {
      const passive = challengeRisk(situation(level, history(false)), 'duke', TAX);
      const aggressive = challengeRisk(situation(level, history(true)), 'duke', TAX);
      expect(aggressive).toBeGreaterThan(passive);
    }
  });

  it('is near-certain for a character whose copies are all face up', () => {
    const s: SeatSpec[] = [
      { id: 'bot', cards: ['contessa', 'ambassador'], coins: 2 },
      { id: 'a', cards: ['duke', 'duke'], revealed: [true, true], coins: 0 },
      { id: 'b', cards: ['duke', 'captain'], revealed: [true, false], coins: 2 },
      { id: 'c', cards: ['assassin', 'captain'], coins: 2 },
    ];
    expect(challengeRisk(situation('hard', [], s), 'duke', TAX)).toBeGreaterThan(0.95);
  });

  it('knows a forced Contessa claim invites a challenge (hard)', () => {
    const S = situation('hard', []);
    const calm = challengeRisk(S, 'contessa', { via: 'block', stakes: { a: 0.8 } });
    const forced = challengeRisk(S, 'contessa', { via: 'block', stakes: { a: 0.8 }, forced: true });
    expect(forced).toBeGreaterThan(calm);
  });

  it('is higher when the claim hurts an opponent directly', () => {
    for (const level of ['normal', 'hard'] as const) {
      const S = situation(level, []);
      const mild = challengeRisk(S, 'captain', { via: 'action', stakes: { a: 0.07, b: 0.07 } });
      const hurtful = challengeRisk(S, 'assassin', { via: 'action', stakes: { a: 2.4, b: 0 } });
      expect(hurtful).toBeGreaterThan(mild);
    }
  });
});

describe('challengeRisk: what the table has seen', () => {
  it('knows that claiming Duke after declining Tax is asking to be called (bot-3)', () => {
    const declined: GameEvent[] = [actionEvent(declared('income', 'bot'))];
    for (const level of ['normal', 'hard'] as const) {
      expect(challengeRisk(situation(level, declined), 'duke', TAX)).toBeGreaterThanOrEqual(0.6);
      expect(challengeRisk(situation(level, []), 'duke', TAX)).toBeLessThan(0.6);
    }
    // Easy bots do not think that far.
    expect(challengeRisk(situation('easy', declined), 'duke', TAX)).toBeLessThan(0.6);
  });

  it('remembers who calls Contessa blocks, even if they challenge nothing else (bot-4)', () => {
    const contessaCall: GameEvent[] = [
      actionEvent(declared('assassinate', 'a', 'b')),
      { type: 'block', blockerId: 'b', character: 'contessa', actorId: 'a', action: 'assassinate' },
      { type: 'challenge', challengerId: 'a', challengedId: 'b', character: 'contessa', against: 'block' },
      { type: 'challenge_result', challengerId: 'a', challengedId: 'b', character: 'contessa', challengedHadCard: true, slot: 0 },
      { type: 'card_replaced', playerId: 'b', slot: 0, character: 'contessa' },
    ];
    const ctx = { via: 'block' as const, stakes: { a: 0.54 }, involved: 'a', severe: true };
    for (const level of ['normal', 'hard'] as const) {
      const fresh = challengeRisk(situation(level, []), 'contessa', ctx);
      const known = challengeRisk(situation(level, contessaCall), 'contessa', ctx);
      expect(known).toBeGreaterThan(fresh);
    }
    expect(challengeRisk(situation('normal', contessaCall), 'contessa', ctx)).toBeGreaterThan(0.5);
  });

  it('hard reads a player who lets every claim aimed at them go as passive (and a caller as a caller)', () => {
    const duel: SeatSpec[] = [
      { id: 'bot', cards: ['contessa', 'ambassador'], coins: 2 },
      { id: 'a', cards: ['duke', 'captain'], coins: 2 },
    ];
    const claims = (challenged: boolean): GameEvent[] => {
      const out: GameEvent[] = [];
      for (let i = 0; i < 5; i++) {
        // (Assassin claims: a steal would also mark the bot as having declined Tax.)
        out.push(actionEvent(declared('assassinate', 'bot', 'a')));
        if (challenged) {
          out.push({ type: 'challenge', challengerId: 'a', challengedId: 'bot', character: 'assassin', against: 'action' });
          out.push({ type: 'challenge_result', challengerId: 'a', challengedId: 'bot', character: 'assassin', challengedHadCard: true, slot: 0 });
          out.push({ type: 'card_replaced', playerId: 'bot', slot: 0, character: 'assassin' });
        }
      }
      return out;
    };
    const stakes = { via: 'action' as const, stakes: { a: 0.315 } };
    const passive = challengeRisk(situation('hard', claims(false), duel), 'duke', stakes);
    const fresh = challengeRisk(situation('hard', [], duel), 'duke', stakes);
    const caller = challengeRisk(situation('hard', claims(true), duel), 'duke', stakes);
    expect(passive).toBeLessThan(fresh);
    expect(caller).toBeGreaterThan(fresh);
  });
});
