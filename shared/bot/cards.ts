/**
 * Card valuation: which influence to reveal and which cards to keep after an exchange.
 */
import { ASSASSINATE_COST, COUP_COST } from '../constants';
import type { Character, Move, Prompt } from '../types';
import { noise, pickRandom } from './situation';
import type { Situation } from './situation';

type LosePrompt = Extract<Prompt, { kind: 'lose_influence' }>;
type ExchangePrompt = Extract<Prompt, { kind: 'exchange' }>;

const BASE_VALUE: Record<Character, number> = {
  duke: 3.0,
  assassin: 2.6,
  captain: 2.4,
  contessa: 2.2,
  ambassador: 1.9,
};

/** 0..1: how likely an assassination is coming the bot's way. */
function assassinThreat(S: Situation): number {
  if (S.K.inHands.assassin <= 0) return 0;
  let t = 0;
  for (const o of S.K.opponents) {
    const claimed = o.claims.some((r) => r.character === 'assassin');
    const funds = o.coins >= ASSASSINATE_COST ? 1 : o.coins >= 1 ? 0.6 : 0.4;
    t = Math.max(t, (claimed ? 1 : 0.45) * funds);
  }
  return t;
}

function stealThreat(S: Situation): number {
  if (S.me.coins <= 0) return 0;
  const claimed = S.K.opponents.some((o) => o.claims.some((r) => r.character === 'captain'));
  return claimed ? 1 : S.K.inHands.captain > 0 ? 0.4 : 0;
}

/** Bonus for keeping the character the bot has been claiming (a consistent story). */
function claimWeight(S: Situation, c: Character): number {
  const claims = S.me.claims;
  const count = claims.reduce((n, r) => n + (r.character === c ? 1 : 0), 0);
  if (count === 0) return 0;
  const last = claims[claims.length - 1];
  return 1.2 + 0.3 * Math.min(count - 1, 2) + (last.character === c ? 0.3 : 0);
}

/** Situational value of holding `c` (without the consistency bonus). */
function cardValue(S: Situation, c: Character): number {
  let v = BASE_VALUE[c];
  switch (c) {
    case 'duke':
      if (S.me.coins < COUP_COST) v += 0.3;
      break;
    case 'assassin':
      if (S.me.coins >= ASSASSINATE_COST) v += 0.4;
      break;
    case 'captain':
      v += Math.min(0.4, 0.1 * S.K.opponents.filter((o) => o.coins >= 2).length) + 0.2 * stealThreat(S);
      break;
    case 'contessa':
      v += 1.3 * assassinThreat(S);
      if (S.K.inHands.assassin <= 0) v -= 0.6;
      break;
    case 'ambassador':
      v += 0.3 * stealThreat(S);
      break;
  }
  return v;
}

export function chooseReveal(S: Situation, prompt: LosePrompt): Move {
  const slots = prompt.slots;
  if (slots.length === 0) return { type: 'reveal', slot: 0 };
  if (slots.length === 1 || (S.level === 'easy' && S.rand() < 0.35)) {
    return { type: 'reveal', slot: pickRandom(S, slots) };
  }
  const mine = S.view.players.find((p) => p.id === S.me.id);
  let bestSlot = slots[0];
  let lowest = Infinity;
  for (const slot of slots) {
    const c = mine?.influences.find((i) => i.slot === slot)?.character ?? null;
    const keep = c ? cardValue(S, c) + claimWeight(S, c) + noise(S, S.tune.evNoise * 0.5) : -1;
    if (keep < lowest) {
      lowest = keep;
      bestSlot = slot;
    }
  }
  return { type: 'reveal', slot: bestSlot };
}

function combinations(n: number, k: number): number[][] {
  const out: number[][] = [];
  const pick = (start: number, acc: number[]): void => {
    if (acc.length === k) {
      out.push(acc.slice());
      return;
    }
    for (let i = start; i <= n - (k - acc.length); i++) {
      acc.push(i);
      pick(i + 1, acc);
      acc.pop();
    }
  };
  if (k >= 0 && k <= n) pick(0, []);
  return out;
}

function handScore(S: Situation, hand: readonly Character[]): number {
  let score = 0;
  const counts = new Map<Character, number>();
  for (const c of hand) {
    score += cardValue(S, c);
    // After an exchange observers reset their evidence, so past claims matter less.
    if (c !== 'ambassador') score += 0.35 * claimWeight(S, c);
    counts.set(c, (counts.get(c) ?? 0) + 1);
  }
  for (const n of counts.values()) if (n > 1) score -= 1.4 * (n - 1); // diversity beats duplicates
  if (counts.has('duke') && counts.has('assassin')) score += 0.3;
  return score;
}

export function chooseExchange(S: Situation, prompt: ExchangePrompt): Move {
  const combos = combinations(prompt.cards.length, prompt.keepCount);
  if (combos.length === 0) return { type: 'exchange', keep: Array.from({ length: prompt.keepCount }, (_, i) => i) };
  if (S.level === 'easy' && S.rand() < 0.35) return { type: 'exchange', keep: pickRandom(S, combos) };
  let best = combos[0];
  let bestScore = -Infinity;
  for (const keep of combos) {
    const hand = keep.map((i) => prompt.cards[i]);
    const score = handScore(S, hand) + noise(S, S.tune.evNoise * 2);
    if (score > bestScore) {
      bestScore = score;
      best = keep;
    }
  }
  return { type: 'exchange', keep: best };
}
