import { describe, expect, it } from 'vitest';
import { ACTIONS } from '../constants';
import { createRng, shuffle } from '../rng';
import type { BotLevel, Character, GameEvent, GameView, Move } from '../types';
import { decideBotMove } from './index';
import {
  actionEvent,
  buildView,
  chooseActionPrompt,
  declared,
  legalityError,
  respondActionPrompt,
} from './test-helpers';
import type { SeatSpec } from './test-helpers';

const ALL_LEVELS: readonly BotLevel[] = ['easy', 'normal', 'hard'];
const SMART: readonly BotLevel[] = ['normal', 'hard'];
const SEEDS = 200;

/** The bot's moves for the same view under many random seeds (each checked for legality). */
function movesFor(view: GameView, level: BotLevel, seeds = SEEDS): Move[] {
  const out: Move[] = [];
  const botId = view.viewerId!;
  for (let i = 0; i < seeds; i++) {
    const move = decideBotMove(view, { level, rand: createRng(i * 31 + 17) });
    expect(legalityError(view.prompt!, move), `${botId} ${level} ${JSON.stringify(move)}`).toBeNull();
    out.push(move);
  }
  return out;
}

function share(moves: readonly Move[], pred: (m: Move) => boolean): number {
  return moves.filter(pred).length / moves.length;
}

/** Renames the viewer so different personalities get exercised. */
function withBotId(seats: SeatSpec[], id: string): SeatSpec[] {
  return seats.map((s) => (s.id === 'bot' ? { ...s, id } : s));
}

const BOT_IDS = ['bot', 'bot-7f3a', 'Heo', 'robot-42', 'zz'];

describe('challenges', () => {
  it('always challenges an action claim whose character is fully accounted for (normal & hard)', () => {
    for (const botId of BOT_IDS) {
      const seats = withBotId(
        [
          { id: 'bot', cards: ['duke', 'duke'], coins: 2 },
          { id: 'a', cards: ['duke', 'captain'], revealed: [true, false], coins: 3 },
          { id: 'b', cards: ['contessa', 'assassin'], coins: 1 },
        ],
        botId,
      );
      const tax = declared('tax', 'b');
      const view = buildView({
        me: botId,
        seats,
        prompt: respondActionPrompt(tax, botId),
        pendingAction: tax,
        log: [actionEvent(tax)],
      });
      for (const level of SMART) expect(share(movesFor(view, level), (m) => m.type === 'challenge')).toBe(1);
      // Easy only notices it some of the time, but does notice.
      const easy = share(movesFor(view, 'easy'), (m) => m.type === 'challenge');
      expect(easy).toBeGreaterThan(0.25);
    }
  });

  it('always challenges a block whose character is fully accounted for (normal & hard)', () => {
    // Ambassadors: one hidden in the bot's hand, two face up → a blocking Ambassador is impossible.
    const seats: SeatSpec[] = [
      { id: 'bot', cards: ['contessa', 'ambassador'], revealed: [true, false], coins: 2 },
      { id: 'a', cards: ['captain', 'duke'], coins: 3 },
      { id: 'b', cards: ['assassin', 'duke'], coins: 4 },
      { id: 'x', cards: ['ambassador', 'ambassador'], revealed: [true, true], coins: 0 },
    ];
    const steal = declared('steal', 'bot', 'b');
    const view = buildView({
      me: 'bot',
      seats,
      prompt: { kind: 'respond_block' },
      pendingAction: steal,
      pendingBlock: { blockerId: 'b', character: 'ambassador' },
      log: [actionEvent(steal), { type: 'block', blockerId: 'b', character: 'ambassador', actorId: 'bot', action: 'steal' }],
    });
    for (const level of SMART) expect(share(movesFor(view, level), (m) => m.type === 'challenge')).toBe(1);
  });

  it('challenges a repeat claim of a character the player was just caught without (hard)', () => {
    const seats: SeatSpec[] = [
      { id: 'bot', cards: ['captain', 'contessa'], coins: 2 },
      { id: 'a', cards: ['ambassador', 'contessa'], revealed: [true, false], coins: 6 },
      { id: 'b', cards: ['duke', 'captain'], coins: 2 },
    ];
    const log: GameEvent[] = [
      actionEvent(declared('tax', 'a')),
      { type: 'challenge', challengerId: 'b', challengedId: 'a', character: 'duke', against: 'action' },
      { type: 'challenge_result', challengerId: 'b', challengedId: 'a', character: 'duke', challengedHadCard: false },
      { type: 'influence_lost', playerId: 'a', slot: 0, character: 'ambassador', reason: 'caught_bluffing' },
      { type: 'turn_start', playerId: 'b', turn: 2 },
      { type: 'turn_start', playerId: 'bot', turn: 3 },
      { type: 'turn_start', playerId: 'a', turn: 4 },
    ];
    const tax = declared('tax', 'a');
    const view = buildView({
      me: 'bot',
      seats,
      prompt: respondActionPrompt(tax, 'bot'),
      pendingAction: tax,
      log: [...log, actionEvent(tax)],
    });
    expect(share(movesFor(view, 'hard'), (m) => m.type === 'challenge')).toBe(1);
  });

  it("does not pile on a weak player's harmless exchange", () => {
    const seats: SeatSpec[] = [
      { id: 'bot', cards: ['duke', 'captain'], coins: 4 },
      { id: 'a', cards: ['ambassador', 'contessa'], revealed: [true, false], coins: 1 },
      { id: 'b', cards: ['assassin', 'duke'], coins: 5 },
      { id: 'c', cards: ['captain', 'contessa'], coins: 3 },
    ];
    const ex = declared('exchange', 'a');
    const view = buildView({ me: 'bot', seats, prompt: respondActionPrompt(ex, 'bot'), pendingAction: ex, log: [actionEvent(ex)] });
    for (const level of ALL_LEVELS) {
      expect(share(movesFor(view, level), (m) => m.type === 'challenge')).toBeLessThan(0.15);
    }
  });
});

