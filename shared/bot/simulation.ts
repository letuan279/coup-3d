/**
 * Self-play harness: full games against the real engine where every decider is a bot, with
 * statistics that need the hidden state (who really bluffed, which challenges were right).
 *
 * Used by `scripts/simulate.ts` (tuning reports) and `sim.test.ts` (regression guard). Not
 * part of the bot's public API and never imported by the server or client.
 */
import { ACTIONS, CARDS_PER_CHARACTER, TREASURY_COINS } from '../constants';
import { createRng, hashString } from '../rng';
import { ACTION_TYPES, CHARACTERS } from '../types';
import type { ActionType, BotLevel, Character, GameState, Move, PlayerState, Prompt } from '../types';
import { applyMove, createGame, getDeciders, getDefaultMove, toView } from '../engine/index';
import type { BotContext } from './index';
import { fallbackMove, isLegalMove } from './legal';
import { decidePolicyMove } from './policy';

export interface SimOptions {
  games: number;
  /** Levels mixed at every table (one level → homogeneous tables). Seats rotate through them. */
  levels: readonly BotLevel[];
  /** Inclusive player-count range; games cycle through it. */
  minPlayers: number;
  maxPlayers: number;
  seed: number;
  /** A game still running after this many moves counts as a stall. */
  maxMoves?: number;
}

export interface LevelStats {
  /** Seat appearances. */
  seats: number;
  wins: number;
  turnsPlayed: number;
  actions: Record<ActionType, number>;
  /** Character claims made with an action, and how many of them were bluffs. */
  actionClaims: number;
  actionBluffs: number;
  /** Prompts that offered a block, blocks made, and blocks made without the card. */
  blockChances: number;
  blocks: number;
  bluffBlocks: number;
  /** Prompts that offered a challenge, challenges made, and challenges that caught a bluff. */
  challengeChances: number;
  challenges: number;
  correctChallenges: number;
  /** Challenges made facing a lethal assassination (challenge or bluff Contessa, or die). */
  forcedChallenges: number;
  forcedCorrect: number;
  /** This level's claims (actions and blocks) that were challenged, and how many were bluffs. */
  claimsChallenged: number;
  bluffsCaught: number;
  /** Caught bluffs split by kind. */
  actionBluffsCaught: number;
  blockBluffsCaught: number;
  /** Challengeable claims that were impossible from the bot's seat (0 unseen copies) / not challenged. */
  impossibleFaced: number;
  impossibleMissed: number;
  /**
   * One influence, no Contessa, assassinated (and a challenge or a Contessa bluff still
   * possible): decisions faced / passes (= certain elimination).
   */
  lethalFaced: number;
  lethalPassed: number;
  coups: number;
  coupCoins: number;
}

export interface SimReport {
  games: number;
  finished: number;
  stalls: number;
  crashes: number;
  /** Moves rejected by the engine (bot bug). */
  illegalMoves: number;
  /** The policy threw or returned an illegal move and the bot's safety net kicked in. */
  policyErrors: number;
  samples: string[];
  totalTurns: number;
  totalMoves: number;
  maxTurns: number;
  /** Seed of the longest finished game (replay it with playGame to investigate). */
  longestSeed: number;
  /** Per player count: games, the sum of their turn counts and of their round counts. */
  byPlayers: Record<number, { games: number; turns: number; rounds: number }>;
  levels: Record<BotLevel, LevelStats>;
}

export const ALL_LEVELS: readonly BotLevel[] = ['easy', 'normal', 'hard'];

function emptyLevel(): LevelStats {
  const actions = Object.fromEntries(ACTION_TYPES.map((a) => [a, 0])) as Record<ActionType, number>;
  return {
    seats: 0,
    wins: 0,
    turnsPlayed: 0,
    actions,
    actionClaims: 0,
    actionBluffs: 0,
    blockChances: 0,
    blocks: 0,
    bluffBlocks: 0,
    challengeChances: 0,
    challenges: 0,
    correctChallenges: 0,
    forcedChallenges: 0,
    forcedCorrect: 0,
    claimsChallenged: 0,
    bluffsCaught: 0,
    actionBluffsCaught: 0,
    blockBluffsCaught: 0,
    impossibleFaced: 0,
    impossibleMissed: 0,
    lethalFaced: 0,
    lethalPassed: 0,
    coups: 0,
    coupCoins: 0,
  };
}

export function emptyReport(): SimReport {
  return {
    games: 0,
    finished: 0,
    stalls: 0,
    crashes: 0,
    illegalMoves: 0,
    policyErrors: 0,
    samples: [],
    totalTurns: 0,
    totalMoves: 0,
    maxTurns: 0,
    longestSeed: 0,
    byPlayers: {},
    levels: { easy: emptyLevel(), normal: emptyLevel(), hard: emptyLevel() },
  };
}

