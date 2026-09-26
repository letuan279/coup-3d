/**
 * Value model, in rough "influence units" from the bot's point of view:
 * one coin ≈ 0.1, losing one of two influences ≈ 0.8, being eliminated ≈ 2.4.
 * In a duel, card losses are valued as the change in win probability (a win is worth 3), so
 * "the opponent loses their last card" is not worth a whole win when the bot was ahead anyway.
 */
import { ASSASSINATE_COST, COUP_COST, MUST_COUP_COINS } from '../constants';
import type { Character, DeclaredAction } from '../types';
import { hasClaimed, holdProbability } from './knowledge';
import type { PlayerIntel } from './knowledge';
import type { Situation } from './situation';

export const COIN = 0.1;

const WIN = 3;

/** Cost to the bot of losing one influence while holding `hidden` cards (multiplayer scale). */
function tableLoss(hidden: number): number {
  return hidden >= 2 ? 0.8 : 2.4;
}

/** The single remaining opponent, if the game is down to a duel. */
function duelOpponent(S: Situation): PlayerIntel | null {
  return S.K.opponents.length === 1 ? S.K.opponents[0] : null;
}

/** Rough chance the bot wins a duel holding `mine` cards against `theirs` (coins tilt it a little). */
function duelWin(S: Situation, mine: number, theirs: number): number {
  if (mine <= 0) return 0;
  if (theirs <= 0) return 1;
  const base = mine === theirs ? 0.5 : mine > theirs ? 0.75 : 0.25;
  const opp = duelOpponent(S);
  const edge = opp ? Math.max(-0.1, Math.min(0.1, (S.me.coins - opp.coins) * 0.02)) : 0;
  return Math.max(0.05, Math.min(0.95, base + edge));
}

/** Cost to the bot of losing one influence while holding `hidden` cards. */
export function selfLoss(S: Situation, hidden: number = S.me.hidden): number {
  const opp = duelOpponent(S);
  if (!opp) return tableLoss(hidden);
  return (duelWin(S, hidden, opp.hidden) - duelWin(S, hidden - 1, opp.hidden)) * WIN;
}

/** Threat of `p` relative to the other opponents, mapped to [0.8, 1.2]. */
export function threatMult(S: Situation, p: PlayerIntel): number {
  const values = [...S.threat.values()];
  const t = S.threat.get(p.id);
  if (t === undefined || values.length < 2) return 1;
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  return hi > lo ? 0.8 + (0.4 * (t - lo)) / (hi - lo) : 1;
}

/** Value to the bot of opponent `p` losing one influence while holding `hidden` cards. */
export function oppLossGain(S: Situation, p: PlayerIntel, hidden: number = p.hidden): number {
  const nOpp = S.K.opponents.length;
  if (hidden <= 0) return 0;
  if (nOpp <= 1) return (duelWin(S, S.me.hidden, hidden - 1) - duelWin(S, S.me.hidden, hidden)) * WIN;
  // With several opponents the others profit as much as the bot does.
  const share = nOpp === 2 ? 0.9 : 0.75;
  return (hidden === 1 ? 1.0 : 0.6) * share * threatMult(S, p);
}

/** Chance that `p` picks the bot when it next coups/assassinates. */
export function pTargetsMe(S: Situation, p: PlayerIntel): number {
  const others = S.K.opponents.filter((o) => o.id !== p.id);
  if (others.length === 0) return 0.9;
  const myThreat = S.me.hidden * 3 + S.me.coins / 2;
  const total = others.reduce((n, o) => n + o.hidden * 3 + o.coins / 2, myThreat);
  return total > 0 ? Math.min(1, (myThreat / total) * 1.2) : 1 / (others.length + 1);
}

/** Value to the bot of the bot itself gaining `k` coins. */
export function selfCoinValue(coins: number, k: number): number {
  if (k <= 0) return 0;
  if (coins >= MUST_COUP_COINS) return 0.02 * k;
  let v = COIN * k;
  if (coins < ASSASSINATE_COST && coins + k >= ASSASSINATE_COST) v += 0.08;
  if (coins < COUP_COST && coins + k >= COUP_COST) v += 0.2;
  return v;
}