describe('assassination defence', () => {
  it('blocks with a real Contessa when assassinated', () => {
    for (const hiddenTwo of [true, false]) {
      const seats: SeatSpec[] = [
        { id: 'bot', cards: ['captain', 'contessa'], revealed: [!hiddenTwo, false], coins: 2 },
        { id: 'a', cards: ['assassin', 'duke'], coins: 0 },
        { id: 'b', cards: ['ambassador', 'duke'], coins: 4 },
      ];
      const kill = declared('assassinate', 'a', 'bot');
      for (const afterProof of [false, true]) {
        const view = buildView({
          me: 'bot',
          seats,
          prompt: respondActionPrompt(kill, 'bot', afterProof),
          pendingAction: kill,
          log: [actionEvent(kill)],
        });
        for (const level of ALL_LEVELS) {
          const moves = movesFor(view, level);
          expect(share(moves, (m) => m.type === 'block' && m.character === 'contessa')).toBe(1);
        }
      }
    }
  });

  it('with one influence and no Contessa never passes an assassination (normal & hard)', () => {
    const gen = createRng(2024);
    const pool: Character[] = ['duke', 'duke', 'duke', 'assassin', 'assassin', 'captain', 'captain', 'captain', 'ambassador', 'ambassador', 'ambassador'];
    for (let trial = 0; trial < 40; trial++) {
      // Random others; the bot keeps one hidden non-Contessa card.
      const deck = shuffle(pool, gen);
      const mine = deck.pop()!;
      const seats: SeatSpec[] = [
        { id: 'bot', cards: [deck.pop()!, mine], revealed: [true, false], coins: Math.floor(gen() * 7) },
        { id: 'a', cards: ['assassin', deck.pop()!], coins: Math.floor(gen() * 6) },
        { id: 'b', cards: ['contessa', deck.pop()!], revealed: [gen() < 0.5, false], coins: Math.floor(gen() * 6) },
      ];
      if (gen() < 0.5) seats.push({ id: 'c', cards: [deck.pop()!, 'contessa'], coins: 2 });
      const history: GameEvent[] = gen() < 0.5 ? [actionEvent(declared('assassinate', 'a', 'b'))] : [];
      const kill = declared('assassinate', 'a', 'bot');
      for (const afterProof of [false, true]) {
        const view = buildView({
          me: 'bot',
          seats,
          prompt: respondActionPrompt(kill, 'bot', afterProof),
          pendingAction: kill,
          log: [...history, actionEvent(kill)],
        });
        for (const level of SMART) {
          expect(share(movesFor(view, level, 40), (m) => m.type === 'pass')).toBe(0);
        }
      }
    }
  });

  it('prefers challenging an unlikely Assassin over a hopeless Contessa bluff', () => {
    // One assassin unseen, the one-card actor has claimed two other characters already, and two
    // Contessas are face up (a Contessa bluff would likely be called).
    const seats: SeatSpec[] = [
      { id: 'bot', cards: ['assassin', 'duke'], revealed: [true, false], coins: 2 },
      { id: 'x', cards: ['assassin', 'contessa'], revealed: [true, true], coins: 0 },
      { id: 'a', cards: ['duke', 'ambassador'], revealed: [true, false], coins: 4 },
      { id: 'b', cards: ['contessa', 'duke'], revealed: [true, false], coins: 2 },
    ];
    const kill = declared('assassinate', 'a', 'bot');
    const log: GameEvent[] = [
      actionEvent(declared('steal', 'a', 'b')),
      { type: 'action_resolved', actorId: 'a', action: 'steal', targetId: 'b' },
      actionEvent(declared('exchange', 'a')),
      { type: 'action_resolved', actorId: 'a', action: 'exchange' },
      actionEvent(kill),
    ];
    const view = buildView({ me: 'bot', seats, prompt: respondActionPrompt(kill, 'bot'), pendingAction: kill, log });
    for (const level of SMART) expect(share(movesFor(view, level), (m) => m.type === 'challenge')).toBeGreaterThan(0.9);
  });

  it('challenges a well-established Assassin less often than a dubious one', () => {
    const seats: SeatSpec[] = [
      { id: 'bot', cards: ['captain', 'duke'], revealed: [true, false], coins: 2 },
      { id: 'a', cards: ['assassin', 'duke'], coins: 1 },
      { id: 'b', cards: ['ambassador', 'captain'], coins: 2 },
      { id: 'c', cards: ['contessa', 'captain'], revealed: [true, false], coins: 3 },
    ];
    const kill = declared('assassinate', 'a', 'bot');
    const log: GameEvent[] = [
      actionEvent(declared('assassinate', 'a', 'c')),
      { type: 'action_resolved', actorId: 'a', action: 'assassinate', targetId: 'c' },
      { type: 'influence_lost', playerId: 'c', slot: 0, character: 'contessa', reason: 'assassinate' },
      actionEvent(declared('assassinate', 'a', 'b')),
      { type: 'block', blockerId: 'b', character: 'contessa', actorId: 'a', action: 'assassinate' },
      { type: 'action_blocked', actorId: 'a', action: 'assassinate', blockerId: 'b', character: 'contessa' },
    ];
    const established = buildView({ me: 'bot', seats, prompt: respondActionPrompt(kill, 'bot'), pendingAction: kill, log: [...log, actionEvent(kill)] });
    // Dubious: two assassins face up and a one-card actor who already claimed two other
    // characters (with two Contessas face up, a Contessa bluff is no way out either).
    const dubiousSeats: SeatSpec[] = [
      { id: 'bot', cards: ['captain', 'duke'], revealed: [true, false], coins: 2 },
      { id: 'a', cards: ['duke', 'assassin'], revealed: [true, false], coins: 4 },
      { id: 'b', cards: ['contessa', 'captain'], revealed: [true, false], coins: 2 },
      { id: 'c', cards: ['assassin', 'contessa'], revealed: [true, false], coins: 3 },
      { id: 'd', cards: ['assassin', 'contessa'], revealed: [true, true], coins: 0 },
    ];
    const fresh = buildView({
      me: 'bot',
      seats: dubiousSeats,
      prompt: respondActionPrompt(kill, 'bot'),
      pendingAction: kill,
      log: [actionEvent(declared('steal', 'a', 'b')), actionEvent(declared('exchange', 'a')), actionEvent(kill)],
    });
    for (const level of SMART) {
      const est = movesFor(established, level);
      expect(share(est, (m) => m.type === 'pass')).toBe(0);
      expect(share(est, (m) => m.type === 'challenge')).toBeLessThan(share(movesFor(fresh, level), (m) => m.type === 'challenge'));
    }
  });
});

