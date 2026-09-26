/**
 * Test helpers for engine (and bot/server) tests: deterministic game creation, rigging hands /
 * coins / deck while preserving the 15-card and 50-coin invariants, and move runners that
 * throw with context on illegal moves.
 */
import { TREASURY_COINS } from '../constants';
import type { Card, Character, GameState, LoggedEvent, Move } from '../types';
import { applyMove, createGame } from './index';

export const TEST_SEED = 12345;

export function playerIds(n: number): string[] {
  return Array.from({ length: n }, (_, i) => `p${i}`);
}

/** Players p0..p{n-1} in seats 0..n-1; p0 starts unless `first` is given. */
export function newGame(n: number, opts: { seed?: number; first?: string } = {}): GameState {
  return createGame({
    players: playerIds(n).map((id, seat) => ({ id, name: id.toUpperCase(), seat })),
    seed: opts.seed ?? TEST_SEED,
    firstPlayerId: opts.first ?? 'p0',
  });
}

export interface RigSpec {
  /** Exact characters per slot for these players. */
  hands?: Record<string, [Character, Character]>;
  /** Slots that are already face up (all slots revealed → eliminated). */
  revealed?: Record<string, number[]>;
  coins?: Record<string, number>;
  /** Characters on top of the deck (index 0 = top), in order. */
  deckTop?: Character[];
}

/**
 * Returns a rigged copy of `state` (turn / action phases only — not mid-exchange). Players not
 * listed in `hands` keep their current characters when still available. Card ids are reused,
 * so the deck keeps exactly 3 of each character and the treasury is recomputed from coins.
 */
export function rig(state: GameState, spec: RigSpec): GameState {
  if (state.phase.kind === 'exchange') throw new Error('rig: cannot rig during an exchange');
  const s = structuredClone(state);
  const pool: Card[] = [...s.players.flatMap((p) => p.influences.map((inf) => inf.card)), ...s.deck];
  const take = (character: Character): Card => {
    const i = pool.findIndex((c) => c.character === character);
    if (i < 0) throw new Error(`rig: no ${character} left in the pool`);
    return pool.splice(i, 1)[0];
  };

  const hands = new Map<string, Card[]>();
  for (const p of s.players) {
    const wanted = spec.hands?.[p.id];
    if (wanted) hands.set(p.id, wanted.map(take));
  }
  const top = (spec.deckTop ?? []).map(take);
  for (const p of s.players) {
    if (hands.has(p.id)) continue;
    hands.set(
      p.id,
      p.influences.map((inf) => {
        const i = pool.findIndex((c) => c.character === inf.card.character);
        return i >= 0 ? pool.splice(i, 1)[0] : (pool.shift() as Card);
      }),
    );
  }

  for (const p of s.players) {
    const cards = hands.get(p.id) as Card[];
    const revealed = spec.revealed?.[p.id];
    p.influences = cards.map((card, slot) => ({
      card,
      revealed: revealed ? revealed.includes(slot) : p.influences[slot].revealed,
    }));
    p.eliminated = p.influences.every((inf) => inf.revealed);
    if (spec.coins?.[p.id] !== undefined) p.coins = spec.coins[p.id];
    if (p.eliminated) p.coins = 0;
  }
  s.deck = [...top, ...pool];
  s.treasury = TREASURY_COINS - s.players.reduce((sum, p) => sum + p.coins, 0);
  if (s.treasury < 0) throw new Error('rig: more than 50 coins handed out');
  return s;
}

export interface Played {
  state: GameState;
  events: LoggedEvent[];
}

/** Apply one move; throws with the error code if it is rejected. */
export function act(state: GameState, playerId: string, move: Move, opts?: { auto?: boolean }): Played {
  const res = applyMove(state, playerId, move, opts);
  if (!res.ok) throw new Error(`${playerId} ${JSON.stringify(move)} rejected: ${res.error}`);
  return { state: res.state, events: res.events };
}

/** Apply a sequence of moves; returns the final state and all events produced. */
export function play(state: GameState, steps: ReadonlyArray<readonly [string, Move]>): Played {
  let current = state;
  const events: LoggedEvent[] = [];
  for (const [playerId, move] of steps) {
    const r = act(current, playerId, move);
    current = r.state;
    events.push(...r.events);
  }
  return { state: current, events };
}

export function types(events: readonly LoggedEvent[]): string[] {
  return events.map((e) => e.type);
}

export function hand(state: GameState, playerId: string): Character[] {
  const p = state.players.find((x) => x.id === playerId);
  if (!p) throw new Error(`unknown player ${playerId}`);
  return p.influences.map((inf) => inf.card.character);
}

export function player(state: GameState, playerId: string): GameState['players'][number] {
  const p = state.players.find((x) => x.id === playerId);
  if (!p) throw new Error(`unknown player ${playerId}`);
  return p;
}

export function coinsOf(state: GameState, playerId: string): number {
  return player(state, playerId).coins;
}

export function hiddenCount(state: GameState, playerId: string): number {
  return player(state, playerId).influences.filter((inf) => !inf.revealed).length;
}

// Common moves.
export const PASS: Move = { type: 'pass' };
export const CHALLENGE: Move = { type: 'challenge' };
export const INCOME: Move = { type: 'action', action: 'income' };
export const block = (character: Character): Move => ({ type: 'block', character });
export const reveal = (slot: number): Move => ({ type: 'reveal', slot });
