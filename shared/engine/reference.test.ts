/**
 * Differential fuzz: an independent reference model of the ORIGINAL Coup rules (written from
 * docs/SPEC.md §1 + the rulebook, not from the engine code) runs in lockstep with the engine.
 * After every move the public state (coins, treasury, revealed slots, eliminations, actor, turn,
 * phase kind, winner), the pending block, the private deck knowledge (knownInDeck), the number
 * of phase changes (phaseSeq delta), the deciders and every player's full legal-move set must
 * agree, and every illegal probe must be rejected. Random card draws (card replacement, exchange
 * draw) are synced from the engine after checking the slot / count.
 *
 * Ported from the rules review (.review/rules/reference.test.ts) and updated for SPEC §1.1
 * "block while others may still challenge the action".
 */
import { describe, expect, it } from 'vitest';
import { createRng } from '../rng';
import { CHARACTERS } from '../types';
import type { ActionType, Character, GameState, Move } from '../types';
import { applyMove, createGame, getDeciders, getDefaultMove, listLegalMoves } from './index';

const GAMES = 1500;
const MAX_STEPS = 3000;

type Then = 'end' | 'proven' | 'resolve';
interface RP {
  id: string;
  coins: number;
  cards: Character[];
  revealed: boolean[];
  elim: boolean;
}
type RPhase =
  | { k: 'turn' }
  | { k: 'resp'; pending: string[]; canChal: boolean; blockers: string[]; chars: Character[] }
  | { k: 'bresp'; pending: string[] }
  | { k: 'lose'; pid: string; then: Then }
  | { k: 'exch'; drawn: Character[] }
  | { k: 'over'; winner: string };
interface RS {
  players: RP[];
  treasury: number;
  actor: string;
  turn: number;
  action: { type: ActionType; actor: string; target?: string } | null;
  block: { by: string; ch: Character } | null;
  /** What each player provably knows is in the deck (their last exchange's returns, until any draw). */
  known: Record<string, Character[]>;
  phase: RPhase;
  /** Number of phase changes so far (compared with the engine's phaseSeq deltas). */
  seq: number;
}

const COST: Record<ActionType, number> = { income: 0, foreign_aid: 0, coup: 7, tax: 0, assassinate: 3, steal: 0, exchange: 0 };
const CLAIM: Partial<Record<ActionType, Character>> = { tax: 'duke', assassinate: 'assassin', steal: 'captain', exchange: 'ambassador' };
const TARGETED: ActionType[] = ['coup', 'assassinate', 'steal'];
const ALL_ACTIONS: ActionType[] = ['income', 'foreign_aid', 'coup', 'tax', 'assassinate', 'steal', 'exchange'];

const P = (r: RS, id: string): RP => {
  const p = r.players.find((x) => x.id === id);
  if (!p) throw new Error(`ref: unknown player ${id}`);
  return p;
};
const alive = (r: RS): RP[] => r.players.filter((p) => !p.elim);
const hidden = (p: RP): number[] => p.revealed.map((rv, i) => (rv ? -1 : i)).filter((i) => i >= 0);
function othersClockwise(r: RS, from: string): string[] {
  const i = r.players.findIndex((p) => p.id === from);
  const out: string[] = [];
  for (let k = 1; k < r.players.length; k++) {
    const p = r.players[(i + k) % r.players.length];
    if (!p.elim) out.push(p.id);
  }
  return out;
}
function give(r: RS, from: string | 'T', to: string | 'T', n: number): void {
  const bal = from === 'T' ? r.treasury : P(r, from).coins;
  const m = Math.max(0, Math.min(n, bal));
  if (from === 'T') r.treasury -= m;
  else P(r, from).coins -= m;
  if (to === 'T') r.treasury += m;
  else P(r, to).coins += m;
}

