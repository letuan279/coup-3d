import { describe, expect, it } from 'vitest';
import type { GameEvent, GameEventType, GameView, PhaseView } from '@shared/types';
import { translate } from '../../i18n';
import type { Lang } from '../../store/useGame';
import { blockDuringActionWindow, describeBlockedAction, describePhase, joinNames, pendingDeciders } from '../game/phaseText';
import { describeEvent } from './describe';
import { formatSegs, segsToText } from './rich';

const players = [
  { id: 'a', name: 'Cáo' },
  { id: 'b', name: 'Heo' },
  { id: 'c', name: 'Mèo' },
];

/** One (or more) sample per event type — the Record forces every GameEventType to be covered. */
const SAMPLES: Record<GameEventType, GameEvent[]> = {
  game_start: [{ type: 'game_start', playerIds: ['a', 'b', 'c'], firstPlayerId: 'b' }],
  turn_start: [{ type: 'turn_start', playerId: 'a', turn: 3 }],
  action: [
    { type: 'action', actorId: 'a', action: 'income' },
    { type: 'action', actorId: 'a', action: 'foreign_aid' },
    { type: 'action', actorId: 'a', action: 'coup', targetId: 'b' },
    { type: 'action', actorId: 'a', action: 'tax', claim: 'duke' },
    { type: 'action', actorId: 'a', action: 'assassinate', targetId: 'b', claim: 'assassin' },
    { type: 'action', actorId: 'a', action: 'steal', targetId: 'c', claim: 'captain' },
    { type: 'action', actorId: 'a', action: 'exchange', claim: 'ambassador' },
  ],
  pass: [{ type: 'pass', playerId: 'c' }],
  challenge: [
    { type: 'challenge', challengerId: 'b', challengedId: 'a', character: 'duke', against: 'action' },
    { type: 'challenge', challengerId: 'a', challengedId: 'b', character: 'contessa', against: 'block' },
  ],
  challenge_result: [
    { type: 'challenge_result', challengerId: 'b', challengedId: 'a', character: 'duke', challengedHadCard: true, slot: 0 },
    { type: 'challenge_result', challengerId: 'b', challengedId: 'a', character: 'duke', challengedHadCard: false },
  ],
  card_replaced: [{ type: 'card_replaced', playerId: 'a', slot: 1, character: 'captain' }],
  block: [{ type: 'block', blockerId: 'b', character: 'captain', actorId: 'a', action: 'steal' }],
  influence_lost: [
    { type: 'influence_lost', playerId: 'b', slot: 0, character: 'contessa', reason: 'coup' },
    { type: 'influence_lost', playerId: 'b', slot: 1, character: 'duke', reason: 'caught_bluffing' },
  ],
  eliminated: [{ type: 'eliminated', playerId: 'b' }],
  coins: [
    { type: 'coins', from: 'treasury', to: 'a', amount: 1, reason: 'income' },
    { type: 'coins', from: 'treasury', to: 'a', amount: 3, reason: 'tax' },
    { type: 'coins', from: 'a', to: 'treasury', amount: 7, reason: 'coup' },
    { type: 'coins', from: 'treasury', to: 'a', amount: 3, reason: 'refund' },
    { type: 'coins', from: 'b', to: 'treasury', amount: 2, reason: 'eliminated' },
    { type: 'coins', from: 'c', to: 'a', amount: 2, reason: 'steal' },
    { type: 'coins', from: 'c', to: 'a', amount: 0, reason: 'steal' },
  ],
  exchange_draw: [{ type: 'exchange_draw', playerId: 'a', count: 2 }],
  exchange_done: [{ type: 'exchange_done', playerId: 'a', returned: 2 }],
  action_resolved: [{ type: 'action_resolved', actorId: 'a', action: 'tax' }],
  action_blocked: [{ type: 'action_blocked', actorId: 'a', action: 'steal', blockerId: 'b', character: 'ambassador' }],
  action_failed: [{ type: 'action_failed', actorId: 'a', action: 'assassinate' }],
  timeout: (['turn', 'action_response', 'block_response', 'lose_influence', 'exchange', 'game_over'] as const).map(
    (phase): GameEvent => ({ type: 'timeout', playerId: 'c', phase }),
  ),
  game_over: [{ type: 'game_over', winnerId: 'a' }],
};