describe('action choice', () => {
  it('coups at 10+ coins, targeting the biggest threat', () => {
    const seats: SeatSpec[] = [
      { id: 'bot', cards: ['duke', 'captain'], coins: 10 },
      { id: 'a', cards: ['assassin', 'contessa'], coins: 6 },
      { id: 'b', cards: ['ambassador', 'captain'], revealed: [false, true], coins: 1 },
      { id: 'c', cards: ['duke', 'ambassador'], revealed: [true, false], coins: 0 },
    ];
    const log = [actionEvent(declared('assassinate', 'a', 'c')), actionEvent(declared('tax', 'a'))];
    const view = buildView({ me: 'bot', seats, prompt: chooseActionPrompt(seats, 'bot'), log });
    for (const level of ALL_LEVELS) {
      expect(share(movesFor(view, level), (m) => m.type === 'action' && m.action === 'coup')).toBe(1);
    }
    expect(share(movesFor(view, 'hard'), (m) => m.type === 'action' && m.targetId === 'a')).toBe(1);
    expect(share(movesFor(view, 'normal'), (m) => m.type === 'action' && m.targetId === 'a')).toBeGreaterThan(0.85);
  });

  it('finishes a one-card opponent when that leaves a duel (hard)', () => {
    const seats: SeatSpec[] = [
      { id: 'bot', cards: ['duke', 'captain'], coins: 11 },
      { id: 'a', cards: ['assassin', 'contessa'], coins: 3 },
      { id: 'b', cards: ['ambassador', 'captain'], revealed: [false, true], coins: 2 },
    ];
    const view = buildView({ me: 'bot', seats, prompt: chooseActionPrompt(seats, 'bot') });
    expect(share(movesFor(view, 'hard'), (m) => m.type === 'action' && m.action === 'coup' && m.targetId === 'b')).toBe(1);
  });

  it('usually coups with 7–9 coins', () => {
    const seats: SeatSpec[] = [
      { id: 'bot', cards: ['contessa', 'captain'], coins: 8 },
      { id: 'a', cards: ['assassin', 'contessa'], coins: 3 },
      { id: 'b', cards: ['ambassador', 'duke'], coins: 2 },
    ];
    const view = buildView({ me: 'bot', seats, prompt: chooseActionPrompt(seats, 'bot') });
    expect(share(movesFor(view, 'hard'), (m) => m.type === 'action' && m.action === 'coup')).toBeGreaterThan(0.9);
    expect(share(movesFor(view, 'normal'), (m) => m.type === 'action' && m.action === 'coup')).toBeGreaterThan(0.75);
  });

  it('uses real cards: taxes with a Duke, assassinates with an Assassin', () => {
    const duke: SeatSpec[] = [
      { id: 'bot', cards: ['duke', 'contessa'], coins: 2 },
      { id: 'a', cards: ['assassin', 'captain'], coins: 2 },
      { id: 'b', cards: ['ambassador', 'captain'], coins: 2 },
    ];
    const v1 = buildView({ me: 'bot', seats: duke, prompt: chooseActionPrompt(duke, 'bot') });
    expect(share(movesFor(v1, 'hard'), (m) => m.type === 'action' && m.action === 'tax')).toBe(1);

    const assassin: SeatSpec[] = [
      { id: 'bot', cards: ['assassin', 'ambassador'], coins: 4 },
      { id: 'a', cards: ['duke', 'captain'], coins: 5 },
      { id: 'b', cards: ['ambassador', 'captain'], coins: 1 },
    ];
    const v2 = buildView({ me: 'bot', seats: assassin, prompt: chooseActionPrompt(assassin, 'bot') });
    expect(share(movesFor(v2, 'hard'), (m) => m.type === 'action' && m.action === 'assassinate')).toBe(1);
  });

  it('never steals from a broke player', () => {
    const seats: SeatSpec[] = [
      { id: 'bot', cards: ['captain', 'contessa'], coins: 1 },
      { id: 'a', cards: ['duke', 'assassin'], coins: 0 },
      { id: 'b', cards: ['ambassador', 'captain'], coins: 0 },
    ];
    const view = buildView({ me: 'bot', seats, prompt: chooseActionPrompt(seats, 'bot') });
    for (const level of ALL_LEVELS) {
      expect(share(movesFor(view, level), (m) => m.type === 'action' && m.action === 'steal')).toBe(0);
    }
  });

  it('avoids foreign aid when an opponent has been claiming Duke', () => {
    const seats: SeatSpec[] = [
      { id: 'bot', cards: ['contessa', 'contessa'], coins: 2 },
      { id: 'a', cards: ['duke', 'captain'], coins: 5 },
      { id: 'b', cards: ['ambassador', 'captain'], coins: 2 },
    ];
    const log = [actionEvent(declared('tax', 'a')), actionEvent(declared('tax', 'a'))];
    const view = buildView({ me: 'bot', seats, prompt: chooseActionPrompt(seats, 'bot'), log });
    expect(share(movesFor(view, 'hard'), (m) => m.type === 'action' && m.action === 'foreign_aid')).toBe(0);
    // No Duke claims and two Dukes face up: foreign aid is safe enough (and nothing to steal).
    const safeSeats: SeatSpec[] = [
      { id: 'bot', cards: ['contessa', 'assassin'], coins: 2 },
      { id: 'a', cards: ['captain', 'duke'], revealed: [false, true], coins: 1 },
      { id: 'b', cards: ['ambassador', 'duke'], revealed: [false, true], coins: 1 },
    ];
    const quiet = buildView({ me: 'bot', seats: safeSeats, prompt: chooseActionPrompt(safeSeats, 'bot') });
    expect(share(movesFor(quiet, 'hard'), (m) => m.type === 'action' && m.action === 'foreign_aid')).toBeGreaterThan(0.3);
  });

  it('keeps up an established Duke bluff at a level-dependent rate', () => {
    const seats: SeatSpec[] = [
      { id: 'bot', cards: ['contessa', 'contessa'], coins: 2 },
      { id: 'a', cards: ['duke', 'captain'], coins: 2 },
      { id: 'b', cards: ['ambassador', 'captain'], coins: 2 },
    ];
    const story = (botId: string): GameEvent[] => [
      actionEvent(declared('tax', botId)),
      { type: 'action_resolved', actorId: botId, action: 'tax' },
      { type: 'turn_start', playerId: 'a', turn: 2 },
      { type: 'turn_start', playerId: 'b', turn: 3 },
      { type: 'turn_start', playerId: botId, turn: 4 },
      actionEvent(declared('tax', botId)),
      { type: 'action_resolved', actorId: botId, action: 'tax' },
      { type: 'turn_start', playerId: 'a', turn: 5 },
      { type: 'turn_start', playerId: 'b', turn: 6 },
      { type: 'turn_start', playerId: botId, turn: 7 },
    ];
    const rate = (level: BotLevel, withStory: boolean): number => {
      let total = 0;
      for (const botId of BOT_IDS) {
        const s = withBotId(seats, botId);
        const view = buildView({ me: botId, seats: s, prompt: chooseActionPrompt(s, botId), log: withStory ? story(botId) : [] });
        total += share(movesFor(view, level), (m) => m.type === 'action' && m.action === 'tax');
      }
      return total / BOT_IDS.length;
    };
    const normal = rate('normal', true);
    const hard = rate('hard', true);
    expect(normal).toBeGreaterThan(0.1);
    expect(hard).toBeGreaterThan(0.1);
    expect(rate('easy', true)).toBeLessThan(normal);
    // A fresh Duke claim at a 3-player table is riskier than continuing a believed story.
    expect(rate('hard', false)).toBeLessThan(hard);
  });
});

