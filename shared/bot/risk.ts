/**
 * How likely is it that someone challenges a claim the bot is about to make?
 *
 * Hard bots model each opponent as a reasoning player in that opponent's seat (card counting
 * from their side, the bot's public claim history, what they stand to lose); easier bots only
 * look at how often each opponent has challenged so far.
 */
import { CARDS_PER_CHARACTER } from '../constants';
import { CHARACTERS } from '../types';
import type { Character } from '../types';
import { challengeTendency, holdProbability, pAtLeastOne, pExactly, posteriorFromPrior } from './knowledge';
import type { PlayerIntel } from './knowledge';
import { LEVEL_TUNING } from './personality';
import type { Situation } from './situation';
import { oppLossGain, selfLoss } from './value';

export interface RiskContext {
  /** Kind of claim the bot is about to make. */
  via: 'action' | 'block';
  /** What each opponent loses if the claim stands, in influence units (≥ 0). */
  stakes?: Readonly<Record<string, number>>;
  /** The player the claim is aimed at (the blocked actor): they call claims far more readily. */
  involved?: string;
  /** Observers know the bot had nothing to lose by claiming (e.g. one card facing an assassin). */
  forced?: boolean;
}

const TOTAL_CARDS = CHARACTERS.length * CARDS_PER_CHARACTER;
/** Opponents are assumed to reason like a normal-level bot. */
const OBSERVER_DEPTH = LEVEL_TUNING.normal.depth;

/** Copies of `c` that the table cannot see (what opponents count, ignoring their own hands). */
function publicUnseen(S: Situation, c: Character): number {
  return CARDS_PER_CHARACTER - S.K.revealed[c];
}

/** Value to an opponent of the bot losing one influence while holding `hidden` cards (shared with the table). */
export function botLossForOpponent(S: Situation, hidden: number = S.me.hidden): number {
  if (hidden <= 0) return 0;
  const nOpp = S.K.opponents.length;
  if (nOpp <= 1) return selfLoss(S, hidden); // a duel is zero-sum
  const share = nOpp === 2 ? 0.9 : 0.75;
  return (hidden <= 1 ? 1 : 0.6) * share;
}

/** What losing one of its own cards costs opponent `o`. */
export function opponentCardCost(S: Situation, o: PlayerIntel): number {
  if (S.K.opponents.length <= 1) return oppLossGain(S, o);
  return o.hidden >= 2 ? 0.8 : 2.4;
}

function logistic(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

/**
 * The edge a responder wants before challenging (mirrors respond.ts): bystanders leave cheap
 * claims alone and let the player who is hurt call it.
 */
function modeledMargin(S: Situation, stake: number, involved: boolean): number {
  if (S.K.opponents.length <= 1 || involved) return 0.08;
  return 0.08 + 0.14 * (1 - Math.min(1, stake / 0.3));
}

/** P(`o` challenges): averaged over how many copies of `c` `o` might hold. */
function modeledChallengeChance(S: Situation, o: PlayerIntel, c: Character, ctx: RiskContext): number {
  const pub = publicUnseen(S, c);
  const poolFromO = Math.max(1, TOTAL_CARDS - S.K.revealedTotal - o.hidden);
  const stake = ctx.stakes?.[o.id] ?? 0;
  const gain = botLossForOpponent(S) + stake;
  const loss = opponentCardCost(S, o);
  const involved = ctx.involved === o.id;
  const hot = involved || stake > 0.15;
  const margin = modeledMargin(S, stake, involved);
  // How many copies `o` holds: card counting, reweighted by what `o` has been claiming (a
  // player who claims Captain while the bot blocks with Captain is a likely challenger).
  const none = pExactly(S.K.pool, S.K.unseen[c], o.hidden, 0);
  const holds = holdProbability(S.K, o.id, c, S.depth);
  const someScale = none < 1 ? holds / (1 - none) : 0;
  let p = 0;
  for (let k = 0; k <= o.hidden; k++) {
    const raw = pExactly(S.K.pool, S.K.unseen[c], o.hidden, k);
    const pk = k === 0 ? 1 - holds : raw * someScale;
    if (pk <= 0) continue;
    const unseenFromO = pub - k;
    const belief =
      unseenFromO <= 0
        ? 0
        : posteriorFromPrior(pAtLeastOne(poolFromO, unseenFromO, S.me.hidden), S.me, c, OBSERVER_DEPTH, {
            claiming: true,
            via: ctx.via,
            forced: ctx.forced,
          });
    const q = 1 - belief;
    p += pk * logistic((q * gain - (1 - q) * loss - margin) / 0.08);
  }
  // Nobody reasons perfectly: lean on the style this player has actually shown as evidence
  // accumulates.
  const w = 0.2 + 0.4 * Math.min(1, o.challengeChances / 30);
  const cap = hot ? 0.85 : 0.6;
  return Math.min(cap, (1 - w) * p + w * Math.min(0.9, challengeTendency(o) * (hot ? 2 : 1)));
}

/** Observed-tendency estimate (easy/normal bots). */
function naiveChallengeChance(S: Situation, o: PlayerIntel, c: Character, ctx: RiskContext): number {
  const pub = publicUnseen(S, c);
  let m = pub === 1 ? 2.2 : pub === 2 ? 1.35 : 1;
  const myClaims = new Set(S.me.claims.map((r) => r.character));
  const repeats = myClaims.has(c);
  myClaims.add(c);
  if (myClaims.size > Math.max(1, S.me.hidden)) m *= 2;
  else if (repeats) m *= 0.75;
  m *= 1 + 1.2 * Math.min(1, (ctx.stakes?.[o.id] ?? 0) / 0.8);
  if (ctx.involved === o.id) m *= 1.8;
  // Everyone knows a player with nothing to lose claims whatever saves them.
  if (ctx.forced) m *= 3;
  return Math.min(0.9, challengeTendency(o) * m);
}

/** Probability that at least one opponent challenges the bot claiming `c`. */
export function challengeRisk(S: Situation, c: Character, ctx: RiskContext): number {
  if (publicUnseen(S, c) <= 0) return 0.97;
  // Everyone saw the bot caught without `c` and its hand has not changed since.
  if (S.me.lacks.has(c)) return 0.9;
  let none = 1;
  for (const o of S.K.opponents) {
    const p = S.level === 'hard' ? modeledChallengeChance(S, o, c, ctx) : naiveChallengeChance(S, o, c, ctx);
    none *= 1 - p;
  }
  return 1 - none;
}
