/**
 * Internal engine helpers: cloning, event logging, seeded randomness, player queries and coin
 * movements. Mutating helpers only ever run on the private clone that applyMove owns.
 *
 * Card objects are treated as immutable values: clones share them, the engine only moves
 * references between hands, the deck and an exchange draw.
 */
import { rngNext, shuffle } from '../rng';
import type {
  Card,
  Character,
  CoinParty,
  CoinReason,
  GameEvent,
  GameState,
  LoggedEvent,
  Phase,
  PlayerState,
} from '../types';

// ───────────── Cloning ─────────────

export function clonePhase(phase: Phase): Phase {
  switch (phase.kind) {
    case 'action_response':
      return {
        ...phase,
        responders: phase.responders.slice(),
        passed: phase.passed.slice(),
        blockers: phase.blockers.slice(),
        blockCharacters: phase.blockCharacters.slice(),
      };
    case 'block_response':
      return { ...phase, responders: phase.responders.slice(), passed: phase.passed.slice() };
    case 'lose_influence':
      return { ...phase, then: { ...phase.then } };
    case 'exchange':
      return { kind: 'exchange', drawn: phase.drawn.slice() };
    default:
      return { ...phase };
  }
}

function clonePlayer(p: PlayerState): PlayerState {
  return { ...p, influences: p.influences.map((inf) => ({ card: inf.card, revealed: inf.revealed })) };
}

function cloneKnownInDeck(known: Record<string, Character[]>): Record<string, Character[]> {
  const out: Record<string, Character[]> = {};
  for (const [id, chars] of Object.entries(known)) out[id] = chars.slice();
  return out;
}

/** Copy every mutable container of the state (logged events and cards are shared, never mutated). */
export function cloneState(s: GameState): GameState {
  return {
    rngState: s.rngState,
    players: s.players.map(clonePlayer),
    deck: s.deck.slice(),
    treasury: s.treasury,
    turn: s.turn,
    actorId: s.actorId,
    pendingAction: s.pendingAction ? { ...s.pendingAction } : null,
    pendingBlock: s.pendingBlock ? { ...s.pendingBlock } : null,
    ...(s.knownInDeck ? { knownInDeck: cloneKnownInDeck(s.knownInDeck) } : {}),
    phase: clonePhase(s.phase),
    phaseSeq: s.phaseSeq,
    log: s.log.slice(),
    nextEventSeq: s.nextEventSeq,
    winnerId: s.winnerId,
  };
}

// ───────────── Events & phases ─────────────

/** Append a public event to the log, stamped with the next sequence number and the current turn. */
export function emit(s: GameState, event: GameEvent): void {
  const logged: LoggedEvent = { ...event, seq: s.nextEventSeq, turn: s.turn };
  s.nextEventSeq += 1;
  s.log.push(logged);
}

/** Every phase change goes through here so phaseSeq always advances. */
export function setPhase(s: GameState, phase: Phase): void {
  s.phase = phase;
  s.phaseSeq += 1;
}

// ───────────── Randomness ─────────────

export function nextRandom(s: GameState): number {
  const [next, value] = rngNext(s.rngState);
  s.rngState = next;
  return value;
}

export function shuffleDeck(s: GameState): void {
  s.deck = shuffle(s.deck, () => nextRandom(s));
}

// ───────────── Player queries ─────────────

export function findPlayer(s: GameState, id: string): PlayerState | undefined {
  return s.players.find((p) => p.id === id);
}

export function getPlayer(s: GameState, id: string): PlayerState {
  const p = findPlayer(s, id);
  if (!p) throw new Error(`engine: unknown player ${id}`);
  return p;
}

export function isAlive(s: GameState, id: string | undefined): boolean {
  if (id === undefined) return false;
  const p = findPlayer(s, id);
  return p !== undefined && !p.eliminated;
}

export function unrevealedSlots(p: PlayerState): number[] {
  const slots: number[] = [];
  p.influences.forEach((inf, slot) => {
    if (!inf.revealed) slots.push(slot);
  });
  return slots;
}

/** First unrevealed slot holding `character`, or -1. */
export function findHiddenSlot(p: PlayerState, character: Character): number {
  return p.influences.findIndex((inf) => !inf.revealed && inf.card.character === character);
}

export function livingPlayers(s: GameState): PlayerState[] {
  return s.players.filter((p) => !p.eliminated);
}

/** Living players other than `fromId`, clockwise (ascending seat, wrapping) starting after `fromId`. */
export function othersInTurnOrder(s: GameState, fromId: string): string[] {
  const n = s.players.length;
  const start = s.players.findIndex((p) => p.id === fromId);
  if (start < 0) throw new Error(`engine: unknown player ${fromId}`);
  const out: string[] = [];
  for (let k = 1; k < n; k++) {
    const p = s.players[(start + k) % n];
    if (!p.eliminated) out.push(p.id);
  }
  return out;
}

// ───────────── Coins ─────────────

function balance(s: GameState, party: CoinParty): number {
  return party === 'treasury' ? s.treasury : getPlayer(s, party).coins;
}

function adjust(s: GameState, party: CoinParty, delta: number): void {
  if (party === 'treasury') s.treasury += delta;
  else getPlayer(s, party).coins += delta;
}

/**
 * Move up to `amount` coins (capped by what `from` holds) and log it. Returns the amount
 * actually moved; nothing is logged when it is 0.
 */
export function transferCoins(
  s: GameState,
  from: CoinParty,
  to: CoinParty,
  amount: number,
  reason: CoinReason,
): number {
  const moved = Math.max(0, Math.min(amount, balance(s, from)));
  if (moved === 0) return 0;
  adjust(s, from, -moved);
  adjust(s, to, moved);
  emit(s, { type: 'coins', from, to, amount: moved, reason });
  return moved;
}

/** All 15 cards currently in play: hands (revealed or not), deck and an in-progress exchange draw. */
export function allCards(s: GameState): Card[] {
  const cards: Card[] = [];
  for (const p of s.players) for (const inf of p.influences) cards.push(inf.card);
  cards.push(...s.deck);
  if (s.phase.kind === 'exchange') cards.push(...s.phase.drawn);
  return cards;
}
