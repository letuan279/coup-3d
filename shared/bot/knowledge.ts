/**
 * What a bot knows: card counting from its own seat plus a claim history per player rebuilt
 * from the public log. Everything is derived from a GameView, so the bot stays stateless.
 */
import { CARDS_PER_CHARACTER } from '../constants';
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
  /** Turn on which this player last proved each character (card went back to the deck). */
  provenTurn: Partial<Record<Character, number>>;
  /** Every block this player made (behaviour — survives hand changes). */
  blocks: { action: ActionType; turn: number }[];
  /** Turn of this player's latest declared action of each type. */
  lastActionTurn: Partial<Record<ActionType, number>>;
}

export interface Knowledge {
  selfId: string;
  /** The bot's own known cards (hidden hand, or hand + drawn during its exchange). */
  own: Character[];
  ownCounts: CharCounts;
  /** Face-up cards on the table. */
  revealed: CharCounts;
  revealedTotal: number;
  /** Copies the bot cannot see anywhere: 3 − revealed − own. */
  unseen: CharCounts;
  /** Cards the bot cannot see: deck + other players' hidden cards. */
  pool: number;
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
}

function dropClaims(p: PlayerIntel, c: Character): void {
  p.claims = p.claims.filter((r) => r.character !== c);
}

/**
 * Folds the public log into per-player intel. Tolerates truncated or partial logs. Returns the
 * turn of the latest influence loss (or of the oldest logged event when there was none).
 */
function applyLog(log: readonly LoggedEvent[], players: Map<string, PlayerIntel>): number {
  const alive = new Set(players.keys());
  let lastLossTurn = log.length > 0 ? log[0].turn : 0;
  let lastStealAmount: number | null = null;
  const others = (id: string): PlayerIntel[] => {
    const out: PlayerIntel[] = [];
    for (const pid of alive) if (pid !== id) out.push(players.get(pid)!);
    return out;
  };

  for (const ev of log) {
    switch (ev.type) {
      case 'action': {
        lastStealAmount = null;
        const actor = players.get(ev.actorId);
        if (actor) actor.lastActionTurn[ev.action] = ev.turn;
        if (!ev.claim) break;
        actor?.claims.push({ character: ev.claim, seq: ev.seq, turn: ev.turn, via: 'action' });
        for (const o of others(ev.actorId)) o.challengeChances++;
        break;
      }
      case 'block': {
        const blocker = players.get(ev.blockerId);
        blocker?.claims.push({ character: ev.character, seq: ev.seq, turn: ev.turn, via: 'block' });
        blocker?.blocks.push({ action: ev.action, turn: ev.turn });
        for (const o of others(ev.blockerId)) o.challengeChances++;
        break;
      }
      case 'challenge': {
        const c = players.get(ev.challengerId);
        if (c) c.challengesMade++;
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
        if (ev.reason === 'steal') lastStealAmount = ev.amount;
        break;
      }
      case 'action_resolved': {
        // Letting an action through is (soft) evidence of not holding its blockers.
        if (ev.action === 'steal' && ev.targetId && lastStealAmount !== 0) {
          const t = players.get(ev.targetId);
          if (t) {
            t.soft.captain *= 0.55;
            t.soft.ambassador *= 0.55;
          }
        } else if (ev.action === 'assassinate' && ev.targetId) {
          const t = players.get(ev.targetId);
          if (t) t.soft.contessa *= 0.3;
        } else if (ev.action === 'foreign_aid') {
          for (const o of others(ev.actorId)) o.soft.duke *= 0.8;
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
      provenTurn: {},
      blocks: [],
      lastActionTurn: {},
    });
  }
  if (ownOverride) own = ownOverride.slice();

  const lastLossTurn = applyLog(view.log, players);

  const ownCounts = zeroCounts();
  for (const c of own) ownCounts[c]++;
  const unseen = zeroCounts();
  for (const c of CHARACTERS) unseen[c] = Math.max(0, CARDS_PER_CHARACTER - revealed[c] - ownCounts[c]);

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
      provenTurn: {},
      blocks: [],
      lastActionTurn: {},
    };
  }
  const opponents = [...players.values()].filter((p) => p.id !== selfId && p.alive).sort((a, b) => a.seat - b.seat);
  const othersHidden = opponents.reduce((n, p) => n + p.hidden, 0);
  const pool = Math.max(othersHidden, CHARACTERS.length * CARDS_PER_CHARACTER - revealedTotal - own.length);

  const quietTurns = Math.max(0, view.turn - lastLossTurn);
  return {
    selfId,
    own,
    ownCounts,
    revealed,
    revealedTotal,
    unseen,
    pool,
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

/** The claim is impossible: every copy is visible to the bot, or the player was caught lacking it. */
export function isCertainBluff(K: Knowledge, playerId: string, c: Character, depth: BeliefDepth): boolean {
  if (K.unseen[c] <= 0) return true;
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
  if (!p || p.hidden <= 0 || K.unseen[c] <= 0) return 0;
  if (depth.lacks && p.lacks.has(c)) return 0;
  return posteriorFromPrior(pAtLeastOne(K.pool, K.unseen[c], p.hidden), p, c, depth, q);
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
