/**
 * Per-bot personality (stable per player id) and per-level tuning knobs.
 */
import { createRng, hashString } from '../rng';
import type { BotLevel } from '../types';

export interface Personality {
  /** Base chance to bluff when a bluff is about as good as the best remaining honest play. */
  bluffRate: number;
  /** Multiplier on the estimated probability that an opponent's claim is a bluff. */
  suspicion: number;
  /** Appetite for risky/aggressive plays (bluff blocks, finishing targets). ~0.85–1.2. */
  aggression: number;
}

/** Which parts of the claim-history model a level uses when estimating beliefs. */
export interface BeliefDepth {
  /** Unchallenged claims since the player's last hand change raise belief. */
  claims: boolean;
  /** A player caught bluffing X (no hand change since) certainly lacks X. */
  lacks: boolean;
  /** More distinct claimed characters than hidden cards → some claims are bluffs. */
  inconsistency: boolean;
  /** Players caught bluffing before get less credit for new claims. */
  history: boolean;
  /** Declined blocks (took the steal/assassination/foreign aid) lower belief in the blocker cards. */
  soft: boolean;
}

export interface LevelTuning {
  /** Chance to play a uniformly random (legal, non-suicidal) action on its turn. */
  randomActionRate: number;
  /** Uniform noise amplitude added to option values when choosing between responses. */
  evNoise: number;
  /** Chance to notice a claim that is impossible (all copies accounted for). */
  catchImpossibleRate: number;
  /** Extra value a challenge must beat passing by. */
  challengeMargin: number;
  /** The margin for challenging an action claim heads-up (the gain is not shared with anyone). */
  duelChallengeMargin: number;
  /**
   * The margin when the bot is the actor whose action was blocked: nobody else is likely to call
   * a block on the bot's behalf, so a player who bluff-blocks every steal must not get a pass.
   */
  blockedActorMargin: number;
  /** Multiplier on the personality's bluff rate. */
  bluffScale: number;
  /** Chance to pick a random target instead of the best one. */
  targetRandomness: number;
  /** Chance to block with a real card (vs. assassination a real Contessa is always used). */
  realBlockRate: number;
  /** Chance to coup when holding 7–9 coins. */
  coupRate: number;
  /**
   * Holding a Duke under 7 coins: chance to take a nearly-as-good honest action instead of Tax,
   * so that skipping Tax does not prove the bot has no Duke.
   */
  dukeMixRate: number;
  /** Chance to panic-pass instead of fighting a lethal assassination. */
  givesUpRate: number;
  /** With one card left, bluff only when the estimated challenge risk is below this… */
  oneCardBluffRisk: number;
  /** …and then at this fraction of the usual rate. */
  oneCardBluff: number;
  depth: BeliefDepth;
}

export const LEVEL_TUNING: Readonly<Record<BotLevel, Readonly<LevelTuning>>> = {
  easy: {
    randomActionRate: 0.3,
    evNoise: 0.5,
    catchImpossibleRate: 0.8,
    challengeMargin: 0.45,
    duelChallengeMargin: 0.45,
    blockedActorMargin: 0.45,
    bluffScale: 0.5,
    targetRandomness: 0.5,
    realBlockRate: 0.85,
    coupRate: 0.6,
    dukeMixRate: 0,
    givesUpRate: 0.25,
    oneCardBluffRisk: 0.3,
    oneCardBluff: 0.05,
    depth: { claims: false, lacks: false, inconsistency: false, history: false, soft: false },
  },
  normal: {
    randomActionRate: 0.04,
    evNoise: 0.12,
    catchImpossibleRate: 1,
    challengeMargin: 0.04,
    duelChallengeMargin: 0.04,
    blockedActorMargin: 0.04,
    bluffScale: 1.55,
    targetRandomness: 0.1,
    realBlockRate: 0.97,
    coupRate: 0.88,
    dukeMixRate: 0.1,
    givesUpRate: 0,
    oneCardBluffRisk: 0.12,
    oneCardBluff: 0.05,
    depth: { claims: true, lacks: true, inconsistency: true, history: false, soft: false },
  },
  hard: {
    randomActionRate: 0,
    evNoise: 0.04,
    catchImpossibleRate: 1,
    challengeMargin: 0.25,
    duelChallengeMargin: 0.15,
    blockedActorMargin: 0.08,
    bluffScale: 1.6,
    targetRandomness: 0,
    realBlockRate: 1,
    coupRate: 0.97,
    dukeMixRate: 0.12,
    givesUpRate: 0,
    oneCardBluffRisk: 0.15,
    oneCardBluff: 0.5,
    depth: { claims: true, lacks: true, inconsistency: true, history: true, soft: true },
  },
};

/** Deterministic personality derived from the bot's player id (same bot, same style). */
export function personalityFor(botId: string, level: BotLevel): Personality {
  const r = createRng(hashString(botId));
  const bluffRate = 0.25 + r() * 0.35;
  const suspicion = 0.9 + r() * 0.25;
  const aggression = 0.85 + r() * 0.35;
  if (level === 'easy') return { bluffRate: bluffRate * 0.5, suspicion: suspicion * 0.8, aggression };
  return { bluffRate, suspicion, aggression };
}
