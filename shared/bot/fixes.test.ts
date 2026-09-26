/**
 * Regression scenarios for reviewed bot weaknesses, played through the real engine so the bot
 * sees exactly the views (log order, private deck memory, pending blocks) the server sends.
 */
import { describe, expect, it } from 'vitest';
import { createGame, toView } from '../engine/index';
import { act, INCOME, PASS, rig } from '../engine/testing';
import type { RigSpec } from '../engine/testing';
import { createRng } from '../rng';
import type { BotLevel, Character, DeclaredBlock, GameEvent, GameState, GameView, Move } from '../types';
import { decideBotMove } from './index';
import { buildKnowledge, isCertainBluff } from './knowledge';
import { LEVEL_TUNING } from './personality';
import { actionEvent, buildView, declared } from './test-helpers';
import type { SeatSpec } from './test-helpers';

const SEEDS = 40;

function game(ids: string[], first: string, spec: RigSpec): GameState {
  const s = createGame({ players: ids.map((id, seat) => ({ id, name: id, seat })), seed: 7, firstPlayerId: first });
  return rig(s, spec);
}

/** Share of `seeds` random sources for which the bot at `id` picks a move matching `pred`. */
function rate(s: GameState, id: string, level: BotLevel, pred: (m: Move) => boolean, seeds = SEEDS): number {
  const view = toView(s, id);
  let n = 0;
  for (let i = 0; i < seeds; i++) if (pred(decideBotMove(view, { level, rand: createRng(i * 977 + 5) }))) n++;
  return n / seeds;
}

const isChallenge = (m: Move): boolean => m.type === 'challenge';

describe('bot-2: a last-card bot whose anti-coup steal is blocked', () => {
  const setups: [number, number, Character][] = [
    [7, 2, 'duke'],
    [8, 1, 'contessa'],
    [7, 0, 'ambassador'],
    [8, 4, 'duke'],
  ];

  for (const level of ['normal', 'hard'] as const) {
    it(`${level}: steals the rival below coup range and then calls the block (passing = being couped)`, () => {
      let steals = 0;
      let calls = 0;
      let decisions = 0;
      for (const [humanCoins, botCoins, lastCard] of setups) {
        for (let k = 0; k < 10; k++) {
          const bot = `bot${k}`;
          let s = game(['h', bot], bot, {
            hands: { h: ['duke', 'contessa'], [bot]: ['assassin', lastCard] },
            revealed: { [bot]: [0] },
            coins: { h: humanCoins, [bot]: botCoins },
          });
          const move = decideBotMove(toView(s, bot), { level, rand: createRng(k * 101 + 3) });
          if (!(move.type === 'action' && move.action === 'steal')) continue;
          steals++;
          s = act(s, bot, move).state;
          // The human has neither Captain nor Ambassador: both blocks are bluffs.
          for (const blocker of ['captain', 'ambassador'] as const) {
            const blocked = act(s, 'h', { type: 'block', character: blocker }).state;
            expect(blocked.phase.kind).toBe('block_response');
            const r = rate(blocked, bot, level, isChallenge, 10);
            calls += r * 10;
            decisions += 10;
          }
        }
      }
      expect(steals).toBeGreaterThanOrEqual(30);
      expect(calls / decisions).toBeGreaterThan(0.9);
    });
  }

  it('keeps its usual caution when the blocker is not left in coup range', () => {
    // Same last-card bot, but the rival only has 5 coins: letting the block stand is not fatal.
    let calls = 0;
    for (let k = 0; k < 10; k++) {
      const bot = `bot${k}`;
      let s = game(['h', bot], bot, {
        hands: { h: ['duke', 'contessa'], [bot]: ['assassin', 'ambassador'] },
        revealed: { [bot]: [0] },
        coins: { h: 5, [bot]: 2 },
      });
      s = act(s, bot, { type: 'action', action: 'steal', targetId: 'h' }).state;
      s = act(s, 'h', { type: 'block', character: 'captain' }).state;
      calls += rate(s, bot, 'hard', isChallenge, 10);
    }
    expect(calls / 10).toBeLessThan(0.5);
  });
});

