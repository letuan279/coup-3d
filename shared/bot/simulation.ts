/**
 * Self-play harness: full games against the real engine where every decider is a bot, with
 * statistics that need the hidden state (who really bluffed, which challenges were right).
 *
 * Used by `scripts/simulate.ts` (tuning reports) and `sim.test.ts` (regression guard). Not
 * part of the bot's public API and never imported by the server or client.
 */
import { ACTIONS, CARDS_PER_CHARACTER, COUP_COST, TREASURY_COINS } from '../constants';
import { createRng, hashString } from '../rng';
import { ACTION_TYPES, CHARACTERS } from '../types';
import type { ActionType, BotLevel, Character, GameState, GameView, Move, PlayerState, Prompt } from '../types';
import { applyMove, createGame, getDeciders, getDefaultMove, toView } from '../engine/index';
import type { BotContext } from './index';
import { buildKnowledge } from './knowledge';
import { fallbackMove, isLegalMove } from './legal';
import { decidePolicyMove } from './policy';
import { SCRIPTS, isScriptId } from './scripted';
import type { ScriptId } from './scripted';

/** Who sits in a seat: a bot level, or a scripted exploit strategy (see scripted.ts). */
export type SeatKind = BotLevel | ScriptId;

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
  /**
   * Challenges with nothing to lose: facing a lethal assassination (challenge or bluff Contessa,
   * or die) or a doomed last-card block (see doomedBlocksFaced).
   */
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
  /** Contessa blocks made while holding 2 cards, and how many of them were bluffs. */
  contessaBlocks2: number;
  contessaBluffs2: number;
  /**
   * Heads-up, one card left, the bot's own steal/assassination blocked by a rival who keeps 7+
   * coins (letting the block stand means being couped next turn) with a block that may be a
   * bluff: decisions faced / passes.
   */
  doomedBlocksFaced: number;
  doomedBlocksPassed: number;
  /** Tax claims made while the public log shows the player declined Tax (see PlayerIntel.declinedTax). */
  flaggedTaxClaims: number;
  flaggedTaxBluffs: number;
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
  /** Scripted seats (exploit runs only). */
  scripts: Partial<Record<ScriptId, LevelStats>>;
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
    contessaBlocks2: 0,
    contessaBluffs2: 0,
    doomedBlocksFaced: 0,
    doomedBlocksPassed: 0,
    flaggedTaxClaims: 0,
    flaggedTaxBluffs: 0,
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
    scripts: {},
  };
}

/** Stats bucket of a seat kind (created on first use for scripts). */
export function statsOf(report: SimReport, kind: SeatKind): LevelStats {
  if (!isScriptId(kind)) return report.levels[kind];
  return (report.scripts[kind] ??= emptyLevel());
}

// ───────────── Hidden-state helpers ─────────────

function holds(p: PlayerState, c: Character): boolean {
  return p.influences.some((inf) => !inf.revealed && inf.card.character === c);
}

function hiddenOf(p: PlayerState): number {
  return p.influences.filter((inf) => !inf.revealed).length;
}

/**
 * Copies of `c` that could be in another player's hand from the viewer's seat: 3 − face-up copies
 * − the viewer's own hidden copies − copies the viewer provably returned to the deck.
 */
function unseenFor(s: GameState, viewer: PlayerState, c: Character): number {
  let seen = 0;
  for (const p of s.players) {
    for (const inf of p.influences) {
      if (inf.card.character !== c) continue;
      if (inf.revealed || p === viewer) seen++;
    }
  }
  for (const k of s.knownInDeck?.[viewer.id] ?? []) if (k === c) seen++;
  return CARDS_PER_CHARACTER - seen;
}

/** Cards whose character the viewer cannot place (deck + other players' hidden cards, minus known deck cards). */
function unknownFor(s: GameState, viewer: PlayerState): number {
  let known = s.knownInDeck?.[viewer.id]?.length ?? 0;
  for (const p of s.players) for (const inf of p.influences) if (inf.revealed || p === viewer) known++;
  return CHARACTERS.length * CARDS_PER_CHARACTER - known;
}