const LANGS: Lang[] = ['vi', 'en'];

function tFor(lang: Lang) {
  return (key: string, params?: Record<string, string | number>) => translate(lang, key, params);
}

describe('describeEvent', () => {
  for (const lang of LANGS) {
    const t = tFor(lang);
    for (const [type, events] of Object.entries(SAMPLES)) {
      it(`${lang}: ${type}`, () => {
        for (const e of events) {
          const d = describeEvent(e, players, t);
          expect(d.text.length).toBeGreaterThan(3);
          expect(d.text).not.toMatch(/\{\w+\}/); // every placeholder filled
          expect(d.text).not.toMatch(/\b(log|char|action|reason|ui|common)\.[a-z_]/); // no raw keys
          expect(d.text).not.toContain('???');
        }
      });
    }
  }

  it('embeds players, characters and actions as segments', () => {
    const d = describeEvent({ type: 'action', actorId: 'a', action: 'tax', claim: 'duke' }, players, tFor('vi'));
    expect(d.segs).toContainEqual({ k: 'player', id: 'a', name: 'Cáo' });
    expect(d.segs.some((s) => s.k === 'char' && s.c === 'duke')).toBe(true);
    expect(d.segs.some((s) => s.k === 'action' && s.a === 'tax')).toBe(true);
    expect(d.text).toBe('Cáo tuyên bố Công tước để Thu thuế');
  });

  it('uses "you" for a targeted local player only when asked', () => {
    const e: GameEvent = { type: 'action', actorId: 'a', action: 'assassinate', targetId: 'b', claim: 'assassin' };
    expect(describeEvent(e, players, tFor('en'), { selfId: 'b' }).text).toBe('Cáo claims Assassin to Assassinate you');
    expect(describeEvent(e, players, tFor('en')).text).toBe('Cáo claims Assassin to Assassinate Heo');
  });

  it('singular / plural coins', () => {
    const en = tFor('en');
    expect(describeEvent({ type: 'coins', from: 'treasury', to: 'a', amount: 1, reason: 'income' }, players, en).text).toBe('Cáo gains 1 coin');
    expect(describeEvent({ type: 'coins', from: 'treasury', to: 'a', amount: 2, reason: 'foreign_aid' }, players, en).text).toBe(
      'Cáo gains 2 coins',
    );
  });
});

describe('formatSegs', () => {
  it('keeps unknown placeholders and plain text', () => {
    expect(segsToText(formatSegs('{a} + {b} = {c}', { a: 1, b: 'two' }))).toBe('1 + two = {c}');
  });
});

