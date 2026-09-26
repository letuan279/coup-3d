import { describe, expect, it } from 'vitest';
import { createGame, toView } from '../engine/index';
import { act, rig } from '../engine/testing';
import type { GameEvent, GameState } from '../types';
import { blockHabit, bluffEvidence, buildKnowledge, holdProbability, isCertainBluff, pAtLeastOne } from './knowledge';
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

describe('declined Tax (bot-3)', () => {
  const coins = (from: string, to: string, amount: number, reason: 'income' | 'steal' | 'tax'): GameEvent => ({
    type: 'coins',
    from,
    to,
    amount,
    reason,
  });

  it('flags a player who took another action with under 7 coins, until their hand changes', () => {
    let K = knowledge([actionEvent(declared('income', 'a')), coins('treasury', 'a', 1, 'income')]);
    expect(K.players.get('a')!.declinedTax).toBe(true);
    expect(K.players.get('b')!.declinedTax).toBe(false);
    K = knowledge([
      actionEvent(declared('income', 'a')),
      { type: 'exchange_draw', playerId: 'a', count: 2 },
      { type: 'exchange_done', playerId: 'a', returned: 2 },
    ]);
    expect(K.players.get('a')!.declinedTax).toBe(false);
    K = knowledge([
      actionEvent(declared('foreign_aid', 'a')),
      { type: 'card_replaced', playerId: 'a', slot: 0, character: 'captain' },
    ]);
    expect(K.players.get('a')!.declinedTax).toBe(false);
  });

  it('does not flag Tax itself, a rich player, or a steal that keeps a rival out of coup range', () => {
    const rich: SeatSpec[] = seats().map((p) => (p.id === 'a' ? { ...p, coins: 8 } : p));
    expect(knowledge([actionEvent(declared('tax', 'a'))]).players.get('a')!.declinedTax).toBe(false);
    expect(knowledge([actionEvent(declared('income', 'a'))], rich).players.get('a')!.declinedTax).toBe(false);
    // c had 8 coins when a stole 2 of them (the view shows the balances after the steal).
    const after: SeatSpec[] = seats().map((p) => (p.id === 'c' ? { ...p, coins: 6 } : p.id === 'a' ? { ...p, coins: 4 } : p));
    const K = knowledge([actionEvent(declared('steal', 'a', 'c')), coins('c', 'a', 2, 'steal')], after);
    expect(K.players.get('a')!.declinedTax).toBe(false);
  });

  it('makes hard doubt the Duke of a player who declined Tax', () => {
    const flagged = knowledge([actionEvent(declared('income', 'a')), coins('treasury', 'a', 1, 'income')]);
    expect(holdProbability(flagged, 'a', 'duke', FULL)).toBeLessThan(holdProbability(knowledge(), 'a', 'duke', FULL));
    // Normal does not read this tell.
    expect(holdProbability(flagged, 'a', 'duke', LEVEL_TUNING.normal.depth)).toBeCloseTo(
      holdProbability(knowledge(), 'a', 'duke', LEVEL_TUNING.normal.depth),
      10,
    );
  });
});

