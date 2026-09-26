/**
 * Test utilities: hand-built, internally consistent GameViews (no engine involved), prompt
 * builders mirroring the rules, a random-view generator for property tests and an
 * independent legality checker.
 */
import { ACTIONS, CARDS_PER_CHARACTER, MUST_COUP_COINS } from '../constants';
import { shuffle } from '../rng';
import { ACTION_TYPES, CHARACTERS } from '../types';
import type {
  ActionOption,
  ActionType,
  Character,
  DeclaredAction,
  DeclaredBlock,
  GameEvent,
  GameView,
  LoggedEvent,
  LossReason,
  Move,
  PhaseView,
  PlayerPublic,
  Prompt,
} from '../types';

export interface SeatSpec {
  id: string;
  /** The seat's real cards (slot order). */
  cards: Character[];
  /** Face-up flags per slot (default: none revealed). */
  revealed?: boolean[];
  coins?: number;
}

export interface ViewSpec {
  me: string;
  seats: SeatSpec[];
  prompt: Prompt;
  pendingAction?: DeclaredAction | null;
  pendingBlock?: DeclaredBlock | null;
  /** Public events; `seq` is assigned in order and `turn` follows `turn_start` events. */
  log?: GameEvent[];
  turn?: number;
  actorId?: string;
  /** Defaults to 15 − all dealt cards (− 2 while the viewer is exchanging). */
  deckCount?: number;
}

const TOTAL_CARDS = CHARACTERS.length * CARDS_PER_CHARACTER;

export function hiddenCount(seat: SeatSpec): number {
  return seat.cards.filter((_, i) => !seat.revealed?.[i]).length;
}

export function isAlive(seat: SeatSpec): boolean {
  return hiddenCount(seat) > 0;
}

export function toLogged(events: readonly GameEvent[], startTurn = 1): LoggedEvent[] {
  let turn = startTurn;
  return events.map((e, i) => {
    if (e.type === 'turn_start') turn = e.turn;
    return { ...e, seq: i + 1, turn } as LoggedEvent;
  });
}

function playerPublic(seat: SeatSpec, index: number, viewer: boolean): PlayerPublic {
  const influences = seat.cards.map((c, slot) => {
    const revealed = !!seat.revealed?.[slot];
    return { slot, revealed, character: revealed || viewer ? c : null };
  });
  const hidden = influences.filter((i) => !i.revealed).length;
  return {
    id: seat.id,
    name: seat.id.toUpperCase(),
    seat: index,
    coins: seat.coins ?? 2,
    influences,
    hiddenCount: hidden,
    eliminated: hidden === 0,
  };
}

function phaseFor(spec: ViewSpec, action: DeclaredAction | null, block: DeclaredBlock | null): PhaseView {
  const alive = spec.seats.filter(isAlive).map((s) => s.id);
  const p = spec.prompt;
  switch (p.kind) {
    case 'choose_action':
      return { kind: 'turn', actorId: spec.me };
    case 'respond_action': {
      const a = action ?? { type: 'tax', actorId: alive.find((id) => id !== spec.me) ?? '', claim: 'duke' };
      return {
        kind: 'action_response',
        action: a,
        responders: alive.filter((id) => id !== a.actorId),
        passed: [],
        canChallenge: p.canChallenge,
        blockers: p.blockCharacters.length > 0 ? [spec.me] : [],
        blockCharacters: p.blockCharacters.slice(),
      };
    }
    case 'respond_block': {
      const a = action ?? { type: 'foreign_aid', actorId: alive[0] };
      const b = block ?? { blockerId: alive.find((id) => id !== spec.me) ?? '', character: 'duke' };
      const responders = alive.filter((id) => id !== b.blockerId);
      return { kind: 'block_response', action: a, block: b, responders, passed: [] };
    }
    case 'lose_influence':
      return { kind: 'lose_influence', playerId: spec.me, reason: p.reason, action, block };
    case 'exchange':
      return {
        kind: 'exchange',
        actorId: spec.me,
        action: action ?? { type: 'exchange', actorId: spec.me, claim: 'ambassador' },
      };
  }
}

