import { describe, expect, it } from 'vitest';
import { CARDS_PER_CHARACTER, TREASURY_COINS } from '../constants';
import { createRng } from '../rng';
import { CHARACTERS } from '../types';
import type { GameState, LoggedEvent, Move, Phase } from '../types';
import { applyMove, createGame, getDeciders, getDefaultMove, isGameOver, listLegalMoves, toView } from './index';
import { allCards } from './state';

const GAMES = 3000;
const MAX_MOVES = 2000;
const CARD_ID = /"c\d{1,2}"/;

/** Phase identity for the phaseSeq check: a pass that keeps the window open is not a phase change. */
function phaseKey(s: GameState): string {
  const phase: Phase = s.phase;
  const rest = phase.kind === 'action_response' || phase.kind === 'block_response' ? { ...phase, passed: [] } : phase;
  return `${s.turn}|${JSON.stringify(rest)}`;
}

function checkState(s: GameState): string | null {
  const coins = s.players.reduce((sum, p) => sum + p.coins, 0);
  if (coins + s.treasury !== TREASURY_COINS) return `coins ${coins} + treasury ${s.treasury} != 50`;
  if (s.treasury < 0 || s.players.some((p) => p.coins < 0)) return 'negative coins';

  const cards = allCards(s);
  if (cards.length !== 15) return `card count ${cards.length}`;
  if (new Set(cards.map((c) => c.id)).size !== 15) return 'duplicate card ids';
  for (const ch of CHARACTERS) {
    if (cards.filter((c) => c.character === ch).length !== CARDS_PER_CHARACTER) return `wrong ${ch} count`;
  }

  for (const p of s.players) {
    if (p.influences.length !== 2) return `${p.id} has ${p.influences.length} slots`;
    const hidden = p.influences.filter((i) => !i.revealed).length;
    if (p.eliminated !== (hidden === 0)) return `${p.id} eliminated=${p.eliminated} with ${hidden} hidden`;
    if (p.eliminated && p.coins !== 0) return `${p.id} eliminated with coins`;
  }

  const alive = s.players.filter((p) => !p.eliminated);
  const deciders = getDeciders(s);
  if (isGameOver(s)) {
    if (alive.length !== 1 || s.winnerId !== alive[0].id) return 'bad game over';
    if (deciders.length !== 0) return 'deciders after game over';
  } else {
    if (alive.length < 2) return 'game should be over';
    if (deciders.length === 0) return `no deciders in ${s.phase.kind}`;
    if (deciders.some((id) => !alive.some((p) => p.id === id))) return 'eliminated decider';
    if (!alive.some((p) => p.id === s.actorId) && s.phase.kind === 'turn') return 'dead actor has the turn';
  }

  for (let i = 1; i < s.log.length; i++) {
    if (s.log[i].seq !== s.log[i - 1].seq + 1) return 'log seq gap';
  }
  if (s.nextEventSeq !== s.log[s.log.length - 1].seq + 1) return 'nextEventSeq mismatch';
  return null;
}

function checkTransition(prev: GameState, next: GameState, events: LoggedEvent[]): string | null {
  if (next.phaseSeq < prev.phaseSeq) return 'phaseSeq decreased';
  if (phaseKey(prev) !== phaseKey(next) && next.phaseSeq <= prev.phaseSeq) return 'phase changed without phaseSeq';
  if (events.length === 0) return 'move produced no events';
  if (next.log.length !== prev.log.length + events.length) return 'events not appended to the log';
  if (events.some((e, i) => next.log[prev.log.length + i] !== e)) return 'returned events differ from the log';
  for (const p of prev.players) {
    const q = next.players.find((x) => x.id === p.id);
    if (!q) return 'player vanished';
    for (let slot = 0; slot < p.influences.length; slot++) {
      const before = p.influences[slot];
      const after = q.influences[slot];
      if (before.revealed && (!after.revealed || after.card.id !== before.card.id)) return `${p.id} slot ${slot} unrevealed`;
    }
    if (p.eliminated && !q.eliminated) return `${p.id} came back to life`;
  }
  return null;
}

