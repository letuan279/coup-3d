import { describe, expect, it } from 'vitest';
import type { GameEvent } from '../types';
import { buildKnowledge, holdProbability, isCertainBluff, pAtLeastOne } from './knowledge';
import { LEVEL_TUNING } from './personality';
import { actionEvent, buildView, chooseActionPrompt, declared } from './test-helpers';
import type { SeatSpec } from './test-helpers';

const FULL = LEVEL_TUNING.hard.depth;
const BASIC = LEVEL_TUNING.easy.depth;

const seats = (): SeatSpec[] => [
  { id: 'bot', cards: ['duke', 'captain'], coins: 2 },
  { id: 'a', cards: ['assassin', 'contessa'], coins: 2 },
  { id: 'b', cards: ['ambassador', 'duke'], revealed: [true, false], coins: 2 },
  { id: 'c', cards: ['captain', 'contessa'], coins: 2 },
];

function knowledge(log: GameEvent[] = [], s: SeatSpec[] = seats()) {
  const view = buildView({ me: 'bot', seats: s, prompt: chooseActionPrompt(s, 'bot'), log });
  return buildKnowledge(view);
}

describe('pAtLeastOne', () => {
  it('matches the hypergeometric formula', () => {
    expect(pAtLeastOne(13, 3, 2)).toBeCloseTo(1 - (10 * 9) / (13 * 12), 10);
    expect(pAtLeastOne(13, 3, 1)).toBeCloseTo(3 / 13, 10);
    expect(pAtLeastOne(10, 0, 2)).toBe(0);
    expect(pAtLeastOne(3, 3, 1)).toBe(1);
    expect(pAtLeastOne(4, 2, 3)).toBe(1);
  });
});

describe('buildKnowledge', () => {
  it('counts unseen copies from revealed cards and the own hand', () => {
    const K = knowledge();
    expect(K.own.sort()).toEqual(['captain', 'duke']);
    expect(K.revealed.ambassador).toBe(1);
    expect(K.unseen).toEqual({ duke: 2, assassin: 3, captain: 2, ambassador: 2, contessa: 3 });
    // 15 cards − 1 face-up − 2 own
    expect(K.pool).toBe(12);
    expect(K.opponents.map((p) => p.id)).toEqual(['a', 'b', 'c']);
  });

  it('records claims and resets them on hand changes', () => {
    const log: GameEvent[] = [
      actionEvent(declared('tax', 'a')),
      actionEvent(declared('steal', 'a', 'c')),
      { type: 'block', blockerId: 'c', character: 'ambassador', actorId: 'a', action: 'steal' },
      { type: 'challenge', challengerId: 'a', challengedId: 'c', character: 'ambassador', against: 'block' },
      { type: 'challenge_result', challengerId: 'a', challengedId: 'c', character: 'ambassador', challengedHadCard: true, slot: 0 },
      { type: 'card_replaced', playerId: 'c', slot: 0, character: 'ambassador' },
      actionEvent(declared('exchange', 'b')),
      { type: 'exchange_draw', playerId: 'b', count: 2 },
      { type: 'exchange_done', playerId: 'b', returned: 2 },
    ];
    const K = knowledge(log);
    expect(K.players.get('a')!.claims.map((r) => r.character)).toEqual(['duke', 'captain']);
    // Proven card went back to the deck.
    expect(K.players.get('c')!.claims).toEqual([]);
    expect(K.players.get('c')!.provenClaims).toBe(1);
    expect(K.players.get('a')!.wrongChallenges).toBe(1);
    expect(K.players.get('b')!.claims).toEqual([]);
  });

  it('marks a caught bluffer as lacking the character until their hand changes', () => {
    const caught: GameEvent[] = [
      actionEvent(declared('tax', 'a')),
      { type: 'challenge', challengerId: 'c', challengedId: 'a', character: 'duke', against: 'action' },
      { type: 'challenge_result', challengerId: 'c', challengedId: 'a', character: 'duke', challengedHadCard: false },
    ];
    let K = knowledge(caught);
    expect(K.players.get('a')!.lacks.has('duke')).toBe(true);
    expect(isCertainBluff(K, 'a', 'duke', FULL)).toBe(true);
    expect(isCertainBluff(K, 'a', 'duke', BASIC)).toBe(false);
    expect(holdProbability(K, 'a', 'duke', FULL)).toBe(0);

    K = knowledge([...caught, { type: 'exchange_done', playerId: 'a', returned: 2 }]);
    expect(K.players.get('a')!.lacks.size).toBe(0);
  });

  it('is certain about claims whose copies are all visible', () => {
    const s: SeatSpec[] = [
      { id: 'bot', cards: ['duke', 'duke'], coins: 2 },
      { id: 'a', cards: ['duke', 'captain'], revealed: [true, false], coins: 2 },
      { id: 'b', cards: ['assassin', 'contessa'], coins: 2 },
    ];
    const K = knowledge([], s);
    expect(K.unseen.duke).toBe(0);
    expect(isCertainBluff(K, 'b', 'duke', BASIC)).toBe(true);
    expect(holdProbability(K, 'b', 'duke', BASIC, { claiming: true })).toBe(0);
  });

  it('raises belief with repeated unchallenged claims, but never to certainty', () => {
    const base = holdProbability(knowledge(), 'a', 'captain', FULL, { claiming: true });
    const once = knowledge([actionEvent(declared('steal', 'a', 'c'))]);
    const thrice = knowledge([
      actionEvent(declared('steal', 'a', 'c')),
      actionEvent(declared('steal', 'a', 'b')),
      actionEvent(declared('steal', 'a', 'c')),
    ]);
    const p1 = holdProbability(once, 'a', 'captain', FULL, { claiming: true });
    const p3 = holdProbability(thrice, 'a', 'captain', FULL, { claiming: true });
    expect(p1).toBeGreaterThan(base);
    expect(p3).toBeGreaterThan(p1);
    expect(p3).toBeLessThanOrEqual(0.92);
  });

  it('distrusts players claiming more characters than they hold', () => {
    const consistent = knowledge([actionEvent(declared('tax', 'a')), actionEvent(declared('tax', 'a'))]);
    const inconsistent = knowledge([
      actionEvent(declared('tax', 'a')),
      actionEvent(declared('steal', 'a', 'c')),
      actionEvent(declared('exchange', 'a')),
    ]);
    // Judge a new assassin claim.
    const pc = holdProbability(consistent, 'a', 'assassin', FULL, { claiming: true });
    const pi = holdProbability(inconsistent, 'a', 'assassin', FULL, { claiming: true });
    expect(pi).toBeLessThan(pc);
  });

  it('drops claims explained by a revealed card', () => {
    const K = knowledge([
      actionEvent(declared('assassinate', 'a', 'c')),
      { type: 'influence_lost', playerId: 'a', slot: 0, character: 'assassin', reason: 'coup' },
    ]);
    expect(K.players.get('a')!.claims).toEqual([]);
  });

  it('uses declined blocks as soft evidence', () => {
    const log: GameEvent[] = [
      actionEvent(declared('steal', 'b', 'c')),
      { type: 'coins', from: 'c', to: 'b', amount: 2, reason: 'steal' },
      { type: 'action_resolved', actorId: 'b', action: 'steal', targetId: 'c' },
    ];
    const K = knowledge(log);
    expect(K.players.get('c')!.soft.captain).toBeLessThan(1);
    expect(holdProbability(K, 'c', 'captain', FULL)).toBeLessThan(holdProbability(knowledge(), 'c', 'captain', FULL));
  });
});
