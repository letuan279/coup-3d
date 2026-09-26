/**
 * What a bot knows: card counting from its own seat plus a claim history per player rebuilt
 * from the public log. Everything is derived from a GameView, so the bot stays stateless.
 */
import { CARDS_PER_CHARACTER, COUP_COST } from '../constants';
import { CHARACTERS } from '../types';
import type { ActionType, Character, GameView, LoggedEvent } from '../types';
import type { BeliefDepth } from './personality';

export type CharCounts = Record<Character, number>;

function zeroCounts(): CharCounts {
  return { duke: 0, assassin: 0, captain: 0, ambassador: 0, contessa: 0 };
}

function oneCounts(): CharCounts {
  return { duke: 1, assassin: 1, captain: 1, ambassador: 1, contessa: 1 };
}

export interface ClaimRecord {
  character: Character;
  seq: number;
  turn: number;
  via: 'action' | 'block';
}

export interface PlayerIntel {
  id: string;
  seat: number;
  coins: number;
  hidden: number;
  alive: boolean;
  revealed: Character[];
  /** Character claims since this player's hand last changed (oldest first). */
  claims: ClaimRecord[];
  /** Caught bluffing these since the last hand change → none of the hidden cards is one of them. */
  lacks: Set<Character>;
  /** Likelihood-ratio multipliers from declined blocks since the last hand change. */
  soft: CharCounts;
  caughtBluffs: number;
  provenClaims: number;
  challengesMade: number;
  wrongChallenges: number;
  /** Challengeable claims by others this player could have challenged. */
  challengeChances: number;
  /**
   * The same, restricted to claims that hit this player directly (aimed at them, blocking them,
   * or heads-up): where a rational player is most tempted to challenge.
   */
  hotChances: number;
  hotChallenges: number;
  /** Turn on which this player last proved each character (card went back to the deck). */
  provenTurn: Partial<Record<Character, number>>;
  /** Every block this player made (behaviour — survives hand changes). */
  blocks: { action: ActionType; turn: number }[];
  /** Blockable actions this player let through when a block was worth making (survives hand changes). */
  declinedBlocks: number;
  /** Turn of this player's latest declared action of each type. */
  lastActionTurn: Partial<Record<ActionType, number>>;
  /**
   * Took Income / Foreign Aid / Steal / Exchange with under 7 coins since the hand last changed,
   * when Tax was there for the taking (anti-coup steals excluded): a public hint of "no Duke".
   */
  declinedTax: boolean;
  /** Contessa blocks of this player's own assassinations / how many of them it challenged. */
  contessaChallengeChances: number;
  contessaChallenges: number;
}

export interface Knowledge {
  selfId: string;
  /** The bot's own known cards (hidden hand, or hand + drawn during its exchange). */
  own: Character[];
  ownCounts: CharCounts;
  /** Face-up cards on the table. */
  revealed: CharCounts;
  revealedTotal: number;
  /**
   * Copies the bot cannot see anywhere: 3 − revealed − own. This is also what the table can reason
   * about publicly; use `inHands` for what opponents can actually hold.
   */
  unseen: CharCounts;
  /** Cards the bot cannot see: deck + other players' hidden cards. */
  pool: number;
  /** Copies the bot itself returned to the deck with its last Exchange, still provably there (private). */
  knownInDeck: CharCounts;
  /** Copies that can be in an opponent's hand: `unseen` − `knownInDeck`. 0 → any claim of it is false. */
  inHands: CharCounts;
  /** Cards the bot cannot place: `pool` minus the known deck cards (what opponents' hands are drawn from). */
  handPool: number;
  players: Map<string, PlayerIntel>;
  self: PlayerIntel;
  /** Living opponents in seat order. */
  opponents: PlayerIntel[];
  turn: number;
  /** Turns since anyone last lost an influence (a stalemate detector). */
  quietTurns: number;
}

function resetHand(p: PlayerIntel): void {
  p.claims = [];
  p.lacks.clear();
  p.soft = oneCounts();
  p.declinedTax = false;
}