/** Each declared action gets exactly one outcome, except the one interrupted by the game ending. */
function checkOutcomes(s: GameState): string | null {
  let open = false;
  for (const e of s.log) {
    if (e.type === 'action') {
      if (open) return `turn ${e.turn}: previous action had no outcome`;
      open = true;
    } else if (e.type === 'action_resolved' || e.type === 'action_blocked' || e.type === 'action_failed') {
      if (!open) return `turn ${e.turn}: outcome without an action`;
      open = false;
    } else if (e.type === 'turn_start' && open) {
      return `turn ${e.turn}: started before the previous action resolved`;
    }
  }
  return null;
}

function checkRedaction(s: GameState): string | null {
  for (const viewer of [null, ...s.players.map((p) => p.id)]) {
    const view = toView(s, viewer);
    if (CARD_ID.test(JSON.stringify(view))) return `card id leaked to ${viewer}`;
    for (const pv of view.players) {
      const p = s.players.find((x) => x.id === pv.id);
      if (!p) return 'unknown player in view';
      for (const iv of pv.influences) {
        const inf = p.influences[iv.slot];
        const expected = inf.revealed || p.id === viewer ? inf.card.character : null;
        if (iv.character !== expected) return `${viewer} sees ${p.id} slot ${iv.slot} as ${iv.character}`;
      }
    }
    if (view.phase.kind === 'exchange' && viewer !== s.actorId && view.prompt !== null) return 'exchange prompt leaked';
  }
  return null;
}

function playRandomGame(gameIndex: number): { moves: number; state: GameState } {
  const rand = createRng(0x5eed + gameIndex * 7919);
  const n = 2 + Math.floor(rand() * 5);
  const players = Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `P${i}`, seat: i }));
  let s = createGame({
    players,
    seed: Math.floor(rand() * 0x7fffffff),
    firstPlayerId: rand() < 0.5 ? undefined : players[Math.floor(rand() * n)].id,
  });
  const initial = checkState(s);
  if (initial) throw new Error(`game ${gameIndex} setup: ${initial}`);
  const checkViews = gameIndex % 30 === 0;

  let moves = 0;
  while (!isGameOver(s)) {
    if (++moves > MAX_MOVES) throw new Error(`game ${gameIndex} did not end within ${MAX_MOVES} moves`);
    const deciders = getDeciders(s);
    let playerId: string;
    let move: Move;
    let auto = false;
    if (rand() < 0.1) {
      playerId = deciders[Math.floor(rand() * deciders.length)];
      move = getDefaultMove(s, playerId) as Move;
      auto = true;
    } else {
      const options = deciders.flatMap((id) => listLegalMoves(s, id).map((m) => [id, m] as const));
      if (options.length === 0) throw new Error(`game ${gameIndex}: deciders without legal moves`);
      [playerId, move] = options[Math.floor(rand() * options.length)];
    }
    const res = applyMove(s, playerId, move, { auto });
    if (!res.ok) {
      throw new Error(`game ${gameIndex} move ${moves}: ${playerId} ${JSON.stringify(move)} → ${res.error} in ${s.phase.kind}`);
    }
    const problem =
      checkTransition(s, res.state, res.events) ??
      checkState(res.state) ??
      (checkViews ? checkRedaction(res.state) : null);
    if (problem) throw new Error(`game ${gameIndex} move ${moves} (${playerId} ${JSON.stringify(move)}): ${problem}`);
    if (auto && res.events[0].type !== 'timeout') throw new Error('auto move without a timeout event');
    s = res.state;
  }
  const outcomes = checkOutcomes(s);
  if (outcomes) throw new Error(`game ${gameIndex}: ${outcomes}`);
  if (s.log[s.log.length - 1].type !== 'game_over') throw new Error(`game ${gameIndex}: log does not end with game_over`);
  return { moves, state: s };
}

describe('fuzz: random legal games', () => {
  it(`plays ${GAMES} complete games without breaking an invariant`, () => {
    const started = performance.now();
    let totalMoves = 0;
    const winnersBySize = new Map<number, number>();
    for (let g = 0; g < GAMES; g++) {
      const { moves, state } = playRandomGame(g);
      totalMoves += moves;
      winnersBySize.set(state.players.length, (winnersBySize.get(state.players.length) ?? 0) + 1);
    }
    const elapsed = performance.now() - started;
    expect([...winnersBySize.keys()].sort()).toEqual([2, 3, 4, 5, 6]);
    expect(totalMoves).toBeGreaterThan(GAMES * 5);
    // Average cost per move including invariant checks — a loose guard against regressions.
    expect(elapsed / totalMoves).toBeLessThan(1);
  });
});
