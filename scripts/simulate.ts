/**
 * Bot self-play simulator: full games against the real engine, every seat a bot.
 *
 *   npx tsx scripts/simulate.ts [games] [--levels=easy,normal,hard] [--players=2-6] [--seed=N]
 *   npx tsx scripts/simulate.ts [games] --suite     # standard tuning suite (games per config)
 *
 * Levels are rotated through the seats (one level → homogeneous tables). Exits non-zero on any
 * illegal move, crash, policy error or stall.
 */
import { formatReport, simulate } from '../shared/bot/simulation';
import type { SimOptions, SimReport } from '../shared/bot/simulation';
import type { BotLevel } from '../shared/types';

const LEVELS: readonly BotLevel[] = ['easy', 'normal', 'hard'];

interface Args {
  games: number;
  levels: BotLevel[];
  minPlayers: number;
  maxPlayers: number;
  seed: number;
  suite: boolean;
}

function fail(msg: string): never {
  console.error(msg);
  process.exit(2);
}

function parseArgs(argv: readonly string[]): Args {
  const args: Args = { games: 1000, levels: LEVELS.slice(), minPlayers: 2, maxPlayers: 6, seed: 1, suite: false };
  for (const a of argv) {
    if (/^\d+$/.test(a)) args.games = Number(a);
    else if (a === '--suite') args.suite = true;
    else if (a.startsWith('--levels=')) {
      const levels = a.slice('--levels='.length).split(',').filter(Boolean);
      if (levels.length === 0 || levels.some((l) => !(LEVELS as readonly string[]).includes(l))) {
        fail(`bad --levels: ${a} (use easy,normal,hard)`);
      }
      args.levels = levels as BotLevel[];
    } else if (a.startsWith('--players=')) {
      const m = /^(\d)(?:-(\d))?$/.exec(a.slice('--players='.length));
      const lo = m ? Number(m[1]) : NaN;
      const hi = m?.[2] ? Number(m[2]) : lo;
      if (!m || lo < 2 || hi > 6 || lo > hi) fail(`bad --players: ${a} (use e.g. 4 or 2-6)`);
      args.minPlayers = lo;
      args.maxPlayers = hi;
    } else if (a.startsWith('--seed=')) {
      args.seed = Number(a.slice('--seed='.length)) | 0;
    } else fail(`unknown argument: ${a}`);
  }
  return args;
}

function run(title: string, opts: SimOptions): SimReport {
  const t0 = performance.now();
  const report = simulate(opts);
  const secs = (performance.now() - t0) / 1000;
  console.log(formatReport(report, `${title} — ${secs.toFixed(1)}s`));
  console.log('');
  return report;
}

function healthy(r: SimReport): boolean {
  return r.illegalMoves === 0 && r.crashes === 0 && r.policyErrors === 0 && r.stalls === 0 && r.finished === r.games;
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const base = { games: args.games, seed: args.seed };
  const reports: SimReport[] = [];
  if (args.suite) {
    reports.push(run('mixed easy/normal/hard, 3 players', { ...base, levels: LEVELS, minPlayers: 3, maxPlayers: 3 }));
    reports.push(run('mixed easy/normal/hard, 6 players', { ...base, levels: LEVELS, minPlayers: 6, maxPlayers: 6 }));
    reports.push(run('mixed easy/normal/hard, 2-6 players', { ...base, levels: LEVELS, minPlayers: 2, maxPlayers: 6 }));
    for (const level of LEVELS) {
      reports.push(run(`all ${level}, 4-6 players`, { ...base, levels: [level], minPlayers: 4, maxPlayers: 6 }));
    }
  } else {
    const levels = args.levels.join('/');
    const { minPlayers, maxPlayers } = args;
    const players = minPlayers === maxPlayers ? `${minPlayers}` : `${minPlayers}-${maxPlayers}`;
    reports.push(
      run(`${levels}, ${players} players`, {
        ...base,
        levels: args.levels,
        minPlayers: args.minPlayers,
        maxPlayers: args.maxPlayers,
      }),
    );
  }
  const total = reports.reduce((n, r) => n + r.games, 0);
  const ok = reports.every(healthy);
  console.log(`${total} games simulated — ${ok ? 'OK' : 'PROBLEMS FOUND'}`);
  if (!ok) process.exit(1);
}

main();