function dropClaims(p: PlayerIntel, c: Character): void {
  p.claims = p.claims.filter((r) => r.character !== c);
}

/**
 * Coin balances at the start of `log`: the current balances minus every logged transfer. Exact
 * for a truncated log too, since the retained tail holds every transfer made after its start.
 */
function startingCoins(log: readonly LoggedEvent[], players: Map<string, PlayerIntel>): Map<string, number> {
  const coins = new Map<string, number>();
  for (const p of players.values()) coins.set(p.id, p.coins);
  for (const ev of log) {
    if (ev.type !== 'coins') continue;
    if (coins.has(ev.from)) coins.set(ev.from, coins.get(ev.from)! + ev.amount);
    if (coins.has(ev.to)) coins.set(ev.to, coins.get(ev.to)! - ev.amount);
  }
  return coins;
}

/** Actions a player with a Duke and under 7 coins would rarely pick over Tax. */
const TAX_ALTERNATIVES: ReadonlySet<ActionType> = new Set(['income', 'foreign_aid', 'steal', 'exchange']);

/**
 * Folds the public log into per-player intel. Tolerates truncated or partial logs. Returns the
 * turn of the latest influence loss (or of the oldest logged event when there was none).
 */
function applyLog(log: readonly LoggedEvent[], players: Map<string, PlayerIntel>): number {
  // Alive when the log starts: alive now, or eliminated within the log.
  const alive = new Set<string>();
  for (const p of players.values()) if (p.alive) alive.add(p.id);
  for (const ev of log) if (ev.type === 'eliminated' && players.has(ev.playerId)) alive.add(ev.playerId);
  let lastLossTurn = log.length > 0 ? log[0].turn : 0;
  /** Coins the target of the pending steal had when it was declared. */
  let stealTargetCoins = 0;
  /** Players who blocked the pending action. */
  const blockedThis = new Set<string>();
  /** Who the latest action claim / block claim hit directly (see PlayerIntel.hotChances). */
  let actionHot = new Set<string>();
  let blockHot = new Set<string>();
  /** The player whose action the latest block stopped. */
  let lastBlockActor = '';
  const coins = startingCoins(log, players);
  const coinsOf = (id: string | undefined): number => (id === undefined ? 0 : (coins.get(id) ?? 0));
  const others = (id: string): PlayerIntel[] => {
    const out: PlayerIntel[] = [];
    for (const pid of alive) if (pid !== id) out.push(players.get(pid)!);
    return out;
  };

  for (const ev of log) {
    switch (ev.type) {
      case 'action': {
        stealTargetCoins = ev.action === 'steal' ? coinsOf(ev.targetId) : 0;
        blockedThis.clear();
        const actor = players.get(ev.actorId);
        if (actor) {
          actor.lastActionTurn[ev.action] = ev.turn;
          // Stealing a rival back below coup range is a reason of its own, not a missing Duke.
          const antiCoup = ev.action === 'steal' && coinsOf(ev.targetId) >= COUP_COST;
          if (TAX_ALTERNATIVES.has(ev.action) && coinsOf(ev.actorId) < COUP_COST && !antiCoup) {
            actor.declinedTax = true;
          }
        }
        if (!ev.claim) break;
        actor?.claims.push({ character: ev.claim, seq: ev.seq, turn: ev.turn, via: 'action' });
        actionHot = new Set();
        for (const o of others(ev.actorId)) {
          o.challengeChances++;
          if (alive.size <= 2 || ev.targetId === o.id) {
            o.hotChances++;
            actionHot.add(o.id);
          }
        }
        break;
      }
      case 'block': {
        const blocker = players.get(ev.blockerId);
        blocker?.claims.push({ character: ev.character, seq: ev.seq, turn: ev.turn, via: 'block' });
        blocker?.blocks.push({ action: ev.action, turn: ev.turn });
        blockedThis.add(ev.blockerId);
        blockHot = new Set();
        lastBlockActor = ev.actorId;
        for (const o of others(ev.blockerId)) {
          o.challengeChances++;
          if (ev.character === 'contessa' && ev.actorId === o.id) o.contessaChallengeChances++;
          if (alive.size <= 2 || ev.actorId === o.id) {
            o.hotChances++;
            blockHot.add(o.id);
          }
        }
        break;
      }
      case 'challenge': {
        const c = players.get(ev.challengerId);
        if (c) {
          c.challengesMade++;
          if ((ev.against === 'block' ? blockHot : actionHot).has(c.id)) c.hotChallenges++;
          if (ev.against === 'block' && ev.character === 'contessa' && lastBlockActor === c.id) c.contessaChallenges++;
        }
        break;
      }
      case 'challenge_result': {
        const challenged = players.get(ev.challengedId);
        const challenger = players.get(ev.challengerId);
        if (ev.challengedHadCard) {
          if (challenged) challenged.provenClaims++;
          if (challenger) challenger.wrongChallenges++;
        } else if (challenged) {
          challenged.caughtBluffs++;
          challenged.lacks.add(ev.character);
          dropClaims(challenged, ev.character);
        }
        break;
      }
      case 'card_replaced': {
        // The proven card went back into the deck; the replacement is unknown.
        const p = players.get(ev.playerId);
        if (!p) break;
        dropClaims(p, ev.character);
        p.lacks.clear();
        p.soft = oneCounts();
        p.declinedTax = false;
        p.provenTurn[ev.character] = ev.turn;
        break;
      }
      case 'influence_lost': {
        lastLossTurn = ev.turn;
        // The revealed card explains earlier claims of that character.
        const p = players.get(ev.playerId);
        if (p) dropClaims(p, ev.character);
        break;
      }
      case 'exchange_done': {
        const p = players.get(ev.playerId);
        if (p) resetHand(p);
        break;
      }
      case 'coins': {
        if (coins.has(ev.from)) coins.set(ev.from, coins.get(ev.from)! - ev.amount);
        if (coins.has(ev.to)) coins.set(ev.to, coins.get(ev.to)! + ev.amount);
        break;
      }
      case 'action_resolved': {
        // Letting an action through is (soft) evidence of not holding its blockers — but nobody
        // bothers to block a steal that takes nothing (and one coin is barely worth a block).
        if (ev.action === 'steal') {
          const t = ev.targetId ? players.get(ev.targetId) : undefined;
          const f = stealTargetCoins >= 2 ? 0.55 : stealTargetCoins === 1 ? 0.8 : 1;
          if (t) {
            t.soft.captain *= f;
            t.soft.ambassador *= f;
            if (stealTargetCoins >= 2 && !blockedThis.has(t.id)) t.declinedBlocks++;
          }
        } else if (ev.action === 'assassinate' && ev.targetId) {
          const t = players.get(ev.targetId);
          if (t) {
            t.soft.contessa *= 0.3;
            if (!blockedThis.has(t.id)) t.declinedBlocks++;
          }
        } else if (ev.action === 'foreign_aid') {
          for (const o of others(ev.actorId)) {
            o.soft.duke *= 0.8;
            if (!blockedThis.has(o.id)) o.declinedBlocks++;
          }
        }
        break;
      }
      case 'eliminated': {
        alive.delete(ev.playerId);
        break;
      }
      default:
        break;
    }
  }
  return lastLossTurn;
}

