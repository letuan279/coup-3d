/**
 * Reacting to other players' claims: challenge, block (real or bluffed) or pass.
 *
 * Each option is valued as the expected outcome for the bot (see value.ts); passing is worth
 * the action's effect, a successful block is worth 0.
 */
import { ACTIONS, COUP_COST } from '../constants';
import type { Character, DeclaredAction, DeclaredBlock, GameView, Move, Prompt } from '../types';
import { holdProbability, isCertainBluff, roundLength } from './knowledge';
import type { PlayerIntel } from './knowledge';
import { botLossForOpponent, challengeRisk } from './risk';
import { noise } from './situation';
import type { Situation } from './situation';
import { effectValue, oppLossGain, selfLoss } from './value';

type RespondActionPrompt = Extract<Prompt, { kind: 'respond_action' }>;

const PASS: Move = { type: 'pass' };
const CHALLENGE: Move = { type: 'challenge' };

interface Scored {
  move: Move;
  value: number;
}

function best(options: readonly Scored[]): Move {
  let top = options[0];
  for (const o of options) if (o.value > top.value) top = o;
  return top.move;
}

function pendingAction(view: GameView): DeclaredAction | null {
  if (view.pendingAction) return view.pendingAction;
  const ph = view.phase;
  return ph.kind === 'action_response' || ph.kind === 'block_response' ? ph.action : null;
}

function pendingBlock(view: GameView): DeclaredBlock | null {
  if (view.pendingBlock) return view.pendingBlock;
  return view.phase.kind === 'block_response' ? view.phase.block : null;
}

/** Log seq of the latest matching claim, so it is not counted as its own history. */
function claimSeq(view: GameView, via: 'action' | 'block', playerId: string, c: Character): number | undefined {
  for (let i = view.log.length - 1; i >= 0; i--) {
    const ev = view.log[i];
    if (via === 'action' && ev.type === 'action' && ev.actorId === playerId && ev.claim === c) return ev.seq;
    if (via === 'block' && ev.type === 'block' && ev.blockerId === playerId && ev.character === c) return ev.seq;
  }
  return undefined;
}

/** Probability that `player`'s current claim of `c` is a bluff, bent by the bot's suspicion. */
function bluffProbability(
  S: Situation,
  player: PlayerIntel,
  c: Character,
  via: 'action' | 'block',
  flags: { forced?: boolean; desperate?: boolean } = {},
): number {
  const seq = claimSeq(S.view, via, player.id, c);
  const q = 1 - holdProbability(S.K, player.id, c, S.depth, { claiming: true, claimSeq: seq, via, ...flags });
  // Hard bots trust their card counting more than their temperament.
  const temper = S.level === 'hard' ? 0.3 : 1;
  return Math.min(1, q * (1 + (S.persona.suspicion - 1) * temper));
}

/**
 * A one-card actor going after a rival who is about to coup has little to lose by bluffing
 * (easy bots do not see through it). Also what breaks "I steal, you steal back" stalemates.
 */
function isDesperate(S: Situation, act: DeclaredAction, actor: PlayerIntel): boolean {
  if (S.level === 'easy' || actor.hidden > 1 || !act.targetId) return false;
  const target = S.K.players.get(act.targetId);
  if (!target || target.coins < COUP_COST) return false;
  // Killing a one-card rival, or stealing them back below coup range.
  if (act.type === 'assassinate') return target.hidden <= 1;
  return act.type === 'steal' && target.coins - 2 < COUP_COST;
}

/** Outcome after the bot challenged and lost: the action goes on. */
function valueAfterWrongChallenge(S: Situation, act: DeclaredAction, effect: number): number {
  if (S.me.hidden <= 1) return 0; // eliminated — already priced into the loss
  const blockable = act.targetId === S.me.id && ACTIONS[act.type].blockableBy === 'target';
  if (!blockable) return effect;
  if (ACTIONS[act.type].blockedBy.some((c) => S.K.ownCounts[c] > 0)) return 0;
  // Down to one card with no real blocker: most likely forced into a Contessa bluff.
  if (act.type === 'assassinate') return -selfLoss(S, 1) * 0.75;
  return effect * 0.85;
}

/** Outcome after the bot's bluffed block got caught: the action resolves. */
function valueAfterCaughtBlock(S: Situation, act: DeclaredAction, effect: number): number {
  if (S.me.hidden <= 1) return 0;
  if (act.type === 'assassinate' && act.targetId === S.me.id) return -selfLoss(S, 1);
  return effect;
}

/**
 * Minimum edge a challenge needs over passing. The bot alone bears the risk of a challenge while
 * every opponent shares the gain, so claims that barely touch the bot are left alone.
 */
function challengeMargin(S: Situation, act: DeclaredAction, effect: number): number {
  let m = S.tune.challengeMargin - stalematePressure(S);
  if (act.targetId === S.me.id || S.K.opponents.length <= 1) return m;
  if (act.targetId) m += 0.06; // the victim is more motivated to call it
  const stakes = Math.min(1, Math.abs(effect) / 0.3);
  return m + 0.12 * (1 - stakes);
}

/**
 * Nobody has lost a card for several rounds (e.g. players stealing back and forth): calling
 * claims gets more attractive the longer it lasts, so a bot-only table can never loop forever.
 */