describe('bot-5: cards the bot returned with its own exchange', () => {
  /** p1 exchanges, keeps Captain + Duke and returns both Ambassadors (one more is face up at p0). */
  function afterExchange(): GameState {
    let s = game(['p0', 'p1', 'p2'], 'p1', {
      hands: { p0: ['ambassador', 'contessa'], p1: ['ambassador', 'captain'], p2: ['assassin', 'contessa'] },
      revealed: { p0: [0] },
      coins: { p0: 2, p1: 2, p2: 4 },
      deckTop: ['ambassador', 'duke'],
    });
    s = act(s, 'p1', { type: 'action', action: 'exchange' }).state;
    s = act(s, 'p2', PASS).state;
    s = act(s, 'p0', PASS).state;
    const prompt = toView(s, 'p1').prompt;
    if (prompt?.kind !== 'exchange') throw new Error('expected the exchange prompt');
    const keep = [prompt.cards.indexOf('captain'), prompt.cards.indexOf('duke')].sort((a, b) => a - b);
    return act(s, 'p1', { type: 'exchange', keep }).state;
  }

  it('knows the returned copies are in the deck, so an Ambassador block against it is impossible', () => {
    let s = afterExchange();
    expect(toView(s, 'p1').knownInDeck).toEqual(['ambassador', 'ambassador']);
    // Private: nobody else learns it.
    expect(toView(s, 'p2').knownInDeck).toEqual([]);
    s = act(s, 'p2', INCOME).state;
    s = act(s, 'p0', INCOME).state;
    s = act(s, 'p1', { type: 'action', action: 'steal', targetId: 'p2' }).state;
    s = act(s, 'p2', { type: 'block', character: 'ambassador' }).state;
    s = act(s, 'p0', PASS).state; // p0 lets the steal claim stand → block_response
    expect(s.phase.kind).toBe('block_response');
    const K = buildKnowledge(toView(s, 'p1'));
    expect(K.unseen.ambassador).toBe(2); // what the table can count
    expect(K.inHands.ambassador).toBe(0); // what the bot knows
    expect(isCertainBluff(K, 'p2', 'ambassador', LEVEL_TUNING.hard.depth)).toBe(true);
    for (const level of ['normal', 'hard'] as const) expect(rate(s, 'p1', level, isChallenge, 200)).toBe(1);
  });

  it('forgets it as soon as anyone draws from the deck again', () => {
    let s = afterExchange();
    s = act(s, 'p2', { type: 'action', action: 'exchange' }).state;
    s = act(s, 'p0', PASS).state;
    s = act(s, 'p1', PASS).state;
    expect(toView(s, 'p1').knownInDeck).toEqual([]);
    const K = buildKnowledge(toView(s, 'p1'));
    expect(K.inHands.ambassador).toBe(2);
    expect(isCertainBluff(K, 'p2', 'ambassador', LEVEL_TUNING.hard.depth)).toBe(false);
  });
});

describe('bot-6: letting a steal through', () => {
  function afterSteal(targetCoins: number): GameState {
    let s = game(['p0', 'p1', 'p2'], 'p0', {
      hands: { p0: ['duke', 'assassin'], p1: ['duke', 'contessa'], p2: ['captain', 'contessa'] },
      coins: { p0: 2, p1: 2, p2: targetCoins },
    });
    s = act(s, 'p0', { type: 'action', action: 'steal', targetId: 'p2' }).state;
    s = act(s, 'p1', PASS).state;
    return act(s, 'p2', PASS).state;
  }

  it('is no evidence when there was nothing to steal, weak with one coin, real with two', () => {
    const soft = (coins: number) => buildKnowledge(toView(afterSteal(coins), 'p1')).players.get('p2')!.soft;
    expect(soft(0).captain).toBe(1);
    expect(soft(0).ambassador).toBe(1);
    expect(soft(1).captain).toBeCloseTo(0.8, 10);
    expect(soft(2).captain).toBeCloseTo(0.55, 10);
    expect(soft(2).ambassador).toBeCloseTo(0.55, 10);
  });

  it('reads the coins at declaration time even from a truncated log', () => {
    const s = afterSteal(2);
    const K = buildKnowledge(toView(s, 'p1', { logLimit: 6 }));
    expect(K.players.get('p2')!.soft.captain).toBeCloseTo(0.55, 10);
  });
});