// ───────────── Hidden-state helpers ─────────────

function holds(p: PlayerState, c: Character): boolean {
  return p.influences.some((inf) => !inf.revealed && inf.card.character === c);
}

function hiddenOf(p: PlayerState): number {
  return p.influences.filter((inf) => !inf.revealed).length;
}

/** Copies of `c` the viewer cannot see: 3 − face-up copies − the viewer's own hidden copies. */
function unseenFor(s: GameState, viewer: PlayerState, c: Character): number {
  let seen = 0;
  for (const p of s.players) {
    for (const inf of p.influences) {
      if (inf.card.character !== c) continue;
      if (inf.revealed || p === viewer) seen++;
    }
  }
  return CARDS_PER_CHARACTER - seen;
}

function playerOf(s: GameState, id: string): PlayerState {
  const p = s.players.find((x) => x.id === id);
  if (!p) throw new Error(`sim: unknown player ${id}`);
  return p;
}

/** The claim a challenge in the current phase would test: [claimant, character]. */
function challengedClaim(s: GameState): [PlayerState, Character] | null {
  if (s.phase.kind === 'block_response' && s.pendingBlock) {
    return [playerOf(s, s.pendingBlock.blockerId), s.pendingBlock.character];
  }
  if (s.phase.kind === 'action_response' && s.pendingAction?.claim) {
    return [playerOf(s, s.pendingAction.actorId), s.pendingAction.claim];
  }
  return null;
}

// ───────────── Bookkeeping per decision ─────────────

function record(
  s: GameState,
  playerId: string,
  prompt: Prompt,
  move: Move,
  levelOf: ReadonlyMap<string, BotLevel>,
  report: SimReport,
): void {
  const me = playerOf(s, playerId);
  const L = report.levels[levelOf.get(playerId) ?? 'normal'];

  if (prompt.kind === 'choose_action' && move.type === 'action') {
    L.turnsPlayed++;
    L.actions[move.action]++;
    const claim = ACTIONS[move.action].claim;
    if (claim) {
      L.actionClaims++;
      if (!holds(me, claim)) L.actionBluffs++;
    }
    if (move.action === 'coup') {
      L.coups++;
      L.coupCoins += me.coins;
    }
    return;
  }

  if (prompt.kind === 'respond_action' || prompt.kind === 'respond_block') {
    const act = s.pendingAction;
    // One card, no Contessa, assassinated: passing is certain elimination.
    const lethal =
      prompt.kind === 'respond_action' &&
      act?.type === 'assassinate' &&
      act.targetId === playerId &&
      hiddenOf(me) === 1 &&
      !holds(me, 'contessa');
    const canChallenge = prompt.kind === 'respond_block' || prompt.canChallenge;
    const claim = canChallenge ? challengedClaim(s) : null;
    if (claim) {
      L.challengeChances++;
      if (unseenFor(s, me, claim[1]) <= 0) {
        L.impossibleFaced++;
        if (move.type !== 'challenge') L.impossibleMissed++;
      }
      if (move.type === 'challenge') {
        const bluffed = !holds(claim[0], claim[1]);
        L.challenges++;
        if (bluffed) L.correctChallenges++;
        if (lethal) {
          L.forcedChallenges++;
          if (bluffed) L.forcedCorrect++;
        }
        const victim = report.levels[levelOf.get(claim[0].id) ?? 'normal'];
        victim.claimsChallenged++;
        if (bluffed) {
          victim.bluffsCaught++;
          if (prompt.kind === 'respond_block') victim.blockBluffsCaught++;
          else victim.actionBluffsCaught++;
        }
      }
    }
    if (prompt.kind === 'respond_action' && prompt.blockCharacters.length > 0) {
      L.blockChances++;
      if (move.type === 'block') {
        L.blocks++;
        if (!holds(me, move.character)) L.bluffBlocks++;
      }
      // Hopeless when the claim cannot be challenged and every Contessa is face up.
      if (lethal && (prompt.canChallenge || unseenFor(s, me, 'contessa') > 0)) {
        L.lethalFaced++;
        if (move.type === 'pass') L.lethalPassed++;
      }
    }
  }
}