class Ref {
  r: RS;
  constructor(eng: GameState) {
    this.r = {
      players: eng.players.map((p) => ({
        id: p.id,
        coins: p.coins,
        cards: p.influences.map((i) => i.card.character),
        revealed: [false, false],
        elim: false,
      })),
      treasury: eng.treasury,
      actor: eng.actorId,
      turn: 1,
      action: null,
      block: null,
      known: {},
      phase: { k: 'turn' },
      seq: 0,
    };
  }

  legal(id: string): Move[] {
    const r = this.r;
    const me = P(r, id);
    if (me.elim) return [];
    const ph = r.phase;
    switch (ph.k) {
      case 'turn': {
        if (r.actor !== id) return [];
        const out: Move[] = [];
        const others = othersClockwise(r, id);
        const acts: ActionType[] = me.coins >= 10 ? ['coup'] : ALL_ACTIONS;
        for (const a of acts) {
          if (me.coins < COST[a]) continue;
          if (TARGETED.includes(a)) for (const t of others) out.push({ type: 'action', action: a, targetId: t });
          else out.push({ type: 'action', action: a });
        }
        return out;
      }
      case 'resp': {
        if (!ph.pending.includes(id)) return [];
        const out: Move[] = [{ type: 'pass' }];
        if (ph.canChal) out.push({ type: 'challenge' });
        if (ph.blockers.includes(id)) for (const c of ph.chars) out.push({ type: 'block', character: c });
        return out;
      }
      case 'bresp':
        return ph.pending.includes(id) ? [{ type: 'pass' }, { type: 'challenge' }] : [];
      case 'lose':
        return ph.pid === id ? hidden(me).map((slot): Move => ({ type: 'reveal', slot })) : [];
      case 'exch': {
        if (r.actor !== id) return [];
        const k = hidden(me).length;
        const n = k + ph.drawn.length;
        const out: Move[] = [];
        const rec = (start: number, acc: number[]): void => {
          if (acc.length === k) {
            out.push({ type: 'exchange', keep: acc.slice() });
            return;
          }
          for (let i = start; i < n; i++) rec(i + 1, [...acc, i]);
        };
        rec(0, []);
        return out;
      }
      case 'over':
        return [];
    }
  }

  /** Players with a decision, sorted by id (the engine's order is clockwise; order is not a rule). */
  deciders(): string[] {
    return this.r.players
      .filter((p) => this.legal(p.id).length > 0)
      .map((p) => p.id)
      .sort();
  }