describe('a block declared while the action can still be challenged', () => {
  it('still calls an impossible action claim, and never tries to block', () => {
    // p2 holds two Captains and the third is face up at p0: p0 cannot have one.
    let s = game(['p0', 'p1', 'p2'], 'p0', {
      hands: { p0: ['captain', 'duke'], p1: ['ambassador', 'contessa'], p2: ['captain', 'captain'] },
      revealed: { p0: [0] },
      coins: { p0: 2, p1: 4, p2: 2 },
    });
    s = act(s, 'p0', { type: 'action', action: 'steal', targetId: 'p1' }).state;
    s = act(s, 'p1', { type: 'block', character: 'ambassador' }).state;
    const view = toView(s, 'p2');
    expect(view.phase.kind).toBe('action_response');
    expect(view.pendingBlock).toEqual({ blockerId: 'p1', character: 'ambassador' });
    expect(view.prompt).toEqual({ kind: 'respond_action', canChallenge: true, blockCharacters: [] });
    for (const level of ['normal', 'hard'] as const) expect(rate(s, 'p2', level, isChallenge, 100)).toBe(1);
  });

  it('is less keen to fight an action that the target has already blocked', () => {
    // p0 has claimed Duke, Contessa and Ambassador with two cards and now steals from p1,
    // which would take p0 to coup range; the bot holds two of the Captains.
    const seats: SeatSpec[] = [
      { id: 'p0', cards: ['duke', 'assassin'], coins: 5 },
      { id: 'p1', cards: ['ambassador', 'contessa'], coins: 4 },
      { id: 'bot', cards: ['captain', 'captain'], coins: 2 },
    ];
    const history: GameEvent[] = [
      { type: 'turn_start', playerId: 'p0', turn: 1 },
      actionEvent(declared('tax', 'p0')),
      { type: 'turn_start', playerId: 'p1', turn: 2 },
      actionEvent(declared('foreign_aid', 'p1')),
      { type: 'block', blockerId: 'p0', character: 'contessa', actorId: 'p1', action: 'foreign_aid' },
      { type: 'turn_start', playerId: 'bot', turn: 3 },
      actionEvent(declared('steal', 'bot', 'p0')),
      { type: 'block', blockerId: 'p0', character: 'ambassador', actorId: 'bot', action: 'steal' },
      { type: 'action_blocked', actorId: 'bot', action: 'steal', blockerId: 'p0', character: 'ambassador' },
      { type: 'turn_start', playerId: 'p0', turn: 4 },
    ];
    const steal = declared('steal', 'p0', 'p1');
    const block: DeclaredBlock = { blockerId: 'p1', character: 'ambassador' };
    const view = (blocked: boolean): GameView =>
      buildView({
        me: 'bot',
        seats,
        prompt: { kind: 'respond_action', canChallenge: true, blockCharacters: [] },
        pendingAction: steal,
        pendingBlock: blocked ? block : null,
        log: [...history, actionEvent(steal), ...(blocked ? [{ type: 'block', ...block, actorId: 'p0', action: 'steal' } as GameEvent] : [])],
      });
    const challengeRate = (v: GameView, level: BotLevel): number => {
      let n = 0;
      for (let i = 0; i < 400; i++) if (decideBotMove(v, { level, rand: createRng(i * 31 + 7) }).type === 'challenge') n++;
      return n / 400;
    };
    // Normal calls the doubtful steal while it can still land; once p1's block is likely to
    // stand, the steal hardly matters to a bystander. Hard is never keener with the block.
    expect(challengeRate(view(false), 'normal')).toBeGreaterThan(0.5);
    expect(challengeRate(view(true), 'normal')).toBeLessThan(0.2);
    expect(challengeRate(view(true), 'hard')).toBeLessThanOrEqual(challengeRate(view(false), 'hard'));
  });
});
