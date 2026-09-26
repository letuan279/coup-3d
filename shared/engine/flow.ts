/**
 * Phase machine (docs/SPEC.md §1.1). Every function mutates the private clone owned by
 * applyMove, logs the public events it causes and leaves the state in its next phase.
 *
 * Event ordering conventions:
 * - `action_resolved` is logged when the action takes effect, right before its effect events
 *   (coins, influence loss, exchange draw). A resolved action whose target was eliminated in
 *   the meantime has no effect but still logs `action_resolved`.
 * - `action_failed` / `action_blocked` are logged as soon as the outcome is known, before the
 *   influence loss that goes with it.
 * - `block` is logged when the block is declared, even when the action_response window stays
 *   open for the other players to challenge the action's claim first (SPEC §1.1).
 */
import { ACTION_GAIN, ACTIONS, EXCHANGE_DRAW } from '../constants';
import type {
  ActionType,
  Card,
  Character,
  CoinReason,
  Continuation,
  DeclaredAction,
  GameState,
  LossReason,
} from '../types';
import {
  emit,
  findHiddenSlot,
  getPlayer,
  isAlive,
  livingPlayers,
  othersInTurnOrder,
  setPhase,
  shuffleDeck,
  transferCoins,
  unrevealedSlots,
} from './state';

function pendingAction(s: GameState): DeclaredAction {
  if (!s.pendingAction) throw new Error('engine: no pending action');
  return s.pendingAction;
}

// ───────────── Turns & game end ─────────────

export function startTurn(s: GameState, playerId: string): void {
  s.actorId = playerId;
  s.pendingAction = null;
  s.pendingBlock = null;
  setPhase(s, { kind: 'turn' });
  emit(s, { type: 'turn_start', playerId, turn: s.turn });
}

/** Ends the game if at most one player is left. Returns true when the game is over. */
function checkGameOver(s: GameState): boolean {
  if (s.phase.kind === 'game_over') return true;
  const alive = livingPlayers(s);
  if (alive.length > 1) return false;
  const winnerId = alive[0]?.id ?? s.actorId;
  s.winnerId = winnerId;
  s.pendingAction = null;
  s.pendingBlock = null;
  setPhase(s, { kind: 'game_over' });
  emit(s, { type: 'game_over', winnerId });
  return true;
}

export function endTurn(s: GameState): void {
  if (checkGameOver(s)) return;
  const [next] = othersInTurnOrder(s, s.actorId);
  s.turn += 1;
  startTurn(s, next ?? s.actorId);
}

// ───────────── Influence loss ─────────────

/** Turn `slot` face up; eliminates the player when it was their last card. Returns true if the game ended. */
function revealInfluence(s: GameState, playerId: string, slot: number, reason: LossReason): boolean {
  const player = getPlayer(s, playerId);
  const influence = player.influences[slot];
  influence.revealed = true;
  emit(s, { type: 'influence_lost', playerId, slot, character: influence.card.character, reason });
  if (unrevealedSlots(player).length === 0) {
    player.eliminated = true;
    emit(s, { type: 'eliminated', playerId });
    transferCoins(s, playerId, 'treasury', player.coins, 'eliminated');
  }
  return checkGameOver(s);
}

/** Start an influence loss: prompt when the player has a choice, auto-reveal their last card otherwise. */
export function loseInfluence(s: GameState, playerId: string, reason: LossReason, then: Continuation): void {
  const slots = unrevealedSlots(getPlayer(s, playerId));
  if (slots.length === 0) {
    runContinuation(s, then);
  } else if (slots.length === 1) {
    if (!revealInfluence(s, playerId, slots[0], reason)) runContinuation(s, then);
  } else {
    setPhase(s, { kind: 'lose_influence', playerId, reason, then });
  }
}

/** The prompted player chose `slot` in the lose_influence phase. */
export function completeLoss(s: GameState, slot: number): void {
  const phase = s.phase;
  if (phase.kind !== 'lose_influence') throw new Error('engine: not losing influence');
  if (!revealInfluence(s, phase.playerId, slot, phase.reason)) runContinuation(s, phase.then);
}

function runContinuation(s: GameState, then: Continuation): void {
  switch (then.kind) {
    case 'end_turn':
      endTurn(s);
      return;
    case 'after_action_proven':
      afterActionProven(s);
      return;
    case 'resolve_action':
      resolveAction(s);
      return;
  }
}

// ───────────── Declaring & resolving actions ─────────────

export function declareAction(s: GameState, actorId: string, type: ActionType, targetId: string | undefined): void {
  const def = ACTIONS[type];
  const action: DeclaredAction = { type, actorId };
  if (targetId !== undefined) action.targetId = targetId;
  if (def.claim) action.claim = def.claim;
  s.pendingAction = action;
  s.pendingBlock = null;
  emit(s, {
    type: 'action',
    actorId,
    action: type,
    ...(targetId !== undefined ? { targetId } : {}),
    ...(def.claim ? { claim: def.claim } : {}),
  });
  if (def.cost > 0) transferCoins(s, actorId, 'treasury', def.cost, costReason(type));

  if (!def.claim && def.blockableBy === null) {
    // Income and coup cannot be challenged or blocked.
    resolveAction(s);
    return;
  }
  const responders = othersInTurnOrder(s, actorId);
  const blockers =
    def.blockableBy === 'anyone' ? responders.slice() : def.blockableBy === 'target' && targetId ? [targetId] : [];
  setPhase(s, {
    kind: 'action_response',
    responders,
    passed: [],
    canChallenge: def.claim !== undefined,
    blockers,
    blockCharacters: blockers.length > 0 ? def.blockedBy.slice() : [],
  });
}