/** Cheap engine sanity checks after every move (a violation is reported as a crash). */
function checkInvariants(s: GameState): void {
  const coins = s.players.reduce((n, p) => n + p.coins, s.treasury);
  if (coins !== TREASURY_COINS) throw new Error(`coins not conserved: ${coins}`);
  let cards = s.deck.length + (s.phase.kind === 'exchange' ? s.phase.drawn.length : 0);
  for (const p of s.players) {
    cards += p.influences.length;
    if (p.eliminated !== (hiddenOf(p) === 0)) throw new Error(`${p.id} elimination flag out of sync`);
    if (p.coins < 0 || (p.eliminated && p.coins !== 0)) throw new Error(`${p.id} has ${p.coins} coins`);
  }
  if (cards !== CHARACTERS.length * CARDS_PER_CHARACTER) throw new Error(`card count ${cards}`);
  const alive = s.players.filter((p) => !p.eliminated).length;
  if ((s.phase.kind === 'game_over') !== (alive === 1)) throw new Error(`${alive} alive in ${s.phase.kind}`);
}

// ───────────── Running games ─────────────

/** Level per seat for game `g`: the level list rotated by the game index. */
export function seatLevels(levels: readonly BotLevel[], players: number, g: number): BotLevel[] {
  return Array.from({ length: players }, (_, seat) => levels[(seat + g) % levels.length]);
}

/** Mirrors `decideBotMove`, counting how often its safety net was needed. */
function botMove(state: GameState, id: string, ctx: BotContext, report: SimReport): [Move, Prompt] {
  const view = toView(state, id);
  const prompt = view.prompt;
  if (!prompt) throw new Error(`sim: ${id} has no prompt`);
  try {
    const move = decidePolicyMove(view, prompt, ctx);
    if (isLegalMove(prompt, move)) return [move, prompt];
    report.policyErrors++;
    note(report, `policy illegal ${JSON.stringify(move)} for ${JSON.stringify(prompt)}`);
  } catch (err) {
    report.policyErrors++;
    note(report, `policy threw: ${(err as Error).stack ?? String(err)}`);
  }
  return [fallbackMove(prompt), prompt];
}

function note(report: SimReport, msg: string): void {
  if (report.samples.length < 8) report.samples.push(msg);
}

/** Full table rounds played: each turn counts 1 / (players alive when it started). */
function roundsPlayed(state: GameState): number {
  let alive = state.players.length;
  let rounds = 0;
  for (const e of state.log) {
    if (e.type === 'eliminated') alive--;
    else if (e.type === 'turn_start') rounds += 1 / Math.max(1, alive);
  }
  return rounds;
}

/** Plays one full game and folds its statistics into `report`. */
export function playGame(levels: readonly BotLevel[], seed: number, report: SimReport, maxMoves = 1000): void {
  const n = levels.length;
  const ids = levels.map((_, seat) => `g${seed.toString(36)}s${seat}`);
  const levelOf = new Map(ids.map((id, i) => [id, levels[i]]));
  const rands = new Map(ids.map((id) => [id, createRng(hashString(id) ^ seed)]));
  const order = createRng(seed ^ 0x5bd1e995);
  report.games++;
  report.byPlayers[n] ??= { games: 0, turns: 0, rounds: 0 };
  for (const l of levels) report.levels[l].seats++;

  let state = createGame({ players: ids.map((id, seat) => ({ id, name: id, seat })), seed });
  let moves = 0;
  try {
    while (state.phase.kind !== 'game_over') {
      if (moves >= maxMoves) {
        report.stalls++;
        note(report, `stall: seed ${seed}, ${n} players, turn ${state.turn}`);
        return;
      }
      const deciders = getDeciders(state);
      if (deciders.length === 0) throw new Error(`no deciders in ${state.phase.kind}`);
      const id = deciders[Math.floor(order() * deciders.length)];
      const level = levelOf.get(id) ?? 'normal';
      const [move, prompt] = botMove(state, id, { level, rand: rands.get(id)! }, report);
      record(state, id, prompt, move, levelOf, report);
      let res = applyMove(state, id, move);
      if (!res.ok) {
        report.illegalMoves++;
        note(report, `illegal (${res.error}) seed ${seed}: ${id} ${JSON.stringify(move)} in ${state.phase.kind}`);
        const fallback = getDefaultMove(state, id);
        if (!fallback) throw new Error('no default move');
        res = applyMove(state, id, fallback);
        if (!res.ok) throw new Error(`default move rejected: ${res.error}`);
      }
      state = res.state;
      checkInvariants(state);
      moves++;
    }
  } catch (err) {
    report.crashes++;
    note(report, `crash seed ${seed}: ${(err as Error).stack ?? String(err)}`);
    return;
  }
  report.finished++;
  report.totalTurns += state.turn;
  report.totalMoves += moves;
  if (state.turn > report.maxTurns) {
    report.maxTurns = state.turn;
    report.longestSeed = seed;
  }
  report.byPlayers[n].games++;
  report.byPlayers[n].turns += state.turn;
  report.byPlayers[n].rounds += roundsPlayed(state);
  const winner = state.winnerId ? levelOf.get(state.winnerId) : undefined;
  if (winner) report.levels[winner].wins++;
}