/** From the viewer's seat, `claimant` may be bluffing `c` (not impossible, not provably true). */
function doubtful(s: GameState, viewer: PlayerState, claimant: PlayerState, c: Character): boolean {
  const copies = unseenFor(s, viewer, c);
  return copies > 0 && unknownFor(s, viewer) - copies >= hiddenOf(claimant);
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
  view: GameView,
  playerId: string,
  prompt: Prompt,
  move: Move,
  kindOf: ReadonlyMap<string, SeatKind>,
  report: SimReport,
): void {
  const me = playerOf(s, playerId);
  const L = statsOf(report, kindOf.get(playerId) ?? 'normal');

  if (prompt.kind === 'choose_action' && move.type === 'action') {
    L.turnsPlayed++;
    L.actions[move.action]++;
    const claim = ACTIONS[move.action].claim;
    if (claim) {
      L.actionClaims++;
      if (!holds(me, claim)) L.actionBluffs++;
    }
    if (move.action === 'tax' && buildKnowledge(view).self.declinedTax) {
      L.flaggedTaxClaims++;
      if (!holds(me, 'duke')) L.flaggedTaxBluffs++;
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
    // Heads-up on the last card, the bot's own action blocked by a rival who keeps 7+ coins:
    // letting the block stand means being couped next turn (unless the block is provably true).
    const blk = s.pendingBlock;
    const doomed =
      prompt.kind === 'respond_block' &&
      act?.actorId === playerId &&
      !!blk &&
      hiddenOf(me) === 1 &&
      s.players.filter((p) => !p.eliminated).length === 2 &&
      playerOf(s, blk.blockerId).coins >= COUP_COST &&
      doubtful(s, me, playerOf(s, blk.blockerId), blk.character);
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
        if (lethal || doomed) {
          L.forcedChallenges++;
          if (bluffed) L.forcedCorrect++;
        }
        const victim = statsOf(report, kindOf.get(claim[0].id) ?? 'normal');
        victim.claimsChallenged++;
        if (bluffed) {
          victim.bluffsCaught++;
          if (prompt.kind === 'respond_block') victim.blockBluffsCaught++;
          else victim.actionBluffsCaught++;
        }
      }
    }
    if (doomed) {
      L.doomedBlocksFaced++;
      if (move.type === 'pass') L.doomedBlocksPassed++;
    }
    if (prompt.kind === 'respond_action' && prompt.blockCharacters.length > 0) {
      L.blockChances++;
      if (move.type === 'block') {
        L.blocks++;
        if (!holds(me, move.character)) L.bluffBlocks++;
        if (move.character === 'contessa' && hiddenOf(me) >= 2) {
          L.contessaBlocks2++;
          if (!holds(me, 'contessa')) L.contessaBluffs2++;
        }
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
export function seatLevels<T extends SeatKind>(levels: readonly T[], players: number, g: number): T[] {
  return Array.from({ length: players }, (_, seat) => levels[(seat + g) % levels.length]);
}

/** Mirrors `decideBotMove` (or runs a script), counting how often the bot's safety net was needed. */
function seatMove(
  state: GameState,
  id: string,
  kind: SeatKind,
  rand: () => number,
  report: SimReport,
): [Move, Prompt, GameView] {
  const view = toView(state, id);
  const prompt = view.prompt;
  if (!prompt) throw new Error(`sim: ${id} has no prompt`);
  if (isScriptId(kind)) {
    const move = SCRIPTS[kind](view, rand);
    if (!isLegalMove(prompt, move)) throw new Error(`script ${kind} illegal ${JSON.stringify(move)}`);
    return [move, prompt, view];
  }
  const ctx: BotContext = { level: kind, rand };
  try {
    const move = decidePolicyMove(view, prompt, ctx);
    if (isLegalMove(prompt, move)) return [move, prompt, view];
    report.policyErrors++;
    note(report, `policy illegal ${JSON.stringify(move)} for ${JSON.stringify(prompt)}`);
  } catch (err) {
    report.policyErrors++;
    note(report, `policy threw: ${(err as Error).stack ?? String(err)}`);
  }
  return [fallbackMove(prompt), prompt, view];
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

/** Plays one full game and folds its statistics into `report`. Returns the winner's seat kind. */
export function playGame(
  levels: readonly SeatKind[],
  seed: number,
  report: SimReport,
  maxMoves = 1000,
): SeatKind | undefined {
  const n = levels.length;
  const ids = levels.map((_, seat) => `g${seed.toString(36)}s${seat}`);
  const levelOf = new Map(ids.map((id, i) => [id, levels[i]]));
  const rands = new Map(ids.map((id) => [id, createRng(hashString(id) ^ seed)]));
  const order = createRng(seed ^ 0x5bd1e995);
  report.games++;
  report.byPlayers[n] ??= { games: 0, turns: 0, rounds: 0 };
  for (const l of levels) statsOf(report, l).seats++;

  let state = createGame({ players: ids.map((id, seat) => ({ id, name: id, seat })), seed });
  let moves = 0;
  try {
    while (state.phase.kind !== 'game_over') {
      if (moves >= maxMoves) {
        report.stalls++;
        note(report, `stall: seed ${seed}, ${n} players, turn ${state.turn}`);
        return undefined;
      }
      const deciders = getDeciders(state);
      if (deciders.length === 0) throw new Error(`no deciders in ${state.phase.kind}`);
      const id = deciders[Math.floor(order() * deciders.length)];
      const level = levelOf.get(id) ?? 'normal';
      const [move, prompt, view] = seatMove(state, id, level, rands.get(id)!, report);
      record(state, view, id, prompt, move, levelOf, report);
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
    return undefined;
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
  if (winner) statsOf(report, winner).wins++;
  return winner;
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

export interface ExploitOptions {
  script: ScriptId;
  /** Level of every other seat. */
  level: BotLevel;
  players: number;
  games: number;
  seed: number;
  maxMoves?: number;
}

/**
 * One scripted seat against `players − 1` bots of one level; the script's seat rotates. The game
 * seeds depend only on `seed` and the game index, so runs against different levels are paired.
 */
export function simulateExploit(opts: ExploitOptions, report: SimReport = emptyReport()): SimReport {
  for (let g = 0; g < opts.games; g++) {
    const seats: SeatKind[] = Array.from({ length: opts.players }, () => opts.level);
    seats[g % opts.players] = opts.script;
    const seed = (hashString(`exploit:${opts.seed}:${g}`) & 0x7fffffff) | 1;
    playGame(seats, seed, report, opts.maxMoves);
  }
  return report;
}

/** Share of finished games the script won. */
export function scriptWinRate(r: SimReport, script: ScriptId): number {
  return ratio(r.scripts[script]?.wins ?? 0, r.finished);
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
  row('  voluntary (not forced)', (s) =>
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
  row('2-card Contessa blocks', (s) => String(s.contessaBlocks2));
  row('  of which bluffs', (s) => pct(ratio(s.contessaBluffs2, s.contessaBlocks2)));
  row('doomed last-card block faced', (s) => String(s.doomedBlocksFaced));
  row('  passed (then couped)', (s) => String(s.doomedBlocksPassed));
  row('Tax after declining Tax', (s) => String(s.flaggedTaxClaims));
  row('  of which bluffs', (s) => pct(ratio(s.flaggedTaxBluffs, s.flaggedTaxClaims)));
  row('avg coins when couping', (s) => ratio(s.coupCoins, s.coups).toFixed(2));
  lines.push('action mix:');
  for (const a of ACTION_TYPES) row(`  ${a}`, (s) => pct(ratio(s.actions[a], s.turnsPlayed)));
  for (const s of r.samples) lines.push(`! ${s}`);
  return lines.join('\n');
}
