/**
 * Choosing the bot's own action: coup when rich, then the strong honest plays (Assassin, Duke),
 * then a personality-driven bluff competing with the weaker honest plays (steal, exchange,
 * foreign aid / income).
 */
import { ACTIONS, COUP_COST } from '../constants';
import type { ActionOption, ActionType, Character, Move, Prompt } from '../types';
import { hasClaimed, holdProbability, recentBlocks, recentlyProvenByOthers, roundLength } from './knowledge';
import { challengeRisk, opponentCardCost } from './risk';
import { pickRandom } from './situation';
import type { Situation } from './situation';
import { assassinTarget, coupTarget, stealTarget } from './targeting';
import { oppLossGain, pBlockBy, pTargetsMe, selfCoinValue, selfLoss, threatMult } from './value';

type ChooseActionPrompt = Extract<Prompt, { kind: 'choose_action' }>;
type Options = Map<ActionType, ActionOption>;

interface Candidate {
  move: Move;
  value: number;
  character?: Character;
  risk: number;
}

function act(action: ActionType, targetId?: string): Move {
  return targetId === undefined ? { type: 'action', action } : { type: 'action', action, targetId };
}

function owns(S: Situation, c: Character): boolean {
  return S.K.ownCounts[c] > 0;
}

/** Claims the bot could not back up and that are impossible (every copy visible) are never made. */
function impossibleClaim(S: Situation, option: ActionOption): boolean {
  return !!option.claim && !owns(S, option.claim) && S.K.unseen[option.claim] <= 0;
}

/**
 * A "mistake" (mostly easy bots): a random enabled action with a random target. Bluffed claims
 * are only sometimes in the pool (never on the last card above easy), impossible ones never.
 */
function randomAction(S: Situation, opts: Options): Move | null {
  const allowBluff = S.rand() < 0.3 && (S.level === 'easy' || S.me.hidden > 1);
  const pool: Move[] = [];
  for (const o of opts.values()) {
    if (impossibleClaim(S, o)) continue;
    if (o.claim && !owns(S, o.claim) && !allowBluff) continue;
    if (!ACTIONS[o.action].needsTarget) {
      pool.push(act(o.action));
      continue;
    }
    let targets = o.targets;
    if (o.action === 'steal') targets = targets.filter((id) => (S.K.players.get(id)?.coins ?? 0) > 0);
    if (targets.length > 0) pool.push(act(o.action, pickRandom(S, targets)));
  }
  return pool.length > 0 ? pickRandom(S, pool) : null;
}

/** Hard bots save coins by assassinating a one-card target that is unlikely to hold Contessa. */
function cheapFinish(S: Situation, opts: Options): Move | null {
  const o = opts.get('assassinate');
  if (!o || !owns(S, 'assassin')) return null;
  let bestId: string | null = null;
  let bestThreat = -Infinity;
  for (const id of o.targets) {
    const p = S.K.players.get(id);
    if (!p || p.hidden !== 1) continue;
    if (holdProbability(S.K, id, 'contessa', S.depth) >= 0.3) continue;
    const t = S.threat.get(id) ?? 0;
    if (t > bestThreat) {
      bestThreat = t;
      bestId = id;
    }
  }
  return bestId && S.rand() < 0.8 ? act('assassinate', bestId) : null;
}

/**
 * Down to one card with a rival in coup range who will likely finish the bot next turn: make
 * the play that can still stop it — assassinate a one-card rival, or steal it below coup
 * range — bluffing if necessary (nothing is left to lose).
 */
function desperateMove(S: Situation, opts: Options): Move | null {
  if (S.level === 'easy' || S.me.hidden > 1) return null;
  const threats = S.K.opponents.filter((o) => o.coins >= COUP_COST && pTargetsMe(S, o) >= 0.6);
  if (threats.length !== 1) return null;
  const rival = threats[0];
  const canClaim = (c: Character): boolean => owns(S, c) || S.K.unseen[c] > 0;
  const assassinate = opts.get('assassinate');
  if (assassinate?.targets.includes(rival.id) && rival.hidden === 1 && canClaim('assassin')) {
    return act('assassinate', rival.id);
  }
  const steal = opts.get('steal');
  if (steal?.targets.includes(rival.id) && rival.coins - 2 < COUP_COST && canClaim('captain')) {
    return act('steal', rival.id);
  }
  return null;
}

