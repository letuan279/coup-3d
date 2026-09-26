/**
 * Picking victims for coup / assassinate / steal.
 */
import type { ActionType } from '../types';
import type { PlayerIntel } from './knowledge';
import { holdProbability, recentBlocks, roundLength } from './knowledge';
import { pickRandom } from './situation';
import type { Situation } from './situation';
import { COIN, pBlockBy, selfCoinValue, threatMult } from './value';

export interface TargetPick {
  id: string;
  player: PlayerIntel;
  /** Probability the target blocks (real card or bluff). */
  pBlock: number;
  score: number;
}

function candidates(S: Situation, targets: readonly string[]): PlayerIntel[] {
  const out: PlayerIntel[] = [];
  for (const id of targets) {
    const p = S.K.players.get(id);
    if (p && p.alive) out.push(p);
  }
  return out;
}

function threatOf(S: Situation, p: PlayerIntel): number {
  return S.threat.get(p.id) ?? p.hidden * 3 + p.coins / 2;
}

/** Eliminating a one-card player is worth extra when it wins or leaves a duel. */
function finishingBonus(S: Situation, p: PlayerIntel, size: number): number {
  return p.hidden === 1 && S.K.opponents.length <= 2 ? size * S.persona.aggression : 0;
}

function argmax(picks: TargetPick[]): TargetPick | null {
  let top: TargetPick | null = null;
  for (const p of picks) if (!top || p.score > top.score) top = p;
  return top;
}

function randomPick(S: Situation, picks: TargetPick[]): TargetPick | null {
  if (picks.length === 0) return null;
  return S.rand() < S.tune.targetRandomness ? pickRandom(S, picks) : argmax(picks);
}

export function coupTarget(S: Situation, targets: readonly string[]): string {
  const picks = candidates(S, targets).map(
    (p): TargetPick => ({ id: p.id, player: p, pBlock: 0, score: threatOf(S, p) + finishingBonus(S, p, 8) }),
  );
  return randomPick(S, picks)?.id ?? targets[0];
}

/** Players who keep blocking an action will likely block it again (whatever their hand). */
function withBlockHabit(S: Situation, p: PlayerIntel, action: ActionType, pBlock: number): number {
  if (S.level === 'easy') return pBlock;
  const n = recentBlocks(S.K, p, action, 3 * roundLength(S.K));
  return 1 - (1 - pBlock) * 0.35 ** n;
}

/** Probability that `p` stops an assassination with a Contessa (real, or a desperate bluff). */
function contessaBlockChance(S: Situation, p: PlayerIntel): number {
  const real = holdProbability(S.K, p.id, 'contessa', S.depth);
  const bluff = S.K.unseen.contessa <= 0 && S.level !== 'easy' ? 0.05 : p.hidden === 1 ? 0.45 : 0.12;
  return withBlockHabit(S, p, 'assassinate', real + (1 - real) * bluff);
}

export function assassinTarget(S: Situation, targets: readonly string[]): TargetPick | null {
  const picks = candidates(S, targets).map((p): TargetPick => {
    const pBlock = contessaBlockChance(S, p);
    return { id: p.id, player: p, pBlock, score: (threatOf(S, p) + finishingBonus(S, p, 4)) * (1 - pBlock) };
  });
  return randomPick(S, picks);
}

export function stealTarget(S: Situation, targets: readonly string[]): TargetPick | null {
  const picks: TargetPick[] = [];
  for (const p of candidates(S, targets)) {
    if (p.coins <= 0) continue; // nothing to take
    const k = Math.min(2, p.coins);
    const pBlock = withBlockHabit(S, p, 'steal', pBlockBy(S, p, ['captain', 'ambassador'], 0.12));
    const gain = selfCoinValue(S.me.coins, k) + 0.05 * k * threatMult(S, p);
    // Denying a threat its coins is only worth something when the steal goes through.
    picks.push({ id: p.id, player: p, pBlock, score: (1 - pBlock) * (gain + threatOf(S, p) * 0.1 * COIN) });
  }
  return randomPick(S, picks);
}