describe('stalemate avoidance', () => {
  it('does not exchange twice in a row', () => {
    const seats: SeatSpec[] = [
      { id: 'bot', cards: ['captain', 'ambassador'], revealed: [true, false], coins: 5 },
      { id: 'a', cards: ['captain', 'duke'], revealed: [true, false], coins: 3 },
    ];
    const log: GameEvent[] = [
      { type: 'turn_start', playerId: 'bot', turn: 5 },
      actionEvent(declared('exchange', 'bot')),
      { type: 'action_resolved', actorId: 'bot', action: 'exchange' },
      { type: 'exchange_draw', playerId: 'bot', count: 2 },
      { type: 'exchange_done', playerId: 'bot', returned: 2 },
      { type: 'turn_start', playerId: 'a', turn: 6 },
      { type: 'turn_start', playerId: 'bot', turn: 7 },
    ];
    const view = buildView({ me: 'bot', seats, prompt: chooseActionPrompt(seats, 'bot'), log });
    for (const level of SMART) {
      expect(share(movesFor(view, level), (m) => m.type === 'action' && m.action === 'exchange')).toBeLessThan(0.05);
    }
  });

  it('stops stealing from a player who keeps blocking steals', () => {
    const seats: SeatSpec[] = [
      { id: 'bot', cards: ['duke', 'captain'], revealed: [true, false], coins: 3 },
      { id: 'a', cards: ['captain', 'ambassador'], revealed: [true, false], coins: 5 },
    ];
    const blocked = (turn: number): GameEvent[] => [
      { type: 'turn_start', playerId: 'bot', turn },
      actionEvent(declared('steal', 'bot', 'a')),
      { type: 'block', blockerId: 'a', character: 'ambassador', actorId: 'bot', action: 'steal' },
      { type: 'action_blocked', actorId: 'bot', action: 'steal', blockerId: 'a', character: 'ambassador' },
      { type: 'turn_start', playerId: 'a', turn: turn + 1 },
      actionEvent(declared('exchange', 'a')),
      { type: 'exchange_done', playerId: 'a', returned: 2 },
    ];
    const log = [...blocked(3), ...blocked(5), { type: 'turn_start', playerId: 'bot', turn: 7 } as GameEvent];
    const view = buildView({ me: 'bot', seats, prompt: chooseActionPrompt(seats, 'bot'), log });
    for (const level of SMART) {
      expect(share(movesFor(view, level), (m) => m.type === 'action' && m.action === 'steal')).toBeLessThan(0.1);
    }
  });
});