  /** Apply; `next` is the engine state after the same move (used only to sync random draws). */
  apply(id: string, m: Move, next: GameState): void {
    const r = this.r;
    const ph = r.phase;
    const setPhase = (p: RPhase): void => {
      r.phase = p;
      r.seq++;
    };
    /** A card was drawn from the deck: nobody knows what is in it any more. */
    const drew = (): void => {
      r.known = {};
    };
    const sync = (pid: string, slot: number): void => {
      const eng = next.players.find((p) => p.id === pid);
      if (!eng) throw new Error(`ref: engine lost ${pid}`);
      P(r, pid).cards[slot] = eng.influences[slot].card.character;
    };
    const reveal = (pid: string, slot: number): boolean => {
      const p = P(r, pid);
      p.revealed[slot] = true;
      if (hidden(p).length === 0) {
        p.elim = true;
        give(r, pid, 'T', p.coins);
      }
      if (alive(r).length <= 1) {
        r.block = null;
        setPhase({ k: 'over', winner: alive(r)[0].id });
        return true;
      }
      return false;
    };
    const endTurn = (): void => {
      if (alive(r).length <= 1) return;
      r.actor = othersClockwise(r, r.actor)[0];
      r.turn++;
      r.action = null;
      r.block = null;
      setPhase({ k: 'turn' });
    };
    const lose = (pid: string, then: Then): void => {
      const h = hidden(P(r, pid));
      if (h.length === 0) return cont(then);
      if (h.length === 1) {
        if (!reveal(pid, h[0])) cont(then);
        return;
      }
      setPhase({ k: 'lose', pid, then });
    };
    const cont = (then: Then): void => (then === 'end' ? endTurn() : then === 'proven' ? proven() : resolve());
    const blockWindow = (): void => {
      if (!r.block) throw new Error('ref: no block');
      setPhase({ k: 'bresp', pending: othersClockwise(r, r.block.by) });
    };
    /** SPEC: the actor proved the claim. */
    const proven = (): void => {
      const a = r.action;
      if (!a) throw new Error('ref: no action');
      // A block declared while the action window was open → straight to its block window.
      if (r.block) return blockWindow();
      const targetOnly = a.type === 'steal' || a.type === 'assassinate';
      if (targetOnly && a.target !== undefined && !P(r, a.target).elim && !P(r, a.actor).elim) {
        setPhase({
          k: 'resp',
          pending: [a.target],
          canChal: false,
          blockers: [a.target],
          chars: a.type === 'steal' ? ['captain', 'ambassador'] : ['contessa'],
        });
        return;
      }
      resolve();
    };
    const resolve = (): void => {
      const a = r.action;
      if (!a) throw new Error('ref: no action');
      r.block = null;
      if (P(r, a.actor).elim) return endTurn();
      const tAlive = a.target !== undefined && !P(r, a.target).elim;
      switch (a.type) {
        case 'income':
          give(r, 'T', a.actor, 1);
          return endTurn();
        case 'foreign_aid':
          give(r, 'T', a.actor, 2);
          return endTurn();
        case 'tax':
          give(r, 'T', a.actor, 3);
          return endTurn();
        case 'steal':
          if (tAlive) give(r, a.target as string, a.actor, 2);
          return endTurn();
        case 'coup':
        case 'assassinate':
          if (tAlive) return lose(a.target as string, 'end');
          return endTurn();
        case 'exchange': {
          const eph = next.phase;
          if (eph.kind !== 'exchange') throw new Error(`ref: expected engine exchange, got ${eph.kind}`);
          if (eph.drawn.length !== 2) throw new Error(`ref: exchange drew ${eph.drawn.length}`);
          drew();
          setPhase({ k: 'exch', drawn: eph.drawn.map((c) => c.character) });
          return;
        }
      }
    };

    switch (m.type) {
      case 'action': {
        const a = { type: m.action, actor: id, ...(m.targetId ? { target: m.targetId } : {}) };
        r.action = a;
        r.block = null;
        give(r, id, 'T', COST[m.action]);
        const others = othersClockwise(r, id);
        switch (m.action) {
          case 'income':
          case 'coup':
            return resolve();
          case 'foreign_aid':
            return setPhase({ k: 'resp', pending: others, canChal: false, blockers: others, chars: ['duke'] });
          case 'tax':
          case 'exchange':
            return setPhase({ k: 'resp', pending: others, canChal: true, blockers: [], chars: [] });
          case 'assassinate':
            return setPhase({ k: 'resp', pending: others, canChal: true, blockers: [m.targetId as string], chars: ['contessa'] });
          case 'steal':
            return setPhase({
              k: 'resp',
              pending: others,
              canChal: true,
              blockers: [m.targetId as string],
              chars: ['captain', 'ambassador'],
            });
        }
        return;
      }
      case 'pass': {
        if (ph.k !== 'resp' && ph.k !== 'bresp') throw new Error('ref pass');
        ph.pending = ph.pending.filter((x) => x !== id);
        if (ph.pending.length > 0) return;
        if (ph.k === 'bresp') return endTurn();
        // Nobody challenged the action: a recorded block now gets its challenge window.
        return r.block ? blockWindow() : resolve();
      }
      case 'block': {
        if (ph.k !== 'resp') throw new Error('ref block');
        r.block = { by: id, ch: m.character };
        ph.pending = ph.pending.filter((x) => x !== id);
        // Others may still challenge the ACTION's claim: keep the same window (no phase change).
        if (ph.canChal && ph.pending.length > 0) return;
        return blockWindow();
      }
      case 'challenge': {
        if (ph.k === 'resp') {
          const a = r.action;
          if (!a) throw new Error('ref: no action');
          const claim = CLAIM[a.type] as Character;
          const actor = P(r, a.actor);
          const slot = hidden(actor).find((s) => actor.cards[s] === claim);
          if (slot !== undefined) {
            sync(a.actor, slot);
            drew();
            return lose(id, 'proven');
          }
          give(r, 'T', a.actor, COST[a.type]); // refund (assassinate)
          r.block = null; // the action failed: a pending block is moot
          return lose(a.actor, 'end');
        }
        if (ph.k !== 'bresp' || !r.block) throw new Error('ref challenge');
        const b = r.block;
        const blocker = P(r, b.by);
        const slot = hidden(blocker).find((s) => blocker.cards[s] === b.ch);
        if (slot !== undefined) {
          sync(b.by, slot);
          drew();
          return lose(id, 'end');
        }
        return lose(b.by, 'resolve');
      }
      case 'reveal': {
        if (ph.k !== 'lose') throw new Error('ref reveal');
        if (!reveal(ph.pid, m.slot)) cont(ph.then);
        return;
      }
      case 'exchange': {
        if (ph.k !== 'exch') throw new Error('ref exch');
        const me = P(r, id);
        const hs = hidden(me);
        const pool = [...hs.map((s) => me.cards[s]), ...ph.drawn];
        const kept = m.keep.map((i) => pool[i]).sort();
        // Sync slots from the engine, but check that the kept multiset matches.
        for (const s of hs) sync(id, s);
        const got = hs.map((s) => me.cards[s]).sort();
        if (JSON.stringify(got) !== JSON.stringify(kept)) throw new Error(`exchange kept ${got} expected ${kept}`);
        r.known = { [id]: pool.filter((_, i) => !m.keep.includes(i)) };
        return endTurn();
      }
    }
  }
}