/** Exchanging again right after an exchange only burns a turn. */
function exchangedLastTurn(S: Situation): boolean {
  const last = S.me.lastActionTurn.exchange;
  return last !== undefined && S.K.turn - last <= roundLength(S.K);
}

/** A hand where the Ambassador has nothing better to work with. */
function handIsWeak(S: Situation): boolean {
  const rest = S.K.own.slice();
  const i = rest.indexOf('ambassador');
  if (i >= 0) rest.splice(i, 1);
  return rest.every((c) => c === 'ambassador' || c === 'contessa');
}

/**
 * Chance that someone blocks foreign aid with a Duke. Easy bots only look at Duke claims;
 * the others count cards too (early on somebody usually holds a Duke, and a Duke block is a
 * cheap bluff that rarely gets challenged).
 */
function foreignAidBlockChance(S: Situation): number {
  if (S.K.inHands.duke <= 0) return 0.03;
  let none = 1;
  for (const o of S.K.opponents) {
    const claimedDuke = S.depth.claims && hasClaimed(o, 'duke') && !o.lacks.has('duke');
    const habit = S.level !== 'easy' && recentBlocks(S.K, o, 'foreign_aid', 2 * roundLength(S.K)) > 0;
    let p: number;
    if (habit) p = 0.9;
    else if (S.level === 'easy') p = claimedDuke ? 0.85 : 0.1;
    else p = pBlockBy(S, o, ['duke'], o.hidden >= 2 ? 0.12 : 0.03);
    none *= 1 - p;
  }
  return 1 - none;
}

function economy(S: Situation, opts: Options): Candidate {
  const coins = S.me.coins;
  const income: Candidate = { move: act('income'), value: selfCoinValue(coins, 1), risk: 0 };
  if (!opts.has('foreign_aid')) return income;
  const pBlock = foreignAidBlockChance(S);
  const fa: Candidate = { move: act('foreign_aid'), value: (1 - pBlock) * selfCoinValue(coins, 2), risk: 0 };
  if (S.level === 'easy') return S.rand() < 0.5 ? fa : income;
  return pBlock < 0.5 && fa.value >= income.value ? fa : income;
}

/** What each opponent loses if the bot's claimed action stands (drives their urge to challenge). */
function actionStakes(S: Situation, action: ActionType, targetId: string | undefined): Record<string, number> {
  const duel = S.K.opponents.length === 1;
  const stakes: Record<string, number> = {};
  for (const o of S.K.opponents) {
    let v = 0;
    if (action === 'tax') {
      v = 0.21 * (duel ? 1.5 : 1);
      if (S.me.coins < COUP_COST && S.me.coins + 3 >= COUP_COST) v += 0.25;
    } else if (action === 'steal') {
      v = o.id === targetId ? 0.3 : 0.07;
    } else if (action === 'assassinate') {
      v = o.id === targetId ? opponentCardCost(S, o) : 0;
    } else {
      v = 0.05;
    }
    stakes[o.id] = v;
  }
  return stakes;
}

/** What the bluffed action would be worth if nobody challenged it (null: not worth trying). */
function bluffGain(S: Situation, action: ActionType, option: ActionOption): { gain: number; targetId?: string } | null {
  switch (action) {
    case 'tax':
      return { gain: selfCoinValue(S.me.coins, 3) };
    case 'exchange':
      // Only worth pretending when the hand really needs new cards.
      return exchangedLastTurn(S) || !handIsWeak(S) ? null : { gain: 0.15 };
    case 'steal': {
      const t = stealTarget(S, option.targets);
      if (!t || t.player.coins < 2) return null;
      return { gain: (1 - t.pBlock) * (selfCoinValue(S.me.coins, 2) + 0.1 * threatMult(S, t.player)), targetId: t.id };
    }
    case 'assassinate': {
      const t = assassinTarget(S, option.targets);
      if (!t) return null;
      return { gain: (1 - t.pBlock) * oppLossGain(S, t.player) - 0.3, targetId: t.id };
    }
    default:
      return null;
  }
}