describe('never bluffs an impossible character', () => {
  const makeSeats = (x: Character): SeatSpec[] => {
    // All three copies of x are face up; the bot holds none.
    const filler: Character[] = (['duke', 'assassin', 'captain', 'ambassador', 'contessa'] as Character[]).filter((c) => c !== x);
    return [
      { id: 'bot', cards: [filler[0], filler[1]], coins: 5 },
      { id: 'x', cards: [x, x], revealed: [true, true], coins: 0 },
      { id: 'a', cards: [x, filler[2]], revealed: [true, false], coins: 4 },
      { id: 'b', cards: [filler[3], filler[2]], coins: 3 },
    ];
  };

  it('in its own action choice', () => {
    for (const x of ['duke', 'assassin', 'captain', 'ambassador'] as Character[]) {
      const seats = makeSeats(x);
      for (const coins of [1, 3, 5]) {
        seats[0].coins = coins;
        for (const botId of BOT_IDS) {
          const s = withBotId(seats, botId);
          const view = buildView({ me: botId, seats: s, prompt: chooseActionPrompt(s, botId) });
          for (const level of ALL_LEVELS) {
            const claims = movesFor(view, level, 60).map((m) => (m.type === 'action' ? ACTIONS[m.action].claim : undefined));
            expect(claims).not.toContain(x);
          }
        }
      }
    }
  });

  it('in its blocks', () => {
    for (const x of ['duke', 'captain', 'ambassador', 'contessa'] as Character[]) {
      const seats = makeSeats(x);
      const action =
        x === 'duke' ? declared('foreign_aid', 'b') : x === 'contessa' ? declared('assassinate', 'b', 'bot') : declared('steal', 'b', 'bot');
      const view = buildView({ me: 'bot', seats, prompt: respondActionPrompt(action, 'bot', true), pendingAction: action, log: [actionEvent(action)] });
      for (const level of ALL_LEVELS) {
        const moves = movesFor(view, level);
        expect(share(moves, (m) => m.type === 'block' && m.character === x)).toBe(0);
      }
    }
  });
});