function costReason(type: ActionType): CoinReason {
  return type === 'coup' ? 'coup' : 'assassinate';
}

/**
 * The actor proved their claim: a block declared while the window was still open goes straight
 * to its block_response (the target already chose; no second block window). Otherwise the
 * target gets its block window (even if it had passed before the challenge), or the action resolves.
 */
function afterActionProven(s: GameState): void {
  const action = pendingAction(s);
  const def = ACTIONS[action.type];
  if (s.pendingBlock) {
    if (isAlive(s, s.pendingBlock.blockerId) && isAlive(s, action.actorId)) {
      openBlockResponse(s);
      return;
    }
    // Not reachable with the current rules (nothing can eliminate the blocker or the proven
    // actor here) — the block is moot, fall through.
    s.pendingBlock = null;
  }
  if (def.blockableBy === 'target' && isAlive(s, action.targetId) && isAlive(s, action.actorId)) {
    const targetId = action.targetId as string;
    setPhase(s, {
      kind: 'action_response',
      responders: [targetId],
      passed: [],
      canChallenge: false,
      blockers: [targetId],
      blockCharacters: def.blockedBy.slice(),
    });
    return;
  }
  resolveAction(s);
}

/** Perform the pending action's effect (no block, or the block failed). */
export function resolveAction(s: GameState): void {
  const action = pendingAction(s);
  s.pendingBlock = null;
  if (!isAlive(s, action.actorId)) {
    emit(s, { type: 'action_failed', actorId: action.actorId, action: action.type });
    endTurn(s);
    return;
  }
  emit(s, {
    type: 'action_resolved',
    actorId: action.actorId,
    action: action.type,
    ...(action.targetId !== undefined ? { targetId: action.targetId } : {}),
  });
  const targetAlive = isAlive(s, action.targetId);
  switch (action.type) {
    case 'income':
    case 'foreign_aid':
    case 'tax':
      transferCoins(s, 'treasury', action.actorId, ACTION_GAIN[action.type], action.type);
      endTurn(s);
      return;
    case 'steal':
      if (targetAlive) transferCoins(s, action.targetId as string, action.actorId, ACTION_GAIN.steal, 'steal');
      endTurn(s);
      return;
    case 'coup':
    case 'assassinate':
      if (targetAlive) loseInfluence(s, action.targetId as string, action.type, { kind: 'end_turn' });
      else endTurn(s);
      return;
    case 'exchange':
      beginExchange(s, action.actorId);
      return;
  }
}

// ───────────── Responses ─────────────

export function passResponse(s: GameState, playerId: string): void {
  const phase = s.phase;
  if (phase.kind !== 'action_response' && phase.kind !== 'block_response') {
    throw new Error('engine: nothing to pass on');
  }
  phase.passed.push(playerId);
  emit(s, { type: 'pass', playerId });
  if (!allResponded(phase)) return;
  if (phase.kind === 'action_response') {
    // Nobody challenged the action: a block declared while the window was open now gets its
    // own challenge window; otherwise the action takes effect.
    if (s.pendingBlock) openBlockResponse(s);
    else resolveAction(s);
  } else {
    logBlocked(s);
    endTurn(s);
  }
}

function allResponded(phase: { responders: string[]; passed: string[] }): boolean {
  return phase.responders.every((id) => phase.passed.includes(id));
}

/**
 * Record the block (logged now). For a challengeable action (steal / assassinate) whose other
 * responders have not all answered yet, the SAME action_response window stays open — same
 * phaseSeq, same deadline — so they can still challenge the action's claim or pass; the blocker
 * counts as responded. Otherwise (foreign aid, nobody left to answer) → block_response now.
 */
export function declareBlock(s: GameState, blockerId: string, character: Character): void {
  const action = pendingAction(s);
  s.pendingBlock = { blockerId, character };
  emit(s, { type: 'block', blockerId, character, actorId: action.actorId, action: action.type });
  const phase = s.phase;
  if (phase.kind === 'action_response' && phase.canChallenge) {
    phase.passed.push(blockerId);
    if (!allResponded(phase)) return;
  }
  openBlockResponse(s);
}

/** Everyone alive except the blocker may challenge the pending block. */
function openBlockResponse(s: GameState): void {
  const block = s.pendingBlock;
  if (!block) throw new Error('engine: no pending block');
  setPhase(s, { kind: 'block_response', responders: othersInTurnOrder(s, block.blockerId), passed: [] });
}