/**
 * Build the bot's knowledge. `ownOverride` replaces the hidden hand (used during an exchange,
 * where the bot also sees the two drawn cards).
 */
export function buildKnowledge(view: GameView, ownOverride?: readonly Character[]): Knowledge {
  const selfId = view.viewerId ?? '';
  const players = new Map<string, PlayerIntel>();
  const revealed = zeroCounts();
  let revealedTotal = 0;
  let own: Character[] = [];

  for (const p of view.players) {
    const rev: Character[] = [];
    for (const inf of p.influences) {
      if (inf.revealed && inf.character) {
        rev.push(inf.character);
        revealed[inf.character]++;
        revealedTotal++;
      } else if (!inf.revealed && p.id === selfId && inf.character) {
        own.push(inf.character);
      }
    }
    players.set(p.id, {
      id: p.id,
      seat: p.seat,
      coins: p.coins,
      hidden: p.hiddenCount,
      alive: !p.eliminated && p.hiddenCount > 0,
      revealed: rev,
      claims: [],
      lacks: new Set(),
      soft: oneCounts(),
      caughtBluffs: 0,
      provenClaims: 0,
      challengesMade: 0,
      wrongChallenges: 0,
      challengeChances: 0,
      hotChances: 0,
      hotChallenges: 0,
      provenTurn: {},
      blocks: [],
      declinedBlocks: 0,
      lastActionTurn: {},
      declinedTax: false,
      contessaChallengeChances: 0,
      contessaChallenges: 0,
    });
  }
  if (ownOverride) own = ownOverride.slice();

  const lastLossTurn = applyLog(view.log, players);

  const ownCounts = zeroCounts();
  for (const c of own) ownCounts[c]++;
  const unseen = zeroCounts();
  for (const c of CHARACTERS) unseen[c] = Math.max(0, CARDS_PER_CHARACTER - revealed[c] - ownCounts[c]);
  // Private memory from the bot's own last Exchange (cleared by the engine on any later draw).
  const knownInDeck = zeroCounts();
  for (const c of view.knownInDeck ?? []) if ((CHARACTERS as readonly string[]).includes(c)) knownInDeck[c]++;
  const inHands = zeroCounts();
  let knownTotal = 0;
  for (const c of CHARACTERS) {
    knownInDeck[c] = Math.min(knownInDeck[c], unseen[c]);
    knownTotal += knownInDeck[c];
    inHands[c] = unseen[c] - knownInDeck[c];
  }

  let self = players.get(selfId);
  if (!self) {
    // Defensive: a view without the viewer seat. Treat the bot as a detached observer.
    self = {
      id: selfId,
      seat: -1,
      coins: 0,
      hidden: own.length,
      alive: true,
      revealed: [],
      claims: [],
      lacks: new Set(),
      soft: oneCounts(),
      caughtBluffs: 0,
      provenClaims: 0,
      challengesMade: 0,
      wrongChallenges: 0,
      challengeChances: 0,
      hotChances: 0,
      hotChallenges: 0,
      provenTurn: {},
      blocks: [],
      declinedBlocks: 0,
      lastActionTurn: {},
      declinedTax: false,
      contessaChallengeChances: 0,
      contessaChallenges: 0,
    };
  }
  const opponents = [...players.values()].filter((p) => p.id !== selfId && p.alive).sort((a, b) => a.seat - b.seat);
  const othersHidden = opponents.reduce((n, p) => n + p.hidden, 0);
  const pool = Math.max(othersHidden, CHARACTERS.length * CARDS_PER_CHARACTER - revealedTotal - own.length);
  const handPool = Math.max(othersHidden, pool - knownTotal);

  const quietTurns = Math.max(0, view.turn - lastLossTurn);
  return {
    selfId,
    own,
    ownCounts,
    revealed,
    revealedTotal,
    unseen,
    pool,
    knownInDeck,
    inHands,
    handPool,
    players,
    self,
    opponents,
    turn: view.turn,
    quietTurns,
  };
}

