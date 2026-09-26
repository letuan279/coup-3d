/**
 * Transient per-player animation state for the 3D scene. Written by the event director (bus
 * events) and read inside useFrame — plain mutable module state, never React state.
 */
import { Vector3 } from 'three';

export type ReactionKind = 'act' | 'challenge' | 'block' | 'hurt' | 'win' | 'surprise' | 'sad';

const KINDS: readonly ReactionKind[] = ['act', 'challenge', 'block', 'hurt', 'win', 'surprise', 'sad'];

/** Seconds each reaction lasts. */
export const REACTION_DURATION: Record<ReactionKind, number> = {
  act: 1.5,
  challenge: 1.7,
  block: 1.9,
  hurt: 1.3,
  win: 1.7,
  surprise: 1.2,
  sad: 2.4,
};

const starts = new Map<string, Float64Array>();

/** Seconds on a monotonic clock (shared by the director and useFrame readers). */
export function nowSec(): number {
  return performance.now() / 1000;
}

function slot(id: string): Float64Array {
  let a = starts.get(id);
  if (!a) {
    a = new Float64Array(KINDS.length).fill(-1e9);
    starts.set(id, a);
  }
  return a;
}

export function react(id: string, kind: ReactionKind, at = nowSec()): void {
  slot(id)[KINDS.indexOf(kind)] = at;
}

/** 0..1 envelope of a reaction (fast attack, hold, soft release). */
export function reactionLevel(id: string, kind: ReactionKind, now: number): number {
  const a = starts.get(id);
  if (!a) return 0;
  const k = KINDS.indexOf(kind);
  const t = (now - a[k]) / REACTION_DURATION[kind];
  if (t < 0 || t >= 1) return 0;
  return Math.max(0, Math.min(1, t / 0.12, (1 - t) / 0.3));
}

export function clearReactions(): void {
  starts.clear();
}

// ── Who everybody is looking at ──

/** Most recent "speaker" (actor, challenger, blocker…) — characters glance at them for a while. */
export const focus = { id: null as string | null, until: 0 };

export function setFocus(id: string, seconds = 2.6): void {
  focus.id = id;
  focus.until = nowSec() + seconds;
}

/** World-space head positions, updated every frame by each character (and the camera for the local seat). */
export const headPositions = new Map<string, Vector3>();

export function headPosition(id: string): Vector3 {
  let v = headPositions.get(id);
  if (!v) {
    v = new Vector3(0, 1.4, 0);
    headPositions.set(id, v);
  }
  return v;
}

// ── Speech bubbles ──

export type BubbleTone = 'claim' | 'challenge' | 'block' | 'good' | 'bad' | 'emote' | 'info';

export interface Bubble {
  key: number;
  text: string;
  tone: BubbleTone;
}

type BubbleListener = (b: Bubble) => void;
const bubbleListeners = new Map<string, Set<BubbleListener>>();
let bubbleSeq = 1;

export const BUBBLE_MS = 2600;

export function showBubble(playerId: string, text: string, tone: BubbleTone): void {
  const set = bubbleListeners.get(playerId);
  if (!set) return;
  const b = { key: bubbleSeq++, text, tone };
  for (const fn of set) fn(b);
}

export function onBubble(playerId: string, fn: BubbleListener): () => void {
  let set = bubbleListeners.get(playerId);
  if (!set) {
    set = new Set();
    bubbleListeners.set(playerId, set);
  }
  set.add(fn);
  return () => {
    set!.delete(fn);
  };
}