/**
 * The bot gets a turn before `p` acts again: can it stop a coup coming its way? Only by
 * eliminating `p` (one card left) or by stealing `p` back below coup range — with real cards.
 */
function canStop(S: Situation, p: PlayerIntel, pCoins: number): boolean {
  if (p.hidden <= 1) {
    if (S.me.coins >= COUP_COST) return true;
    if (S.me.coins >= ASSASSINATE_COST && S.K.ownCounts.assassin > 0) return true;
  }
  return S.K.ownCounts.captain > 0 && pCoins - 2 < COUP_COST;
}

/** How bad it is for the bot that opponent `p` gains `k` coins (positive number). */
export function oppCoinValue(S: Situation, p: PlayerIntel, k: number): number {
  if (k <= 0) return 0;
  let v = 0.07 * k * threatMult(S, p);
  const before = p.coins;
  const after = p.coins + k;
  const fragile = S.me.hidden === 1;
  if (before < COUP_COST && after >= COUP_COST) {
    // A rival reaching coup range is a real threat — but the bot still gets a turn first.
    const stop = canStop(S, p, after) ? 0.3 : 1;
    v += 0.1 + pTargetsMe(S, p) * (fragile ? 0.7 : 0.35) * stop;
  } else if (before < ASSASSINATE_COST && after >= ASSASSINATE_COST && hasClaimed(p, 'assassin')) {
    v += 0.05 + pTargetsMe(S, p) * (fragile ? 0.6 : 0.2);
  }
  return v;
}

function coinGainFor(S: Situation, playerId: string, k: number): number {
  if (playerId === S.me.id) return selfCoinValue(S.me.coins, k);
  const p = S.K.players.get(playerId);
  return p ? -oppCoinValue(S, p, k) : 0;
}

function coinLossFor(S: Situation, playerId: string, k: number): number {
  if (k <= 0) return 0;
  if (playerId === S.me.id) return -selfCoinValue(Math.max(0, S.me.coins - k), k);
  const p = S.K.players.get(playerId);
  return p ? 0.05 * k * threatMult(S, p) : 0;
}

function influenceLossFor(S: Situation, playerId: string | undefined): number {
  if (!playerId) return 0;
  if (playerId === S.me.id) return -selfLoss(S);
  const p = S.K.players.get(playerId);
  return p ? oppLossGain(S, p) : 0;
}

/** Value to the bot of `act` resolving right now (negative = bad for the bot). */
export function effectValue(S: Situation, act: DeclaredAction): number {
  switch (act.type) {
    case 'income':
      return coinGainFor(S, act.actorId, 1);
    case 'foreign_aid':
      return coinGainFor(S, act.actorId, 2);
    case 'tax':
      return coinGainFor(S, act.actorId, 3);
    case 'steal': {
      const target = act.targetId ? S.K.players.get(act.targetId) : undefined;
      const k = Math.min(2, target?.coins ?? 0);
      return coinGainFor(S, act.actorId, k) + (act.targetId ? coinLossFor(S, act.targetId, k) : 0);
    }
    case 'assassinate':
    case 'coup':
      return influenceLossFor(S, act.targetId);
    case 'exchange': {
      if (act.actorId === S.me.id) return 0.2;
      const p = S.K.players.get(act.actorId);
      return p ? -0.12 * threatMult(S, p) : 0;
    }
  }
}

/** Probability that `p` blocks an action with one of `chars` (real card, or a bluff block). */
export function pBlockBy(S: Situation, p: PlayerIntel, chars: readonly Character[], bluffBlock: number): number {
  let none = 1;
  for (const c of chars) none *= 1 - holdProbability(S.K, p.id, c, S.depth);
  const real = 1 - none;
  return real + (1 - real) * bluffBlock;
}