// ───────────────────────────── Probability ─────────────────────────────

/** P(at least one success) drawing `draws` cards without replacement from `pool` cards holding `copies` successes. */
export function pAtLeastOne(pool: number, copies: number, draws: number): number {
  if (copies <= 0 || draws <= 0 || pool <= 0) return 0;
  if (copies >= pool || draws > pool - copies) return 1;
  let none = 1;
  for (let i = 0; i < draws; i++) none *= (pool - copies - i) / (pool - i);
  return 1 - none;
}

/**
 * Likelihood ratios of a fresh claim, as [claimant holds 2+ cards, claimant holds 1 card].
 * Calibrated on self-play: the Duke is the favourite bluff, blocks are bluffed far more often
 * than actions, and a player down to one card (a caught bluff is elimination) rarely bluffs.
 */
const ACTION_CLAIM_LR: Record<Character, readonly [number, number]> = {
  duke: [2.2, 12],
  assassin: [25, 25],
  captain: [10, 18],
  ambassador: [10, 9],
  contessa: [2, 6],
};
const BLOCK_CLAIM_LR: Record<Character, readonly [number, number]> = {
  duke: [1.8, 8],
  assassin: [1, 1],
  captain: [2.3, 6],
  ambassador: [2.2, 5],
  contessa: [3, 6],
};