describe('challenge and block records', () => {
  it("records how an assassin treats the Contessa blocks of its own assassinations (bot-4)", () => {
    const K = knowledge([
      actionEvent(declared('assassinate', 'a', 'c')),
      { type: 'block', blockerId: 'c', character: 'contessa', actorId: 'a', action: 'assassinate' },
      { type: 'challenge', challengerId: 'a', challengedId: 'c', character: 'contessa', against: 'block' },
      actionEvent(declared('assassinate', 'b', 'c')),
      { type: 'block', blockerId: 'c', character: 'contessa', actorId: 'b', action: 'assassinate' },
      { type: 'challenge', challengerId: 'a', challengedId: 'c', character: 'contessa', against: 'block' },
    ]);
    const a = K.players.get('a')!;
    expect(a.contessaChallengeChances).toBe(1);
    expect(a.contessaChallenges).toBe(1); // the bystander call does not count
    expect(a.challengesMade).toBe(2);
    expect(K.players.get('b')!.contessaChallengeChances).toBe(1);
    expect(K.players.get('b')!.contessaChallenges).toBe(0);
  });

  it('tracks claims that hit a player directly (aimed at them, or blocking them)', () => {
    const K = knowledge([
      actionEvent(declared('steal', 'a', 'c')),
      { type: 'block', blockerId: 'c', character: 'captain', actorId: 'a', action: 'steal' },
      { type: 'challenge', challengerId: 'a', challengedId: 'c', character: 'captain', against: 'block' },
      actionEvent(declared('tax', 'b')),
    ]);
    // c was the steal's target, a was blocked; nobody was hit by b's Tax at a 4-player table.
    expect(K.players.get('c')!.hotChances).toBe(1);
    expect(K.players.get('a')!.hotChances).toBe(1);
    expect(K.players.get('a')!.hotChallenges).toBe(1);
    expect(K.players.get('bot')!.hotChances).toBe(0);
  });

  it('takes back the block chances of a block made moot by a caught actor (BOT-MEM-1)', () => {
    // a bluffs an assassination of t; t calls Contessa while the action window stays open.
    let s: GameState = createGame({
      players: ['a', 't', 'c', 'd'].map((id, seat) => ({ id, name: id, seat })),
      seed: 7,
      firstPlayerId: 'a',
    });
    s = rig(s, {
      hands: { a: ['duke', 'duke'], t: ['captain', 'ambassador'], c: ['captain', 'contessa'], d: ['assassin', 'duke'] },
      coins: { a: 3, t: 2, c: 2, d: 2 },
    });
    s = act(s, 'a', { type: 'action', action: 'assassinate', targetId: 't' }).state;
    s = act(s, 't', { type: 'block', character: 'contessa' }).state;
    const record = (st: GameState) => {
      const p = buildKnowledge(toView(st, 'd')).players.get('a')!;
      return { chances: p.challengeChances, hot: p.hotChances, contessa: p.contessaChallengeChances };
    };
    const beforeWindow = s;

    // c catches the Assassin bluff: the block is moot and a never gets to answer it.
    const caught = act(beforeWindow, 'c', { type: 'challenge' }).state;
    expect(caught.log.map((e) => e.type)).toContain('action_failed');
    expect(caught.log.some((e) => e.type === 'action_blocked')).toBe(false);
    expect(record(caught)).toEqual({ chances: 0, hot: 0, contessa: 0 });
    const cc = buildKnowledge(toView(caught, 'd'));
    expect(cc.players.get('c')!.challengeChances).toBe(1); // the Assassin claim itself
    expect(cc.players.get('t')!.blocks).toHaveLength(1); // the block was still claimed in public
    expect(cc.players.get('t')!.claims.map((r) => r.character)).toContain('contessa');

    // Everyone passes: the block window opens and a's chances count.
    let passed = act(beforeWindow, 'c', { type: 'pass' }).state;
    passed = act(passed, 'd', { type: 'pass' }).state;
    expect(passed.phase.kind).toBe('block_response');
    expect(record(passed)).toEqual({ chances: 1, hot: 1, contessa: 1 });

    // A wrong action challenge: the actor proves it, the block window opens after all.
    const r2 = rig(beforeWindow, {
      hands: { a: ['assassin', 'duke'], t: ['captain', 'ambassador'], c: ['captain', 'contessa'], d: ['duke', 'ambassador'] },
    });
    let proven = act(r2, 'c', { type: 'challenge' }).state;
    proven = act(proven, 'c', { type: 'reveal', slot: 0 }).state;
    expect(proven.phase.kind).toBe('block_response');
    expect(record(proven)).toEqual({ chances: 1, hot: 1, contessa: 1 });
  });

  it('spots a player who blocks everything whatever they hold (bot-1)', () => {
    const blocksAll: GameEvent[] = [
      actionEvent(declared('steal', 'b', 'a')),
      { type: 'block', blockerId: 'a', character: 'captain', actorId: 'b', action: 'steal' },
      actionEvent(declared('assassinate', 'c', 'a')),
      { type: 'block', blockerId: 'a', character: 'contessa', actorId: 'c', action: 'assassinate' },
    ];
    const K = knowledge(blocksAll);
    expect(blockHabit(K.players.get('a')!)).toBeGreaterThan(0.25);
    // One kind of block says nothing: a real Captain blocks every steal.
    expect(blockHabit(knowledge(blocksAll.slice(0, 2)).players.get('a')!)).toBe(0);
    // Letting a worthwhile steal through rules the habit out.
    const declined = knowledge([
      actionEvent(declared('steal', 'c', 'a')),
      { type: 'action_resolved', actorId: 'c', action: 'steal', targetId: 'a' },
      { type: 'coins', from: 'a', to: 'c', amount: 2, reason: 'steal' },
      ...blocksAll,
    ]);
    expect(declined.players.get('a')!.declinedBlocks).toBe(1);
    expect(blockHabit(declined.players.get('a')!)).toBe(0);
  });
});

