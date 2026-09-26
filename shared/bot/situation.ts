/**
 * Everything a single decision needs, bundled once per call.
 */
import type { BotLevel, Character, GameView, Prompt } from '../types';
import type { BotContext } from './index';
import { buildKnowledge } from './knowledge';
import type { Knowledge, PlayerIntel } from './knowledge';
import { LEVEL_TUNING, personalityFor } from './personality';
import type { BeliefDepth, LevelTuning, Personality } from './personality';

export interface Situation {
  view: GameView;
  prompt: Prompt;
  level: BotLevel;
  rand: () => number;
  tune: LevelTuning;
  persona: Personality;
  depth: BeliefDepth;
  K: Knowledge;
  me: PlayerIntel;
  /** Threat score per living opponent (the leader gets a bonus). */
  threat: Map<string, number>;
}

/** Clamps a random source to [0, 1) and guards against NaN. */
function safeRand(rand: () => number): () => number {
  return () => {
    const r = rand();
    if (!Number.isFinite(r)) return 0.5;
    return Math.min(Math.max(r, 0), 0.999999);
  };
}

/** hidden cards × 3 + coins / 2 + recent Assassin/Duke claims, +2 for the leader. */
function computeThreat(K: Knowledge): Map<string, number> {
  const base = new Map<string, number>();
  for (const p of K.opponents) {
    let t = p.hidden * 3 + p.coins / 2;
    if (p.claims.some((r) => r.character === 'assassin')) t += 1.5;
    if (p.claims.some((r) => r.character === 'duke')) t += 1;
    base.set(p.id, t);
  }
  let leaderId: string | null = null;
  let best = -Infinity;
  for (const [id, t] of base) {
    if (t > best) {
      best = t;
      leaderId = id;
    }
  }
  if (leaderId) base.set(leaderId, best + 2);
  return base;
}

export function buildSituation(view: GameView, prompt: Prompt, ctx: BotContext): Situation {
  const level: BotLevel = ctx.level === 'easy' || ctx.level === 'hard' ? ctx.level : 'normal';
  const tune = LEVEL_TUNING[level];
  const ownOverride: Character[] | undefined = prompt.kind === 'exchange' ? prompt.cards : undefined;
  const K = buildKnowledge(view, ownOverride);
  const threat = computeThreat(K);
  return {
    view,
    prompt,
    level,
    rand: safeRand(ctx.rand),
    tune,
    persona: personalityFor(view.viewerId ?? '', level),
    depth: tune.depth,
    K,
    me: K.self,
    threat,
  };
}

/** Uniform noise in [-amp, amp]. */
export function noise(S: Situation, amp: number = S.tune.evNoise): number {
  return (S.rand() * 2 - 1) * amp;
}

export function pickRandom<T>(S: Situation, items: readonly T[]): T {
  return items[Math.floor(S.rand() * items.length)];
}