describe('losing influence and exchanging', () => {
  it('keeps the character it has been claiming', () => {
    const seats: SeatSpec[] = [
      { id: 'bot', cards: ['duke', 'captain'], coins: 5 },
      { id: 'a', cards: ['assassin', 'contessa'], coins: 7 },
      { id: 'b', cards: ['ambassador', 'duke'], coins: 3 },
    ];
    const log: GameEvent[] = [
      actionEvent(declared('steal', 'bot', 'a')),
      { type: 'action_resolved', actorId: 'bot', action: 'steal', targetId: 'a' },
      actionEvent(declared('steal', 'bot', 'b')),
      { type: 'action_resolved', actorId: 'bot', action: 'steal', targetId: 'b' },
      actionEvent(declared('coup', 'a', 'bot')),
    ];
    const view = buildView({ me: 'bot', seats, prompt: { kind: 'lose_influence', slots: [0, 1], reason: 'coup' }, log });
    for (const level of SMART) {
      // Slot 1 is the Captain it has been claiming → reveal the Duke in slot 0.
      expect(share(movesFor(view, level), (m) => m.type === 'reveal' && m.slot === 0)).toBe(1);
    }
  });

  it('keeps a Contessa while an Assassin threat exists', () => {
    const seats: SeatSpec[] = [
      { id: 'bot', cards: ['ambassador', 'contessa'], coins: 2 },
      { id: 'a', cards: ['assassin', 'duke'], coins: 6 },
      { id: 'b', cards: ['captain', 'duke'], coins: 3 },
    ];
    const log: GameEvent[] = [actionEvent(declared('assassinate', 'a', 'b')), actionEvent(declared('coup', 'b', 'bot'))];
    const view = buildView({ me: 'bot', seats, prompt: { kind: 'lose_influence', slots: [0, 1], reason: 'coup' }, log });
    for (const level of SMART) expect(share(movesFor(view, level), (m) => m.type === 'reveal' && m.slot === 0)).toBe(1);
  });

  it('keeps exactly keepCount distinct cards and prefers a diverse strong hand', () => {
    const seats: SeatSpec[] = [
      { id: 'bot', cards: ['captain', 'duke'], coins: 2 },
      { id: 'a', cards: ['assassin', 'contessa'], coins: 2 },
      { id: 'b', cards: ['captain', 'ambassador'], coins: 2 },
    ];
    const cards: Character[] = ['captain', 'duke', 'duke', 'contessa'];
    const two = buildView({
      me: 'bot',
      seats,
      prompt: { kind: 'exchange', cards, keepCount: 2 },
      pendingAction: declared('exchange', 'bot'),
    });
    for (const level of ALL_LEVELS) {
      for (const m of movesFor(two, level)) {
        expect(m.type).toBe('exchange');
        if (m.type === 'exchange') {
          expect(m.keep).toHaveLength(2);
          expect(new Set(m.keep).size).toBe(2);
        }
      }
    }
    // Hard keeps exactly one Duke rather than the pair.
    for (const m of movesFor(two, 'hard')) {
      const kept = m.type === 'exchange' ? m.keep.map((i) => cards[i]) : [];
      expect(kept.filter((c) => c === 'duke')).toHaveLength(1);
    }

    const oneSeats: SeatSpec[] = [
      { id: 'bot', cards: ['captain', 'ambassador'], revealed: [true, false], coins: 2 },
      { id: 'a', cards: ['assassin', 'contessa'], coins: 2 },
      { id: 'b', cards: ['captain', 'contessa'], coins: 2 },
    ];
    const one = buildView({
      me: 'bot',
      seats: oneSeats,
      prompt: { kind: 'exchange', cards: ['ambassador', 'duke', 'assassin'], keepCount: 1 },
      pendingAction: declared('exchange', 'bot'),
    });
    for (const level of ALL_LEVELS) {
      for (const m of movesFor(one, level)) {
        expect(m.type === 'exchange' && m.keep.length === 1).toBe(true);
      }
    }
  });
});