/** Full-history readers (hard) know how rarely a player on their last card dares to bluff. */
const LAST_CARD_SHARPNESS = 1.8;

/**
 * Likelihood ratio of the claim currently being made. A forced claim (nothing to lose) says
 * almost nothing, and neither does a desperate one (one card left, trying to stop a rival who
 * is about to coup).
 */
function currentClaimLr(c: Character, hidden: number, q: HoldQuery, depth: BeliefDepth): number {
  if (q.forced) return 1.2;
  if (q.desperate) return 2.5;
  const [many, one] = (q.via === 'block' ? BLOCK_CLAIM_LR : ACTION_CLAIM_LR)[c];
  if (hidden > 1) return many;
  return depth.history ? one * LAST_CARD_SHARPNESS : one;
}
/** Odds multiplier on holding a Duke for a player who declined Tax with the current hand. */
const DECLINED_TAX_DUKE = 0.4;
const FIRST_PAST_CLAIM_LR = 1.7;
const REPEAT_CLAIM_LR = 1.3;
/** Repeated unchallenged claims never make a bot fully sure — bluffers exist. */
const MAX_CLAIM_BELIEF = 0.92;

function honestyFactor(p: PlayerIntel): number {
  const f = (1 + 0.15 * Math.min(p.provenClaims, 3)) / (1 + 0.5 * p.caughtBluffs);
  return Math.min(1.4, Math.max(0.3, f));
}

/** Claims recorded before `beforeSeq` (the claim being judged is excluded from its own evidence). */
function pastClaims(p: PlayerIntel, beforeSeq = Infinity): ClaimRecord[] {
  return p.claims.filter((r) => r.seq < beforeSeq);
}

export function hasClaimed(p: PlayerIntel, c: Character): boolean {
  return p.claims.some((r) => r.character === c);
}

/**
 * The claim is impossible: every copy is visible to the bot or known to be in the deck, or the
 * player was caught lacking it.
 */
export function isCertainBluff(K: Knowledge, playerId: string, c: Character, depth: BeliefDepth): boolean {
  if (K.inHands[c] <= 0) return true;
  const p = K.players.get(playerId);
  return !!p && depth.lacks && p.lacks.has(c);
}

export interface HoldQuery {
  /** The player is claiming `c` right now (the claim itself is evidence). */
  claiming?: boolean;
  /** Log seq of the claim being judged; only earlier claims count as history. */
  claimSeq?: number;
  /** Kind of the current claim (default 'action'). */
  via?: 'action' | 'block';
  /** The claimant had nothing to lose by bluffing (e.g. one card left, facing an assassination). */
  forced?: boolean;
  /** A one-card claimant going after a rival who is about to coup. */
  desperate?: boolean;
}

/**
 * Updates a card-counting prior with `p`'s claim history (as far as `depth` allows). Shared by
 * the bot's own beliefs and by its model of what opponents believe about the bot.
 */
export function posteriorFromPrior(
  prior: number,
  p: PlayerIntel,
  c: Character,
  depth: BeliefDepth,
  q: HoldQuery = {},
): number {
  if (prior <= 0) return 0;
  if (prior >= 1) return 1;
  let odds = prior / (1 - prior);
  const past = depth.claims ? pastClaims(p, q.claimSeq) : [];
  const same = past.reduce((n, r) => n + (r.character === c ? 1 : 0), 0);

  let lr = q.claiming ? currentClaimLr(c, p.hidden, q, depth) : 1;
  if (same > 0) lr *= FIRST_PAST_CLAIM_LR * REPEAT_CLAIM_LR ** Math.min(same - 1, 4);
  if (depth.history && lr > 1) lr = 1 + (lr - 1) * honestyFactor(p);
  odds *= lr;

  if (depth.soft) odds *= p.soft[c];
  // Took something else over Tax with this hand: most players holding a Duke would have taxed.
  if (depth.soft && c === 'duke' && p.declinedTax) odds *= DECLINED_TAX_DUKE;

  if (depth.inconsistency) {
    const distinct = new Set(past.map((r) => r.character));
    if (q.claiming) distinct.add(c);
    if (distinct.size > p.hidden && distinct.has(c)) odds *= (p.hidden / distinct.size) ** 1.5;
  }

  const posterior = odds / (1 + odds);
  if (q.claiming || same > 0) return Math.min(posterior, Math.max(prior, MAX_CLAIM_BELIEF));
  return posterior;
}