function key(m: Move): string {
  return JSON.stringify(m, Object.keys(m).sort());
}

function engineSnapshot(s: GameState) {
  return {
    coins: Object.fromEntries(s.players.map((p) => [p.id, p.coins])),
    treasury: s.treasury,
    revealed: Object.fromEntries(s.players.map((p) => [p.id, p.influences.map((i) => i.revealed)])),
    hands: Object.fromEntries(s.players.map((p) => [p.id, p.influences.map((i) => i.card.character)])),
    elim: Object.fromEntries(s.players.map((p) => [p.id, p.eliminated])),
    actor: s.phase.kind === 'game_over' ? null : s.actorId,
    turn: s.phase.kind === 'game_over' ? null : s.turn,
    phase: s.phase.kind,
    block: s.pendingBlock ? { by: s.pendingBlock.blockerId, ch: s.pendingBlock.character } : null,
    known: s.knownInDeck ?? {},
    winner: s.winnerId,
  };
}
function refSnapshot(r: RS) {
  const k = { turn: 'turn', resp: 'action_response', bresp: 'block_response', lose: 'lose_influence', exch: 'exchange', over: 'game_over' } as const;
  return {
    coins: Object.fromEntries(r.players.map((p) => [p.id, p.coins])),
    treasury: r.treasury,
    revealed: Object.fromEntries(r.players.map((p) => [p.id, p.revealed])),
    hands: Object.fromEntries(r.players.map((p) => [p.id, p.cards])),
    elim: Object.fromEntries(r.players.map((p) => [p.id, p.elim])),
    actor: r.phase.k === 'over' ? null : r.actor,
    turn: r.phase.k === 'over' ? null : r.turn,
    phase: k[r.phase.k],
    block: r.block,
    known: r.known,
    winner: r.phase.k === 'over' ? r.phase.winner : null,
  };
}