describe('heads-up challenge margin (BOT-TUNE-1)', () => {
  /**
   * Heads-up, the opponent claims Tax from 4 coins (into coup range) right after an exchange.
   * Before it, the bot's steal and Foreign Aid were either blocked (Captain, Duke: a habit of
   * blocking everything) or let through. The exchange resets the claims, so the Tax claim itself
   * reads the same either way: only the opponent's record differs.
   */
  function taxAfter(blocked: boolean, me: string): GameView {
    const seats: SeatSpec[] = [
      { id: me, cards: ['duke', 'captain'], coins: 3 },
      { id: 'a', cards: ['duke', 'ambassador'], coins: 4 },
    ];
    const log: GameEvent[] = [];
    for (const [action, blocker] of [
      [declared('steal', me, 'a'), 'captain'],
      [declared('foreign_aid', me), 'duke'],
    ] as const) {
      log.push(actionEvent(action));
      if (blocked) {
        log.push(
          { type: 'block', blockerId: 'a', character: blocker, actorId: me, action: action.type },
          { type: 'action_blocked', actorId: me, action: action.type, blockerId: 'a', character: blocker },
        );
      } else {
        log.push({ type: 'action_resolved', actorId: me, action: action.type, ...(action.targetId ? { targetId: 'a' } : {}) });
      }
    }
    log.push(actionEvent(declared('exchange', 'a')), { type: 'exchange_done', playerId: 'a', returned: 2 });
    const tax = declared('tax', 'a');
    return buildView({ me, seats, prompt: respondActionPrompt(tax, me), pendingAction: tax, log: [...log, actionEvent(tax)] });
  }

  function challengeRate(blocked: boolean): number {
    const ids = Array.from({ length: 40 }, (_, k) => `bot-${k}`);
    let sum = 0;
    for (const me of ids) sum += share(movesFor(taxAfter(blocked, me), 'hard', 5), (m) => m.type === 'challenge');
    return sum / ids.length;
  }

  it('hard calls a doubtful claim more readily from a player whose record shows bluffing', () => {
    const clean = challengeRate(false);
    const habit = challengeRate(true);
    // A close call against a clean record (a bold margin for everyone over-challenges honest
    // players)…
    expect(clean).toBeGreaterThan(0.2);
    expect(clean).toBeLessThan(0.75);
    // …but a player who blocks everything gets called.
    expect(habit).toBeGreaterThan(clean + 0.2);
  });
});