/** Builds a GameView for `spec.me`. Throws if the spec uses more than 3 copies of a character. */
export function buildView(spec: ViewSpec): GameView {
  const counts = new Map<Character, number>();
  for (const s of spec.seats) for (const c of s.cards) counts.set(c, (counts.get(c) ?? 0) + 1);
  if (spec.prompt.kind === 'exchange') {
    const hand = spec.seats.find((s) => s.id === spec.me);
    const drawn = spec.prompt.cards.slice(hand ? hiddenCount(hand) : 0);
    for (const c of drawn) counts.set(c, (counts.get(c) ?? 0) + 1);
  }
  for (const [c, n] of counts) {
    if (n > CARDS_PER_CHARACTER) throw new Error(`test view uses ${n} copies of ${c}`);
  }
  const dealt = spec.seats.reduce((n, s) => n + s.cards.length, 0);
  const deckCount = spec.deckCount ?? TOTAL_CARDS - dealt - (spec.prompt.kind === 'exchange' ? 2 : 0);
  const action = spec.pendingAction ?? null;
  const block = spec.pendingBlock ?? null;
  const players = spec.seats.map((s, i) => playerPublic(s, i, s.id === spec.me));
  const log = toLogged(spec.log ?? []);
  const turn = spec.turn ?? (log.length ? log[log.length - 1].turn : 1);
  return {
    viewerId: spec.me,
    players,
    deckCount,
    treasury: 50 - players.reduce((n, p) => n + p.coins, 0),
    turn,
    actorId: spec.actorId ?? action?.actorId ?? spec.me,
    pendingAction: action,
    pendingBlock: block,
    phase: phaseFor(spec, action, block),
    phaseSeq: log.length + 1,
    prompt: spec.prompt,
    winnerId: null,
    log,
    deadline: null,
    phaseDurationMs: null,
    serverNow: 0,
  };
}

// ───────────────────────────── Prompt builders ─────────────────────────────

/** choose_action options exactly as the rules define them. */
export function chooseActionPrompt(seats: readonly SeatSpec[], meId: string): Prompt {
  const me = seats.find((s) => s.id === meId);
  const coins = me?.coins ?? 2;
  const others = seats.filter((s) => s.id !== meId && isAlive(s)).map((s) => s.id);
  const mustCoup = coins >= MUST_COUP_COINS;
  const options = ACTION_TYPES.map((action): ActionOption => {
    const def = ACTIONS[action];
    const o: ActionOption = { action, enabled: false, targets: [], cost: def.cost };
    if (def.claim) o.claim = def.claim;
    if (mustCoup && action !== 'coup') o.disabledReason = 'must_coup';
    else if (coins < def.cost) o.disabledReason = 'not_enough_coins';
    else if (def.needsTarget && others.length === 0) o.disabledReason = 'no_targets';
    else {
      o.enabled = true;
      if (def.needsTarget) o.targets = others.slice();
    }
    return o;
  });
  return { kind: 'choose_action', options, mustCoup };
}

/** respond_action prompt for `meId` facing `action` (the normal window, or the post-proof block window). */
export function respondActionPrompt(action: DeclaredAction, meId: string, afterProof = false): Prompt {
  const def = ACTIONS[action.type];
  const canBlock = def.blockableBy === 'anyone' || (def.blockableBy === 'target' && action.targetId === meId);
  return {
    kind: 'respond_action',
    canChallenge: !afterProof && !!def.claim,
    blockCharacters: canBlock ? def.blockedBy.slice() : [],
  };
}

export function declared(type: ActionType, actorId: string, targetId?: string): DeclaredAction {
  const a: DeclaredAction = { type, actorId };
  if (targetId) a.targetId = targetId;
  const claim = ACTIONS[type].claim;
  if (claim) a.claim = claim;
  return a;
}

/** The 'action' log event matching a declared action. */
export function actionEvent(a: DeclaredAction): GameEvent {
  const e: GameEvent = { type: 'action', actorId: a.actorId, action: a.type };
  if (a.targetId) e.targetId = a.targetId;
  if (a.claim) e.claim = a.claim;
  return e;
}

// ───────────────────────────── Independent legality check ─────────────────────────────

