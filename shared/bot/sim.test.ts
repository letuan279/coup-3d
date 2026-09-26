/**
 * Self-play regression guard: full bot-only games against the real engine (see simulation.ts;
 * `npx tsx scripts/simulate.ts --suite` prints the full tuning report).
 */
import { beforeAll, describe, expect, it } from 'vitest';
import type { BotLevel } from '../types';
import { ALL_LEVELS, emptyReport, ratio, simulate, winShare } from './simulation';
import type { SimReport } from './simulation';

const SMART: readonly BotLevel[] = ['normal', 'hard'];

function expectHealthy(r: SimReport): void {
  expect(r.samples).toEqual([]);
  expect(r.illegalMoves).toBe(0);
  expect(r.policyErrors).toBe(0);
  expect(r.crashes).toBe(0);
  expect(r.stalls).toBe(0);
  expect(r.finished).toBe(r.games);
}

describe('bot self-play against the engine', () => {
  let mixed3: SimReport;
  let mixed6: SimReport;
  let mixedAll: SimReport;
  let homogeneous: SimReport[];
  let everything: SimReport[];

  // One shared batch per table shape keeps the whole file well under the time budget.
  beforeAll(() => {
    mixed3 = simulate({ games: 900, levels: ALL_LEVELS, minPlayers: 3, maxPlayers: 3, seed: 101 });
    mixed6 = simulate({ games: 240, levels: ALL_LEVELS, minPlayers: 6, maxPlayers: 6, seed: 202 });
    mixedAll = simulate({ games: 300, levels: ALL_LEVELS, minPlayers: 2, maxPlayers: 6, seed: 303 });
    homogeneous = ALL_LEVELS.map((level) =>
      simulate({ games: 120, levels: [level], minPlayers: 4, maxPlayers: 6, seed: 404 }),
    );
    everything = [mixed3, mixed6, mixedAll, ...homogeneous];
  }, 30_000);

  it('plays every game to the end with legal moves only', () => {
    for (const r of everything) expectHealthy(r);
    expect(everything.reduce((n, r) => n + r.games, 0)).toBeGreaterThanOrEqual(1500);
  });

  it('hard clearly beats easy at mixed tables, with normal in between', () => {
    for (const r of [mixed3, mixed6]) {
      const easy = winShare(r, 'easy').share;
      const normal = winShare(r, 'normal').share;
      const hard = winShare(r, 'hard').share;
      expect(hard - easy).toBeGreaterThan(0.1);
      expect(hard).toBeGreaterThan(normal);
      expect(normal).toBeGreaterThan(easy);
    }
  });

  it('normal and hard always challenge impossible claims and never give up a lethal assassination', () => {
    const total = emptyReport();
    for (const r of everything) {
      for (const level of SMART) {
        total.levels[level].impossibleFaced += r.levels[level].impossibleFaced;
        total.levels[level].impossibleMissed += r.levels[level].impossibleMissed;
        total.levels[level].lethalFaced += r.levels[level].lethalFaced;
        total.levels[level].lethalPassed += r.levels[level].lethalPassed;
      }
    }
    for (const level of SMART) {
      const s = total.levels[level];
      expect(s.impossibleFaced).toBeGreaterThan(10);
      expect(s.impossibleMissed).toBe(0);
      expect(s.lethalFaced).toBeGreaterThan(50);
      expect(s.lethalPassed).toBe(0);
    }
  });

  it('bluffs and challenges at plausible, level-ordered rates', () => {
    for (const r of [mixed3, mixed6]) {
      const bluff = (l: BotLevel): number => {
        const s = r.levels[l];
        return ratio(s.actionBluffs + s.bluffBlocks, s.actionClaims + s.blocks);
      };
      expect(bluff('easy')).toBeGreaterThan(0.03);
      expect(bluff('easy')).toBeLessThan(bluff('normal'));
      for (const level of SMART) {
        expect(bluff(level)).toBeGreaterThan(0.12);
        expect(bluff(level)).toBeLessThan(0.4);
      }
      const hard = r.levels.hard;
      expect(ratio(hard.correctChallenges, hard.challenges)).toBeGreaterThan(0.55);
    }
  });

  it('keeps games to a sensible length', () => {
    for (const r of [mixedAll, ...homogeneous.slice(1)]) {
      expect(r.maxTurns).toBeLessThan(200);
      for (const [n, v] of Object.entries(r.byPlayers)) {
        // Generous bounds: this guards against stalemate regressions, not tuning drift.
        expect(ratio(v.turns, v.games)).toBeLessThan(15 * Number(n));
      }
    }
  });
});