function logBlocked(s: GameState): void {
  const action = pendingAction(s);
  const block = s.pendingBlock;
  if (!block) throw new Error('engine: no pending block');
  emit(s, {
    type: 'action_blocked',
    actorId: action.actorId,
    action: action.type,
    blockerId: block.blockerId,
    character: block.character,
  });
}

/**
 * The challenged player showed the claimed card: it goes back into the deck, the deck is
 * shuffled and they draw a replacement into the same slot.
 */
function replaceProvenCard(s: GameState, playerId: string, slot: number): void {
  const player = getPlayer(s, playerId);
  const proven = player.influences[slot].card;
  s.deck.push(proven);
  shuffleDeck(s);
  forgetDeckKnowledge(s);
  const fresh = s.deck.shift() as Card;
  player.influences[slot] = { card: fresh, revealed: false };
  emit(s, { type: 'card_replaced', playerId, slot, character: proven.character });
}

export function challengeAction(s: GameState, challengerId: string): void {
  const action = pendingAction(s);
  const character = action.claim;
  if (!character) throw new Error('engine: action has no claim');
  const challengedId = action.actorId;
  emit(s, { type: 'challenge', challengerId, challengedId, character, against: 'action' });
  const slot = findHiddenSlot(getPlayer(s, challengedId), character);
  if (slot >= 0) {
    emit(s, { type: 'challenge_result', challengerId, challengedId, character, challengedHadCard: true, slot });
    replaceProvenCard(s, challengedId, slot);
    loseInfluence(s, challengerId, 'wrong_challenge', { kind: 'after_action_proven' });
    return;
  }
  emit(s, { type: 'challenge_result', challengerId, challengedId, character, challengedHadCard: false });
  // The action fails; a block declared while the window was open is moot (never action_blocked).
  s.pendingBlock = null;
  const cost = ACTIONS[action.type].cost;
  if (cost > 0) transferCoins(s, 'treasury', challengedId, cost, 'refund');
  emit(s, { type: 'action_failed', actorId: challengedId, action: action.type });
  loseInfluence(s, challengedId, 'caught_bluffing', { kind: 'end_turn' });
}

export function challengeBlock(s: GameState, challengerId: string): void {
  const block = s.pendingBlock;
  if (!block) throw new Error('engine: no pending block');
  const { blockerId: challengedId, character } = block;
  emit(s, { type: 'challenge', challengerId, challengedId, character, against: 'block' });
  const slot = findHiddenSlot(getPlayer(s, challengedId), character);
  if (slot >= 0) {
    emit(s, { type: 'challenge_result', challengerId, challengedId, character, challengedHadCard: true, slot });
    replaceProvenCard(s, challengedId, slot);
    logBlocked(s);
    loseInfluence(s, challengerId, 'wrong_challenge', { kind: 'end_turn' });
    return;
  }
  emit(s, { type: 'challenge_result', challengerId, challengedId, character, challengedHadCard: false });
  loseInfluence(s, challengedId, 'caught_bluffing', { kind: 'resolve_action' });
}

// ───────────── Exchange ─────────────

/**
 * Private deck knowledge (GameState.knownInDeck): what a player returned with their Exchange is
 * provably still in the court deck only until the next draw from it, by anyone.
 */
function forgetDeckKnowledge(s: GameState): void {
  s.knownInDeck = {};
}

function beginExchange(s: GameState, actorId: string): void {
  forgetDeckKnowledge(s);
  const drawn = s.deck.splice(0, Math.min(EXCHANGE_DRAW, s.deck.length));
  setPhase(s, { kind: 'exchange', drawn });
  emit(s, { type: 'exchange_draw', playerId: actorId, count: drawn.length });
}

/**
 * `keep` indexes into [actor's unrevealed cards in slot order, ...drawn] (already validated).
 * Kept hand cards stay in their slot; freed unrevealed slots take the kept drawn cards in
 * index order. Revealed slots are untouched. The rest returns to the deck, which is shuffled.
 */
export function completeExchange(s: GameState, keep: readonly number[]): void {
  const phase = s.phase;
  if (phase.kind !== 'exchange') throw new Error('engine: not exchanging');
  const actor = getPlayer(s, s.actorId);
  const slots = unrevealedSlots(actor);
  const cards: Card[] = [...slots.map((slot) => actor.influences[slot].card), ...phase.drawn];
  const kept = new Set(keep);
  const freedSlots = slots.filter((_, i) => !kept.has(i));
  const incoming = [...kept]
    .filter((i) => i >= slots.length)
    .sort((a, b) => a - b)
    .map((i) => cards[i]);
  freedSlots.forEach((slot, k) => {
    actor.influences[slot] = { card: incoming[k], revealed: false };
  });
  const returned = cards.filter((_, i) => !kept.has(i));
  s.deck.push(...returned);
  shuffleDeck(s);
  // Nobody has drawn since this exchange's own draw cleared the knowledge.
  s.knownInDeck = { [actor.id]: returned.map((c) => c.character) };
  emit(s, { type: 'exchange_done', playerId: actor.id, returned: returned.length });
  endTurn(s);
}