/** Returns null when `move` is legal for `prompt`, else a reason. */
export function legalityError(prompt: Prompt, move: Move): string | null {
  switch (prompt.kind) {
    case 'choose_action': {
      if (move.type !== 'action') return `expected action, got ${move.type}`;
      if (prompt.mustCoup && move.action !== 'coup') return 'must coup';
      const o = prompt.options.find((x) => x.action === move.action);
      if (!o || !o.enabled) return `${move.action} not enabled`;
      if (ACTIONS[move.action].needsTarget) {
        if (!move.targetId || !o.targets.includes(move.targetId)) return `bad target ${move.targetId}`;
      } else if (move.targetId !== undefined) return 'unexpected target';
      return null;
    }
    case 'respond_action':
      if (move.type === 'pass') return null;
      if (move.type === 'challenge') return prompt.canChallenge ? null : 'cannot challenge';
      if (move.type === 'block') {
        return prompt.blockCharacters.includes(move.character) ? null : `cannot block with ${move.character}`;
      }
      return `unexpected ${move.type}`;
    case 'respond_block':
      return move.type === 'pass' || move.type === 'challenge' ? null : `unexpected ${move.type}`;
    case 'lose_influence':
      if (move.type !== 'reveal') return `unexpected ${move.type}`;
      return prompt.slots.includes(move.slot) ? null : `slot ${move.slot} not allowed`;
    case 'exchange': {
      if (move.type !== 'exchange') return `unexpected ${move.type}`;
      if (move.keep.length !== prompt.keepCount) return `kept ${move.keep.length}, need ${prompt.keepCount}`;
      if (new Set(move.keep).size !== move.keep.length) return 'duplicate index';
      if (move.keep.some((i) => !Number.isInteger(i) || i < 0 || i >= prompt.cards.length)) return 'index out of range';
      return null;
    }
  }
}

// ───────────────────────────── Random views ─────────────────────────────

function randInt(rand: () => number, n: number): number {
  return Math.floor(rand() * n);
}

function pick<T>(rand: () => number, items: readonly T[]): T {
  return items[randInt(rand, items.length)];
}

const LOSS_REASONS: readonly LossReason[] = ['coup', 'assassinate', 'wrong_challenge', 'caught_bluffing'];

/** Plausible-but-random public history: claims, blocks, challenges, reveals, exchanges. */
function randomLog(rand: () => number, seats: readonly SeatSpec[]): GameEvent[] {
  const ids = seats.map((s) => s.id);
  const events: GameEvent[] = [{ type: 'game_start', playerIds: ids.slice(), firstPlayerId: ids[0] }];
  const n = randInt(rand, 60);
  let turn = 1;
  for (let i = 0; i < n; i++) {
    const a = pick(rand, ids);
    const b = pick(rand, ids.filter((id) => id !== a));
    const c = pick(rand, CHARACTERS);
    switch (randInt(rand, 10)) {
      case 0:
        turn++;
        events.push({ type: 'turn_start', playerId: a, turn });
        break;
      case 1:
      case 2: {
        const type = pick(rand, ACTION_TYPES);
        events.push(actionEvent(declared(type, a, ACTIONS[type].needsTarget ? b : undefined)));
        break;
      }
      case 3:
        events.push({ type: 'block', blockerId: a, character: c, actorId: b, action: 'steal' });
        break;
      case 4: {
        const had = rand() < 0.5;
        events.push({ type: 'challenge', challengerId: a, challengedId: b, character: c, against: 'action' });
        events.push({ type: 'challenge_result', challengerId: a, challengedId: b, character: c, challengedHadCard: had });
        if (had) events.push({ type: 'card_replaced', playerId: b, slot: randInt(rand, 2), character: c });
        break;
      }
      case 5:
        events.push({ type: 'exchange_draw', playerId: a, count: 2 });
        events.push({ type: 'exchange_done', playerId: a, returned: 2 });
        break;
      case 6: {
        const type = pick(rand, ACTION_TYPES);
        events.push({ type: 'coins', from: 'treasury', to: a, amount: randInt(rand, 3), reason: 'steal' });
        events.push({ type: 'action_resolved', actorId: a, action: type, targetId: b });
        break;
      }
      case 7:
        events.push({ type: 'pass', playerId: a });
        break;
      case 8:
        events.push({ type: 'action_blocked', actorId: a, action: 'foreign_aid', blockerId: b, character: 'duke' });
        break;
      default:
        events.push({ type: 'timeout', playerId: a, phase: 'turn' });
    }
  }
  // Reveals that match the face-up cards, then eliminations.
  for (const s of seats) {
    s.cards.forEach((c, slot) => {
      if (s.revealed?.[slot]) {
        events.push({ type: 'influence_lost', playerId: s.id, slot, character: c, reason: pick(rand, LOSS_REASONS) });
      }
    });
    if (!isAlive(s)) events.push({ type: 'eliminated', playerId: s.id });
  }
  return events;
}