describe('phase text', () => {
  const pp = [
    { id: 'a', name: 'Cáo', seat: 0, coins: 2, influences: [], hiddenCount: 2, eliminated: false },
    { id: 'b', name: 'Heo', seat: 1, coins: 2, influences: [], hiddenCount: 2, eliminated: false },
    { id: 'c', name: 'Mèo', seat: 2, coins: 2, influences: [], hiddenCount: 1, eliminated: false },
  ];
  const tax = { type: 'tax' as const, actorId: 'a', claim: 'duke' as const };
  const steal = { type: 'steal' as const, actorId: 'a', targetId: 'b', claim: 'captain' as const };
  const block = { blockerId: 'b', character: 'captain' as const };
  const phases: PhaseView[] = [
    { kind: 'turn', actorId: 'a' },
    { kind: 'action_response', action: tax, responders: ['b', 'c'], passed: ['c'], canChallenge: true, blockers: [], blockCharacters: [] },
    { kind: 'action_response', action: steal, responders: ['b', 'c'], passed: [], canChallenge: true, blockers: ['b'], blockCharacters: ['captain', 'ambassador'] },
    { kind: 'block_response', action: steal, block, responders: ['a', 'c'], passed: [] },
    { kind: 'lose_influence', playerId: 'c', reason: 'wrong_challenge', action: tax, block: null },
    { kind: 'exchange', actorId: 'a', action: { type: 'exchange', actorId: 'a', claim: 'ambassador' } },
    { kind: 'game_over', winnerId: 'a' },
  ];

  function view(phase: PhaseView): GameView {
    return {
      viewerId: 'b',
      players: pp,
      deckCount: 5,
      treasury: 44,
      turn: 2,
      actorId: 'a',
      pendingAction: null,
      pendingBlock: null,
      phase,
      phaseSeq: 1,
      prompt: null,
      winnerId: null,
      log: [],
      deadline: null,
      phaseDurationMs: null,
      serverNow: 0,
    };
  }

  for (const lang of LANGS) {
    it(`${lang}: every phase, from every seat's point of view`, () => {
      const t = tFor(lang);
      for (const ph of phases) {
        for (const self of ['a', 'b', 'c', null]) {
          const d = describePhase(view(ph), self, t);
          const text = segsToText(d.segs);
          expect(text.length).toBeGreaterThan(3);
          expect(text).not.toMatch(/\{\w+\}/);
          expect(text).not.toMatch(/\b(phase|log)\.[a-z]/);
        }
      }
    });
  }

  describe('block pending while others may still challenge the action (SPEC §1.1)', () => {
    // Heo (b) steals from Gấu (d); Gấu blocked with Ambassador; Cáo (a) and Mèo (c) may still
    // challenge Heo's Captain claim.
    const p4 = [...pp, { id: 'd', name: 'Gấu', seat: 3, coins: 3, influences: [], hiddenCount: 2, eliminated: false }];
    const stealD = { type: 'steal' as const, actorId: 'b', targetId: 'd', claim: 'captain' as const };
    const blockD = { blockerId: 'd', character: 'ambassador' as const };
    const windowPhase: PhaseView = {
      kind: 'action_response',
      action: stealD,
      responders: ['a', 'c', 'd'],
      passed: ['d'],
      canChallenge: true,
      blockers: ['d'],
      blockCharacters: ['captain', 'ambassador'],
    };
    const g = (): GameView => ({ ...view(windowPhase), players: p4, pendingAction: stealD, pendingBlock: blockD });
    const text = (self: string | null, lang: Lang = 'vi') => segsToText(describePhase(g(), self, tFor(lang)).segs);

    it('bystanders see the action and the block', () => {
      expect(text('a')).toBe('Heo tuyên bố Thuyền trưởng để Cướp xu của Gấu — Gấu đã chặn bằng Đại sứ');
      expect(text(null, 'en')).toBe('Heo claims Captain to Steal from Gấu — Gấu blocked with Ambassador');
      expect(segsToText(describeBlockedAction(g(), blockD, 'a', tFor('vi')))).toBe(
        'Heo tuyên bố Thuyền trưởng để Cướp xu của Gấu — Gấu đã chặn bằng Đại sứ',
      );
    });

    it('the blocker is told they are waiting for challenges to the action', () => {
      expect(text('d')).toBe('Bạn đã chặn bằng Đại sứ — chờ người khác quyết định có thách thức Heo không');
      expect(describePhase(g(), 'd', tFor('vi')).mine).toBe(true);
    });

    it('the actor sees the block and that others may still challenge', () => {
      expect(text('b')).toBe('Gấu đã chặn Cướp của bạn bằng Đại sứ — những người khác vẫn có thể thách thức bạn');
    });

    it('only the remaining responders are pending', () => {
      expect(pendingDeciders(windowPhase)).toEqual(['a', 'c']);
      expect(blockDuringActionWindow(g())).toEqual(blockD);
      expect(blockDuringActionWindow({ ...g(), pendingBlock: null })).toBeNull();
    });
  });

  it('lists pending deciders', () => {
    expect(pendingDeciders(phases[0])).toEqual(['a']);
    expect(pendingDeciders(phases[1])).toEqual(['b']);
    expect(pendingDeciders(phases[3])).toEqual(['a', 'c']);
    expect(pendingDeciders(phases[6])).toEqual([]);
  });

  it('joins names naturally', () => {
    const t = tFor('vi');
    expect(joinNames(['Mai'], t)).toBe('Mai');
    expect(joinNames(['Mai', 'Khoa'], t)).toBe('Mai và Khoa');
    expect(joinNames(['Mai', 'Khoa', 'Heo'], t)).toBe('Mai, Khoa và Heo');
    expect(joinNames(['Mai', 'Khoa', 'Heo', 'Gấu'], t)).toBe('Mai, Khoa và 2 người khác');
  });
});