const ALL_PROBES: Move[] = [
  { type: 'pass' },
  { type: 'challenge' },
  ...CHARACTERS.map((c): Move => ({ type: 'block', character: c })),
  { type: 'reveal', slot: 0 },
  { type: 'reveal', slot: 1 },
  { type: 'action', action: 'income' },
  { type: 'action', action: 'tax' },
  { type: 'action', action: 'foreign_aid' },
  { type: 'action', action: 'exchange' },
];

describe('differential fuzz vs reference rules model', () => {
  it(`agrees on ${GAMES} random games`, () => {
    const rand = createRng(987654);
    let moves = 0;
    let keptOpen = 0;
    for (let g = 0; g < GAMES; g++) {
      const n = 2 + (g % 5);
      let s = createGame({
        players: Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `P${i}`, seat: i })),
        seed: g * 7919 + 1,
      });
      const ref = new Ref(s);
      expect(refSnapshot(ref.r)).toEqual(engineSnapshot(s));
      for (let step = 0; step < MAX_STEPS && s.phase.kind !== 'game_over'; step++) {
        const where = `game ${g} step ${step} phase ${s.phase.kind}`;
        // Legal sets must match exactly for every player.
        const all: Array<[string, Move]> = [];
        for (const p of s.players) {
          const legal = ref.legal(p.id);
          const e = listLegalMoves(s, p.id).map(key).sort();
          const rr = legal.map(key).sort();
          if (JSON.stringify(e) !== JSON.stringify(rr)) throw new Error(`${where} ${p.id}: engine ${e} vs ref ${rr}`);
          for (const m of legal) all.push([p.id, m]);
          // Anything not legal must be rejected.
          for (const probe of ALL_PROBES) {
            if (rr.includes(key(probe))) continue;
            if (applyMove(s, p.id, probe).ok) throw new Error(`${where}: engine accepted illegal ${key(probe)} by ${p.id}`);
          }
        }
        const deciders = ref.deciders();
        if (JSON.stringify(getDeciders(s).slice().sort()) !== JSON.stringify(deciders)) {
          throw new Error(`${where}: deciders engine ${getDeciders(s)} vs ref ${deciders}`);
        }

        let pid: string;
        let move: Move;
        let auto = false;
        if (rand() < 0.08) {
          // A timeout: the engine's default move must be one of the reference's legal moves.
          pid = deciders[Math.floor(rand() * deciders.length)];
          move = getDefaultMove(s, pid) as Move;
          if (!ref.legal(pid).some((m) => key(m) === key(move))) throw new Error(`${where}: illegal default ${key(move)}`);
          auto = true;
        } else {
          // Bias: challenge/block more often to exercise the deep paths.
          const spicy = all.filter(([, m]) => m.type === 'challenge' || m.type === 'block');
          const pickFrom = spicy.length > 0 && rand() < 0.35 ? spicy : all;
          [pid, move] = pickFrom[Math.floor(rand() * pickFrom.length)];
        }
        const res = applyMove(s, pid, move, { auto });
        if (!res.ok) throw new Error(`${where}: engine rejected legal ${key(move)}: ${res.error}`);
        const refSeq = ref.r.seq;
        const wasOpen = ref.r.phase.k === 'resp' && ref.r.block !== null;
        ref.apply(pid, move, res.state);
        if (!wasOpen && ref.r.phase.k === 'resp' && ref.r.block !== null) keptOpen++;
        const engineDelta = res.state.phaseSeq - s.phaseSeq;
        const refDelta = ref.r.seq - refSeq;
        s = res.state;
        moves++;
        const a = engineSnapshot(s);
        const b = refSnapshot(ref.r);
        if (JSON.stringify(a) !== JSON.stringify(b) || engineDelta !== refDelta) {
          throw new Error(
            `${where} after ${pid} ${key(move)}:\nengine ${JSON.stringify(a)} (+${engineDelta})\nref    ${JSON.stringify(b)} (+${refDelta})`,
          );
        }
      }
      expect(s.phase.kind).toBe('game_over');
    }
    expect(moves).toBeGreaterThan(GAMES * 10);
    expect(keptOpen).toBeGreaterThan(100);
  });
});