describe('reviewed exploits', () => {
  it('bluffs Contessa with two cards only now and then, and never against a known Contessa caller (bot-4)', () => {
    const called: GameEvent[] = [
      actionEvent(declared('assassinate', 'a', 'b')),
      { type: 'block', blockerId: 'b', character: 'contessa', actorId: 'a', action: 'assassinate' },
      { type: 'challenge', challengerId: 'a', challengedId: 'b', character: 'contessa', against: 'block' },
      { type: 'challenge_result', challengerId: 'a', challengedId: 'b', character: 'contessa', challengedHadCard: true, slot: 0 },
      { type: 'card_replaced', playerId: 'b', slot: 0, character: 'contessa' },
    ];
    for (const players of [2, 3]) {
      let fresh = 0;
      let known = 0;
      const ids = Array.from({ length: 40 }, (_, k) => `bot-${k}`);
      for (const me of ids) {
        const seats: SeatSpec[] = [
          { id: me, cards: ['duke', 'captain'], coins: 2 },
          { id: 'a', cards: ['assassin', 'ambassador'], coins: 0 },
        ];
        if (players === 3) seats.push({ id: 'b', cards: ['duke', 'captain'], coins: 3 });
        const kill = declared('assassinate', 'a', me);
        const view = (history: GameEvent[]): GameView =>
          buildView({ me, seats, prompt: respondActionPrompt(kill, me), pendingAction: kill, log: [...history, actionEvent(kill)] });
        const bluffs = (m: Move): boolean => m.type === 'block';
        fresh += share(movesFor(view([]), 'normal', 25), bluffs);
        if (players === 3) known += share(movesFor(view(called), 'normal', 25), bluffs);
      }
      fresh /= ids.length;
      known /= ids.length;
      // A caught bluff costs both cards: bluff rarely (less still heads-up), but not never.
      expect(fresh).toBeGreaterThan(0.05);
      expect(fresh).toBeLessThan(players === 2 ? 0.22 : 0.4);
      expect(known).toBe(0);
    }
  });

  it('calls the blocks of a player who blocks every kind of action (bot-1)', () => {
    const seats: SeatSpec[] = [
      { id: 'bot', cards: ['captain', 'duke'], coins: 2 },
      { id: 'a', cards: ['contessa', 'ambassador'], coins: 4 },
    ];
    const steal = declared('steal', 'bot', 'a');
    const blocksEverything: GameEvent[] = [
      actionEvent(declared('assassinate', 'bot', 'a')),
      { type: 'block', blockerId: 'a', character: 'contessa', actorId: 'bot', action: 'assassinate' },
      { type: 'action_blocked', actorId: 'bot', action: 'assassinate', blockerId: 'a', character: 'contessa' },
      actionEvent(declared('foreign_aid', 'bot')),
      { type: 'block', blockerId: 'a', character: 'duke', actorId: 'bot', action: 'foreign_aid' },
      { type: 'action_blocked', actorId: 'bot', action: 'foreign_aid', blockerId: 'a', character: 'duke' },
    ];
    const view = (history: GameEvent[]): GameView =>
      buildView({
        me: 'bot',
        seats,
        prompt: { kind: 'respond_block' },
        pendingAction: steal,
        pendingBlock: { blockerId: 'a', character: 'ambassador' },
        log: [
          ...history,
          actionEvent(steal),
          { type: 'block', blockerId: 'a', character: 'ambassador', actorId: 'bot', action: 'steal' },
        ],
      });
    const calls = (v: GameView): number => share(movesFor(v, 'hard'), (m) => m.type === 'challenge');
    expect(calls(view(blocksEverything))).toBeGreaterThan(0.9);
    expect(calls(view(blocksEverything))).toBeGreaterThan(calls(view([])));
  });

  it('never bluffs Duke after visibly declining Tax, and sometimes skips Tax with a real Duke (bot-3)', () => {
    const noDuke: SeatSpec[] = [
      { id: 'bot', cards: ['contessa', 'captain'], coins: 3 },
      { id: 'a', cards: ['ambassador', 'assassin'], coins: 1 },
      { id: 'b', cards: ['contessa', 'ambassador'], coins: 1 },
    ];
    const tookIncome: GameEvent[] = [
      { type: 'turn_start', playerId: 'bot', turn: 1 },
      actionEvent(declared('income', 'bot')),
      { type: 'coins', from: 'treasury', to: 'bot', amount: 1, reason: 'income' },
      { type: 'turn_start', playerId: 'a', turn: 2 },
      { type: 'turn_start', playerId: 'b', turn: 3 },
      { type: 'turn_start', playerId: 'bot', turn: 4 },
    ];
    const flagged = buildView({ me: 'bot', seats: noDuke, prompt: chooseActionPrompt(noDuke, 'bot'), log: tookIncome });
    expect(share(movesFor(flagged, 'hard', 500), (m) => m.type === 'action' && m.action === 'tax')).toBe(0);

    // A Duke holder with a clean steal available (the target let two steals through).
    const duke: SeatSpec[] = [
      { id: 'bot', cards: ['duke', 'captain'], coins: 2 },
      { id: 'a', cards: ['contessa', 'assassin'], coins: 6 },
      { id: 'b', cards: ['contessa', 'duke'], coins: 1 },
    ];
    const log: GameEvent[] = [];
    for (let i = 0; i < 2; i++) {
      log.push(
        actionEvent(declared('steal', 'b', 'a')),
        { type: 'action_resolved', actorId: 'b', action: 'steal', targetId: 'a' },
        { type: 'coins', from: 'a', to: 'b', amount: 2, reason: 'steal' },
        { type: 'coins', from: 'b', to: 'a', amount: 2, reason: 'refund' },
      );
    }
    const mixed = buildView({ me: 'bot', seats: duke, prompt: chooseActionPrompt(duke, 'bot'), log });
    const moves = movesFor(mixed, 'hard', 1000);
    const steals = share(moves, (m) => m.type === 'action' && m.action === 'steal');
    expect(steals).toBeGreaterThan(0.03);
    expect(steals).toBeLessThan(0.25);
    expect(share(moves, (m) => m.type === 'action' && m.action === 'tax') + steals).toBe(1);
  });
});