/**
 * Belief that `playerId` holds at least one `c` right now: the hypergeometric prior over the
 * cards the bot cannot see, updated by the player's claim history.
 */
export function holdProbability(
  K: Knowledge,
  playerId: string,
  c: Character,
  depth: BeliefDepth,
  q: HoldQuery = {},
): number {
  const p = K.players.get(playerId);
  if (!p || p.hidden <= 0 || K.inHands[c] <= 0) return 0;
  if (depth.lacks && p.lacks.has(c)) return 0;
  return posteriorFromPrior(pAtLeastOne(K.handPool, K.inHands[c], p.hidden), p, c, depth, q);
}

/** P(exactly `k` successes) drawing `draws` from `pool` cards holding `copies` successes. */
export function pExactly(pool: number, copies: number, draws: number, k: number): number {
  if (k < 0 || k > draws || k > copies || draws - k > pool - copies || pool <= 0) return 0;
  return (choose(copies, k) * choose(pool - copies, draws - k)) / choose(pool, draws);
}

function choose(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  let r = 1;
  for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
  return r;
}

/** Observed willingness to challenge, shrunk towards a low prior (most players rarely challenge). */
export function challengeTendency(p: PlayerIntel): number {
  return (p.challengesMade + 0.2) / (p.challengeChances + 6);
}

/** Observed willingness to challenge claims that hit the player directly, shrunk towards `prior`. */
export function hotChallengeTendency(p: PlayerIntel, prior: number): number {
  return (p.hotChallenges + 2 * prior) / (p.hotChances + 2);
}

/** Share of players who block whatever they hold, before seeing any of their blocks. */
const HABIT_PRIOR = 0.1;
/** How often a typical two-card player really holds a blocker for each blockable action. */
const TYPICAL_BLOCK: Partial<Record<ActionType, number>> = { steal: 0.6, assassinate: 0.4, foreign_aid: 0.4 };

/**
 * Probability that `p` is an "always block" player — one whose blocks say nothing about their
 * cards. Blocking several different kinds of action without ever letting one through is what
 * gives it away (a real blocker only covers what its two cards cover). Declining a single
 * worthwhile block rules it out.
 */
export function blockHabit(p: PlayerIntel): number {
  if (p.declinedBlocks > 0) return 0;
  const kinds = new Set(p.blocks.map((b) => b.action));
  if (kinds.size < 2) return 0;
  let odds = HABIT_PRIOR / (1 - HABIT_PRIOR);
  for (const k of kinds) odds /= TYPICAL_BLOCK[k] ?? 1;
  odds *= 1.15 ** Math.min(4, p.blocks.length - kinds.size);
  return odds / (1 + odds);
}

/** Blocks of `action` that `p` made within the last `turns` turns. */
export function recentBlocks(K: Knowledge, p: PlayerIntel, action: ActionType, turns: number): number {
  return p.blocks.reduce((n, b) => n + (b.action === action && K.turn - b.turn <= turns ? 1 : 0), 0);
}

/** How many turns make one round of the table right now. */
export function roundLength(K: Knowledge): number {
  return K.opponents.length + 1;
}

/** Opponents who proved `c` within the last `turns` turns. */
export function recentlyProvenByOthers(K: Knowledge, c: Character, turns: number): boolean {
  for (const p of K.players.values()) {
    if (p.id === K.selfId) continue;
    const t = p.provenTurn[c];
    if (t !== undefined && K.turn - t <= turns) return true;
  }
  return false;
}
