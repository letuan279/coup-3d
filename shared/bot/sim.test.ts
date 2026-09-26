/**
 * Self-play regression guard: full bot-only games against the real engine (see simulation.ts;
 * `npx tsx scripts/simulate.ts --suite` prints the full tuning report), plus scripted "exploit"
 * opponents (scripted.ts; `npx tsx scripts/simulate.ts --exploits`) that a human could copy.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import type { BotLevel } from '../types';
import type { ScriptId } from './scripted';
import { ALL_LEVELS, emptyReport, ratio, scriptWinRate, simulate, simulateExploit, winShare } from './simulation';
import type { LevelStats, SimReport } from './simulation';

const SMART: readonly BotLevel[] = ['normal', 'hard'];

function expectHealthy(r: SimReport): void {
  expect(r.samples).toEqual([]);
  expect(r.illegalMoves).toBe(0);
  expect(r.policyErrors).toBe(0);
  expect(r.crashes).toBe(0);
  expect(r.stalls).toBe(0);
  expect(r.finished).toBe(r.games);
}

/** Sums the counters of `level` over several reports. */
function pooled(reports: readonly SimReport[], level: BotLevel): LevelStats {
  const total = emptyReport().levels[level];
  for (const r of reports) {
    const s = r.levels[level];
    for (const k of Object.keys(total) as (keyof LevelStats)[]) {
      if (typeof total[k] === 'number') (total[k] as number) += s[k] as number;
    }
  }
  return total;
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

  it('normal and hard always challenge impossible claims and never give up a lethal position', () => {
    for (const level of SMART) {
      const s = pooled(everything, level);
      expect(s.impossibleFaced).toBeGreaterThan(10);
      expect(s.impossibleMissed).toBe(0);
      expect(s.lethalFaced).toBeGreaterThan(50);
      expect(s.lethalPassed).toBe(0);
      // Last card, heads-up, own action blocked by a rival in coup range: passing = being couped.
      expect(s.doomedBlocksFaced).toBeGreaterThan(20);
      expect(s.doomedBlocksPassed).toBe(0);
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
        expect(bluff(level)).toBeGreaterThan(0.08);
        expect(bluff(level)).toBeLessThan(0.4);
      }
      // Voluntary challenges only: a last-card bot about to be couped calls whatever it can.
      const hard = r.levels.hard;
      const voluntary = ratio(hard.correctChallenges - hard.forcedCorrect, hard.challenges - hard.forcedChallenges);
      expect(voluntary).toBeGreaterThan(0.55);
    }
  });

  it('bluffs Contessa with two cards rarely enough that calling it does not pay (bot-4)', () => {
    const normal = pooled([mixed3, mixed6, mixedAll, homogeneous[1]], 'normal');
    expect(normal.contessaBlocks2).toBeGreaterThan(150);
    expect(ratio(normal.contessaBluffs2, normal.contessaBlocks2)).toBeLessThan(0.35);
  });

  it('hard stops bluffing Duke once it has visibly declined Tax with the same hand (bot-3)', () => {
    const hard = pooled(everything, 'hard');
    expect(hard.flaggedTaxClaims).toBeGreaterThan(20); // real Dukes, from the mixed-in alternatives
    expect(ratio(hard.flaggedTaxBluffs, hard.flaggedTaxClaims)).toBeLessThan(0.2);
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

/**
 * Scripted strategies a human could adopt. None of them may find hard easier to beat than normal
 * (beyond sampling noise), and none may turn a known weakness into a clear profit. Numbers are
 * deterministic for the fixed seeds; the margins leave room for tuning drift, not for the
 * original bugs (e.g. the liar won 36% heads-up against hard vs 19% against normal).
 */
describe('exploit scripts against the bots', () => {
  const GAMES = 1500;
  const runs = new Map<string, SimReport>();
  const key = (script: ScriptId, level: BotLevel, players: number): string => `${script}/${level}/${players}`;
  const rate = (script: ScriptId, level: BotLevel, players: number): number =>
    scriptWinRate(runs.get(key(script, level, players))!, script);

  beforeAll(() => {
    const plan: [ScriptId, BotLevel, number][] = [];
    for (const script of ['liar', 'honest', 'stealBlocker'] as const) {
      for (const level of SMART) for (const players of [2, 3]) plan.push([script, level, players]);
    }
    plan.push(['contessaCaller', 'normal', 2]);
    for (const level of SMART) for (const players of [2, 3]) plan.push(['dukeTellCaller', level, players]);
    for (const [script, level, players] of plan) {
      runs.set(key(script, level, players), simulateExploit({ script, level, players, games: GAMES, seed: 7 }));
    }
  }, 60_000);

  it('plays every exploit game to the end with legal moves only', () => {
    for (const r of runs.values()) expectHealthy(r);
  });

  it('the always-bluff liar does no better against hard than against normal (bot-1)', () => {
    // (Measured over 3000 games per cell: about +1.5 to +2.5 points, within sampling noise of
    // these 1500-game cells; it was +17 heads-up and +6 at three players before the fixes.)
    for (const players of [2, 3]) {
      expect(rate('liar', 'hard', players)).toBeLessThan(rate('liar', 'normal', players) + 0.05);
      expect(rate('liar', 'hard', players)).toBeLessThan(1 / players);
    }
    const pool = (level: BotLevel): number => (rate('liar', level, 2) + rate('liar', level, 3)) / 2;
    expect(pool('hard')).toBeLessThan(pool('normal') + 0.04);
  });

  it('an honest never-challenger and an always-block-steals player find hard no easier than normal', () => {
    for (const players of [2, 3]) {
      expect(rate('honest', 'hard', players)).toBeLessThan(rate('honest', 'normal', players) + 0.01);
      expect(rate('stealBlocker', 'hard', players)).toBeLessThan(rate('stealBlocker', 'normal', players) + 0.02);
    }
    // Before the fixes: honest 24% / 29.5% against hard (3000 games) — calling more blocks must
    // not hand the honest player much.
    expect(rate('honest', 'hard', 2)).toBeLessThan(0.29);
    expect(rate('honest', 'hard', 3)).toBeLessThan(0.325);
  });

  it('calling every two-card Contessa block barely pays against normal (bot-4)', () => {
    // It gained 14 points heads-up before the fix.
    expect(rate('contessaCaller', 'normal', 2)).toBeLessThan(rate('honest', 'normal', 2) + 0.045);
  });

  it('reading the declined-Tax tell does not pay (bot-3)', () => {
    for (const level of SMART) {
      for (const players of [2, 3]) {
        expect(rate('dukeTellCaller', level, players)).toBeLessThan(rate('honest', level, players) + 0.025);
      }
    }
  });

  it('hard calls every claim its own exchange made impossible and every doomed last-card block', () => {
    const all = [...runs.values()];
    for (const level of SMART) {
      const s = pooled(all, level);
      expect(s.impossibleFaced).toBeGreaterThan(20);
      expect(s.impossibleMissed).toBe(0);
    }
    const hard = pooled(all, 'hard');
    expect(hard.doomedBlocksFaced).toBeGreaterThan(30);
    expect(hard.doomedBlocksPassed).toBe(0);
  });
});