describe('bluff evidence (BOT-TUNE-1)', () => {
  const caughtTax: GameEvent[] = [
    actionEvent(declared('tax', 'a')),
    { type: 'challenge', challengerId: 'c', challengedId: 'a', character: 'duke', against: 'action' },
    { type: 'challenge_result', challengerId: 'c', challengedId: 'a', character: 'duke', challengedHadCard: false },
  ];
  /** a blocks two kinds of action and never lets one through, then swaps its hand. */
  const blocksEverything: GameEvent[] = [
    actionEvent(declared('steal', 'b', 'a')),
    { type: 'block', blockerId: 'a', character: 'captain', actorId: 'b', action: 'steal' },
    { type: 'action_blocked', actorId: 'b', action: 'steal', blockerId: 'a', character: 'captain' },
    actionEvent(declared('assassinate', 'c', 'a')),
    { type: 'block', blockerId: 'a', character: 'contessa', actorId: 'c', action: 'assassinate' },
    { type: 'action_blocked', actorId: 'c', action: 'assassinate', blockerId: 'a', character: 'contessa' },
    actionEvent(declared('exchange', 'a')),
    { type: 'exchange_done', playerId: 'a', returned: 2 },
  ];
  const evidence = (log: GameEvent[], s?: SeatSpec[]): number => bluffEvidence(knowledge(log, s).players.get('a')!);

  it('stays at zero for a clean or honest record', () => {
    expect(evidence([])).toBe(0);
    const proven: GameEvent[] = [
      actionEvent(declared('tax', 'a')),
      { type: 'challenge', challengerId: 'c', challengedId: 'a', character: 'duke', against: 'action' },
      { type: 'challenge_result', challengerId: 'c', challengedId: 'a', character: 'duke', challengedHadCard: true, slot: 0 },
      { type: 'card_replaced', playerId: 'a', slot: 0, character: 'duke' },
      actionEvent(declared('steal', 'a', 'c')),
      { type: 'block', blockerId: 'a', character: 'contessa', actorId: 'b', action: 'assassinate' },
    ];
    expect(evidence(proven)).toBe(0);
  });

  it('grows with caught bluffs, a habit of blocking everything and more claims than cards', () => {
    expect(evidence(caughtTax)).toBeCloseTo(0.5, 10);
    const twice: GameEvent[] = [...caughtTax, { type: 'exchange_done', playerId: 'a', returned: 2 }, ...caughtTax];
    expect(evidence(twice)).toBeGreaterThan(evidence(caughtTax));
    const habit = blockHabit(knowledge(blocksEverything).players.get('a')!);
    expect(habit).toBeGreaterThan(0);
    expect(evidence(blocksEverything)).toBeCloseTo(habit, 10);
    // Duke, Captain and Assassin claimed with two cards.
    const inconsistent: GameEvent[] = [
      actionEvent(declared('tax', 'a')),
      actionEvent(declared('steal', 'a', 'c')),
      actionEvent(declared('assassinate', 'a', 'c')),
    ];
    expect(evidence(inconsistent.slice(0, 2))).toBe(0);
    expect(evidence(inconsistent)).toBeGreaterThan(0.3);
  });

  it("lets hard doubt a last-card claim from a player whose record shows bluffing", () => {
    const oneCard: SeatSpec[] = [
      { id: 'bot', cards: ['captain', 'contessa'], coins: 2 },
      { id: 'a', cards: ['duke', 'ambassador'], revealed: [false, true], coins: 2 },
      { id: 'b', cards: ['assassin', 'captain'], coins: 2 },
      { id: 'c', cards: ['ambassador', 'contessa'], coins: 2 },
    ];
    // The same actions, let through instead of blocked: no habit (and the exchange resets the rest).
    const letThrough: GameEvent[] = [
      actionEvent(declared('steal', 'b', 'a')),
      { type: 'action_resolved', actorId: 'b', action: 'steal', targetId: 'a' },
      actionEvent(declared('assassinate', 'c', 'a')),
      { type: 'action_resolved', actorId: 'c', action: 'assassinate', targetId: 'a' },
      actionEvent(declared('exchange', 'a')),
      { type: 'exchange_done', playerId: 'a', returned: 1 },
    ];
    const tax = actionEvent(declared('tax', 'a'));
    const hold = (history: GameEvent[], depth = FULL): number => {
      const K = knowledge([...history, tax], oneCard);
      const seq = K.players.get('a')!.claims.at(-1)!.seq;
      return holdProbability(K, 'a', 'duke', depth, { claiming: true, claimSeq: seq });
    };
    expect(bluffEvidence(knowledge(letThrough, oneCard).players.get('a')!)).toBe(0);
    expect(hold(blocksEverything)).toBeLessThan(hold(letThrough) - 0.005);
    // Levels without the full history keep reading the claim the same way.
    const normal = LEVEL_TUNING.normal.depth;
    expect(hold(blocksEverything, normal)).toBeCloseTo(hold(letThrough, normal), 10);
  });
});
