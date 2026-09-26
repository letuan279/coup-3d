/**
 * Tiny pub/sub for transient happenings that should trigger animations / sounds without
 * forcing React re-renders. CONTRACT FILE.
 *
 * - 'events': new public game events, emitted AFTER the store already holds the new view.
 *   Not emitted on resync (reconnect) — only live deltas.
 * - 'emote': a player sent an emote.
 * - 'moveRejected': the server rejected a local move (UI shows a toast / shake).
 */
import type { EmoteId, LoggedEvent } from '@shared/types';

export interface BusEvents {
  events: LoggedEvent[];
  emote: { playerId: string; emote: EmoteId };
  moveRejected: { error: string };
}

type Handler<K extends keyof BusEvents> = (payload: BusEvents[K]) => void;

const handlers: { [K in keyof BusEvents]?: Set<Handler<K>> } = {};

export function on<K extends keyof BusEvents>(type: K, fn: Handler<K>): () => void {
  let set = handlers[type] as Set<Handler<K>> | undefined;
  if (!set) {
    set = new Set();
    (handlers as Record<string, unknown>)[type] = set;
  }
  set.add(fn);
  return () => set!.delete(fn);
}

export function emit<K extends keyof BusEvents>(type: K, payload: BusEvents[K]): void {
  const set = handlers[type] as Set<Handler<K>> | undefined;
  if (!set) return;
  for (const fn of set) {
    try {
      fn(payload);
    } catch (err) {
      console.error(`[bus] handler for ${type} failed`, err);
    }
  }
}