/** Best bluffed claim available right now, valued with the risk of being called. */
function bestBluff(S: Situation, opts: Options): Candidate | null {
  const L = selfLoss(S);
  let top: Candidate | null = null;

  for (const action of ['tax', 'steal', 'assassinate', 'exchange'] as const) {
    const o = opts.get(action);
    const c = o?.claim;
    if (!o || !c || owns(S, c)) continue;
    // Only bluff characters with plenty of unseen copies.
    if (S.K.unseen[c] < 2) continue;
    const g = bluffGain(S, action, o);
    if (!g) continue;

    const risk = challengeRisk(S, c, { via: 'action', stakes: actionStakes(S, action, g.targetId) });
    let value = (1 - risk) * g.gain - risk * L;
    if (recentlyProvenByOthers(S.K, c, roundLength(S.K))) value -= 0.05;
    if (hasClaimed(S.me, c)) value += 0.06; // keep the story consistent
    if (!top || value > top.value) top = { move: act(action, g.targetId), value, character: c, risk };
  }
  return top;
}

/** A bluff may be slightly worse on paper than the honest play: unpredictability has value. */
const BLUFF_SLACK = 0.08;
/** How much worse than Tax an honest alternative may be when a Duke holder mixes its play. */
const DUKE_MIX_SLACK = 0.12;

function bluffChance(S: Situation, bluff: Candidate): number {
  let p = S.persona.bluffRate * S.tune.bluffScale;
  p *= Math.min(1, Math.max(0.1, 1 - bluff.risk * 1.5));
  // Crowded tables hide a bluff among many claims; heads-up every claim is scrutinised.
  p *= Math.min(1.2, 0.6 + 0.12 * S.K.opponents.length);
  if (bluff.character && hasClaimed(S.me, bluff.character)) p *= 1.3;
  if (S.me.hidden <= 1) {
    // One card left: a caught bluff is elimination.
    p = bluff.risk < S.tune.oneCardBluffRisk ? p * S.tune.oneCardBluff : 0;
  }
  return Math.min(0.9, p);
}

/**
 * The best play without a bluff once the strong honest plays (assassinate, tax) are ruled out:
 * steal with a real Captain, exchange with a real Ambassador, or the economy move.
 */
function bestHonest(S: Situation, opts: Options): Candidate {
  let choice = economy(S, opts);
  const steal = opts.get('steal');
  if (steal && owns(S, 'captain')) {
    const t = stealTarget(S, steal.targets);
    if (t) {
      // A clean steal (2 coins, unlikely to be blocked) beats the economy move outright.
      const clean = t.player.coins >= 2 && t.pBlock < 0.5;
      const value = clean ? Math.max(t.score, choice.value + 0.05) : t.score;
      if (value > choice.value) choice = { move: act('steal', t.id), value, risk: 0 };
    }
  }
  if (opts.has('exchange') && owns(S, 'ambassador') && !exchangedLastTurn(S)) {
    const value = handIsWeak(S) ? Math.max(0.25, choice.value + 0.02) : 0.12;
    if (value > choice.value) choice = { move: act('exchange'), value, risk: 0 };
  }
  return choice;
}

export function chooseAction(S: Situation, prompt: ChooseActionPrompt): Move {
  const opts: Options = new Map();
  for (const o of prompt.options) if (o.enabled) opts.set(o.action, o);
  const coup = opts.get('coup');

  if (prompt.mustCoup && coup && coup.targets.length > 0) return act('coup', coupTarget(S, coup.targets));

  if (S.rand() < S.tune.randomActionRate) {
    const m = randomAction(S, opts);
    if (m) return m;
  }

  if (coup && coup.targets.length > 0 && S.me.coins >= COUP_COST) {
    if (S.level === 'hard') {
      const finish = cheapFinish(S, opts);
      if (finish) return finish;
    }
    if (S.rand() < S.tune.coupRate) return act('coup', coupTarget(S, coup.targets));
  }

  const desperate = desperateMove(S, opts);
  if (desperate) return desperate;

  const assassinate = opts.get('assassinate');
  if (assassinate && owns(S, 'assassin')) {
    const t = assassinTarget(S, assassinate.targets);
    if (t && t.pBlock < 0.6) return act('assassinate', t.id);
  }
  const honest = bestHonest(S, opts);
  if (opts.has('tax') && owns(S, 'duke')) {
    // Always taxing with a Duke would make every other action a public "no Duke" tell: now and
    // then take an honest alternative that is nearly as good.
    const tax = selfCoinValue(S.me.coins, 3);
    if (honest.value >= tax - DUKE_MIX_SLACK && S.rand() < S.tune.dukeMixRate) return honest.move;
    return act('tax');
  }

  const bluff = bestBluff(S, opts);
  if (bluff && bluff.value > honest.value - BLUFF_SLACK && S.rand() < bluffChance(S, bluff)) return bluff.move;
  return honest.move;
}