export function simulate(opts: SimOptions, report: SimReport = emptyReport()): SimReport {
  const span = opts.maxPlayers - opts.minPlayers + 1;
  for (let g = 0; g < opts.games; g++) {
    const players = opts.minPlayers + (g % span);
    // Rotate seats once per full cycle of player counts so every count sees every rotation.
    const rotation = Math.floor(g / span);
    const seed = (hashString(`${opts.seed}:${g}`) & 0x7fffffff) | 1;
    playGame(seatLevels(opts.levels, players, rotation), seed, report, opts.maxMoves);
  }
  return report;
}

// ───────────── Derived numbers & formatting ─────────────

export function ratio(a: number, b: number): number {
  return b > 0 ? a / b : 0;
}

/** Share of all finished games won by `level`, and the share its seat count would predict. */
export function winShare(r: SimReport, level: BotLevel): { share: number; fair: number } {
  const seats = ALL_LEVELS.reduce((n, l) => n + r.levels[l].seats, 0);
  return { share: ratio(r.levels[level].wins, r.finished), fair: ratio(r.levels[level].seats, seats) };
}

function pct(x: number): string {
  return `${(x * 100).toFixed(1)}%`;
}

export function formatReport(r: SimReport, title: string): string {
  const lines: string[] = [];
  const used = ALL_LEVELS.filter((l) => r.levels[l].seats > 0);
  lines.push(`== ${title} ==`);
  lines.push(
    `games ${r.games}  finished ${r.finished}  stalls ${r.stalls}  crashes ${r.crashes}  ` +
      `illegal moves ${r.illegalMoves}  policy errors ${r.policyErrors}`,
  );
  lines.push(
    `turns/game ${ratio(r.totalTurns, r.finished).toFixed(1)} (max ${r.maxTurns}, seed ${r.longestSeed})  ` +
      `moves/game ${ratio(r.totalMoves, r.finished).toFixed(1)}`,
  );
  const byN = Object.entries(r.byPlayers)
    .map(([n, v]) => `${n}p ${ratio(v.turns, v.games).toFixed(1)} (${ratio(v.rounds, v.games).toFixed(1)} rounds)`)
    .join('  ');
  lines.push(`turns/game by players: ${byN}`);

  const row = (label: string, f: (s: LevelStats, l: BotLevel) => string): void => {
    lines.push(`${label.padEnd(30)}${used.map((l) => f(r.levels[l], l).padStart(12)).join('')}`);
  };
  row('', (_, l) => l);
  if (used.length > 1) {
    row('win share (fair share)', (_, l) => {
      const w = winShare(r, l);
      return `${pct(w.share)} (${(w.fair * 100).toFixed(0)})`;
    });
  } else {
    row('wins', (s) => String(s.wins));
  }
  row('bluff rate (of action claims)', (s) => pct(ratio(s.actionBluffs, s.actionClaims)));
  row('bluff rate (actions + blocks)', (s) => pct(ratio(s.actionBluffs + s.bluffBlocks, s.actionClaims + s.blocks)));
  row('claims per turn', (s) => ratio(s.actionClaims, s.turnsPlayed).toFixed(2));
  row('challenge rate (of chances)', (s) => pct(ratio(s.challenges, s.challengeChances)));
  row('challenge accuracy', (s) => pct(ratio(s.correctChallenges, s.challenges)));
  row('  voluntary (not lethal)', (s) =>
    pct(ratio(s.correctChallenges - s.forcedCorrect, s.challenges - s.forcedChallenges)),
  );
  row('own claims challenged', (s) => String(s.claimsChallenged));
  row('  of which bluffs caught', (s) => pct(ratio(s.bluffsCaught, s.claimsChallenged)));
  row('action bluffs caught', (s) => pct(ratio(s.actionBluffsCaught, s.actionBluffs)));
  row('block bluffs caught', (s) => pct(ratio(s.blockBluffsCaught, s.bluffBlocks)));
  row('block rate (of chances)', (s) => pct(ratio(s.blocks, s.blockChances)));
  row('bluff-block rate (of blocks)', (s) => pct(ratio(s.bluffBlocks, s.blocks)));
  row('impossible claims faced', (s) => String(s.impossibleFaced));
  row('  left unchallenged', (s) => String(s.impossibleMissed));
  row('lethal assassination faced', (s) => String(s.lethalFaced));
  row('  passed (gave up)', (s) => String(s.lethalPassed));
  row('avg coins when couping', (s) => ratio(s.coupCoins, s.coups).toFixed(2));
  lines.push('action mix:');
  for (const a of ACTION_TYPES) row(`  ${a}`, (s) => pct(ratio(s.actions[a], s.turnsPlayed)));
  for (const s of r.samples) lines.push(`! ${s}`);
  return lines.join('\n');
}