function stalematePressure(S: Situation): number {
  const excess = S.K.quietTurns - 4 * roundLength(S.K);
  return excess > 0 ? Math.min(0.6, 0.04 * excess) : 0;
}

/** What the blocked actor loses if the bot's block stands. */
function blockStakes(S: Situation, act: DeclaredAction): Record<string, number> {
  let stake = act.type === 'steal' ? 0.3 : 0.2;
  // A caught Contessa bluff costs the bot a second card to the assassination itself.
  if (act.type === 'assassinate') stake = botLossForOpponent(S, S.me.hidden - 1);
  return { [act.actorId]: stake };
}

function wantsToBluffBlock(S: Situation): boolean {
  const willing = S.persona.bluffRate * S.tune.bluffScale * S.persona.aggression * 1.6;
  return S.rand() < Math.min(0.9, willing);
}

export function respondToAction(S: Situation, prompt: RespondActionPrompt): Move {
  const act = pendingAction(S.view);
  if (!act) return PASS;
  const actor = S.K.players.get(act.actorId);
  const targetMe = act.targetId === S.me.id;
  const effect = effectValue(S, act);
  const L = selfLoss(S);
  const lethal = targetMe && act.type === 'assassinate' && S.me.hidden <= 1;
  const options: Scored[] = [];

  if (prompt.canChallenge && act.claim && actor) {
    if (isCertainBluff(S.K, actor.id, act.claim, S.depth) && S.rand() < S.tune.catchImpossibleRate) return CHALLENGE;
  }

  // A real Contessa against an assassination is always the answer.
  const assassinated = targetMe && act.type === 'assassinate';
  if (assassinated && S.K.ownCounts.contessa > 0 && prompt.blockCharacters.includes('contessa')) {
    return { type: 'block', character: 'contessa' };
  }

  if (prompt.canChallenge && act.claim && actor) {
    const q = bluffProbability(S, actor, act.claim, 'action', { desperate: isDesperate(S, act, actor) });
    const afterWrong = valueAfterWrongChallenge(S, act, effect);
    const value = q * oppLossGain(S, actor) + (1 - q) * (-L + afterWrong) - challengeMargin(S, act, effect);
    options.push({ move: CHALLENGE, value: value + noise(S) });
  }

  for (const ch of prompt.blockCharacters) {
    const move: Move = { type: 'block', character: ch };
    if (S.K.ownCounts[ch] > 0) {
      if (effect >= -0.01 || S.rand() >= S.tune.realBlockRate) continue;
      options.push({ move, value: 0.05 });
      continue;
    }
    // Never bluff a character whose copies are all accounted for.
    if (S.K.unseen[ch] <= 0) continue;
    if (!lethal) {
      if (effect >= -0.01) continue;
      if (S.K.unseen[ch] < 2 && S.level !== 'hard') continue;
      // With one card left a caught bluff is elimination: only hard bots, and only when safe.
      if (S.me.hidden <= 1 && S.level !== 'hard') continue;
      if (!wantsToBluffBlock(S)) continue;
    }
    const stakes = blockStakes(S, act);
    const pb = challengeRisk(S, ch, { via: 'block', stakes, involved: act.actorId, forced: lethal });
    if (!lethal && S.me.hidden <= 1 && pb >= 0.1) continue;
    const value = pb * (-L + valueAfterCaughtBlock(S, act, effect));
    options.push({ move, value: value + noise(S) });
  }

  if (lethal) {
    // Passing is certain elimination: fight with the better of challenge / Contessa bluff.
    if (options.length > 0 && S.rand() >= S.tune.givesUpRate) return best(options);
    return PASS;
  }
  options.push({ move: PASS, value: effect });
  return best(options);
}

/** Value for the bot when a block turns out to be a bluff: blocker loses a card, then the action resolves. */
function valueIfBlockFails(S: Situation, act: DeclaredAction, blocker: PlayerIntel): number {
  const caught = oppLossGain(S, blocker);
  if (act.type === 'assassinate') {
    return caught + (blocker.hidden >= 2 ? oppLossGain(S, blocker, blocker.hidden - 1) : 0);
  }
  return caught + effectValue(S, act);
}

export function respondToBlock(S: Situation): Move {
  const act = pendingAction(S.view);
  const blk = pendingBlock(S.view);
  if (!act || !blk) return PASS;
  const blocker = S.K.players.get(blk.blockerId);
  if (!blocker || blocker.id === S.me.id) return PASS;

  if (isCertainBluff(S.K, blocker.id, blk.character, S.depth) && S.rand() < S.tune.catchImpossibleRate) {
    return CHALLENGE;
  }

  // A one-card target blocking an assassination would claim Contessa whatever it holds.
  const forced = act.type === 'assassinate' && act.targetId === blocker.id && blocker.hidden <= 1;
  const q = bluffProbability(S, blocker, blk.character, 'block', { forced: forced && S.level !== 'easy' });
  const L = selfLoss(S);
  let margin = S.tune.challengeMargin - stalematePressure(S);
  if (act.actorId !== S.me.id) margin += 0.08; // the blocked actor usually calls it
  const value = q * valueIfBlockFails(S, act, blocker) + (1 - q) * -L - margin;
  return value + noise(S) > 0 ? CHALLENGE : PASS;
}