/** A random but self-consistent view with a random prompt for the viewer. */
export function randomView(rand: () => number): GameView {
  const n = 2 + randInt(rand, 5);
  const deck = shuffle(
    CHARACTERS.flatMap((c) => Array.from({ length: CARDS_PER_CHARACTER }, () => c)),
    rand,
  );
  const seats: SeatSpec[] = [];
  for (let i = 0; i < n; i++) {
    const cards = [deck.pop()!, deck.pop()!];
    const r = rand();
    const revealed = r < 0.55 ? [false, false] : r < 0.85 ? (rand() < 0.5 ? [true, false] : [false, true]) : [true, true];
    seats.push({ id: `p${i}`, cards, revealed, coins: randInt(rand, 13) });
  }
  const meIndex = randInt(rand, n);
  const me = seats[meIndex];
  if (!isAlive(me)) me.revealed = [false, rand() < 0.5];
  if (!seats.some((s) => s !== me && isAlive(s))) seats[(meIndex + 1) % n].revealed = [false, false];
  for (const s of seats) if (!isAlive(s)) s.coins = 0;

  const alive = seats.filter(isAlive).map((s) => s.id);
  const others = alive.filter((id) => id !== me.id);
  const mySlots = me.cards.map((_, i) => i).filter((i) => !me.revealed?.[i]);
  const myHidden = mySlots.map((i) => me.cards[i]);
  const log = randomLog(rand, seats);

  let prompt: Prompt;
  let pendingAction: DeclaredAction | null = null;
  let pendingBlock: DeclaredBlock | null = null;
  let actorId = me.id;
  switch (randInt(rand, 5)) {
    case 0:
      prompt = chooseActionPrompt(seats, me.id);
      break;
    case 1: {
      const actor = pick(rand, others);
      const type = pick(rand, ['foreign_aid', 'tax', 'assassinate', 'steal', 'exchange'] as const);
      const targets = alive.filter((id) => id !== actor);
      const target = ACTIONS[type].needsTarget ? (rand() < 0.5 ? me.id : pick(rand, targets)) : undefined;
      pendingAction = declared(type, actor, target);
      const afterProof = target === me.id && rand() < 0.25;
      prompt = respondActionPrompt(pendingAction, me.id, afterProof);
      log.push(actionEvent(pendingAction));
      actorId = actor;
      break;
    }
    case 2: {
      const type = pick(rand, ['foreign_aid', 'assassinate', 'steal'] as const);
      let actor = pick(rand, alive);
      let blockerPool = alive.filter((id) => id !== actor && id !== me.id);
      if (blockerPool.length === 0) {
        actor = me.id;
        blockerPool = others;
      }
      const blocker = pick(rand, blockerPool);
      pendingAction = declared(type, actor, type === 'foreign_aid' ? undefined : blocker);
      pendingBlock = { blockerId: blocker, character: pick(rand, ACTIONS[type].blockedBy) };
      log.push(actionEvent(pendingAction));
      log.push({ type: 'block', blockerId: blocker, character: pendingBlock.character, actorId: actor, action: type });
      prompt = { kind: 'respond_block' };
      actorId = actor;
      break;
    }
    case 3:
      prompt = { kind: 'lose_influence', slots: mySlots, reason: pick(rand, LOSS_REASONS) };
      break;
    default: {
      const drawn = deck.length >= 2 ? [deck.pop()!, deck.pop()!] : [];
      prompt = { kind: 'exchange', cards: [...myHidden, ...drawn], keepCount: myHidden.length };
      pendingAction = declared('exchange', me.id);
      break;
    }
  }
  return buildView({
    me: me.id,
    seats,
    prompt,
    pendingAction,
    pendingBlock,
    log,
    actorId,
    deckCount: deck.length,
  });
}
