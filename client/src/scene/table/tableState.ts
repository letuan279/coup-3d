/**
 * Mutable table-animation queues shared between the event director and the table objects.
 */
import type { Character } from '@shared/types';
import { DECK_POS, TABLE } from '../layout';
import { nowSec } from '../reactions';

/** Current top of the court deck (updated by CenterPile). */
export const deckTop = { x: DECK_POS[0], y: TABLE.feltY + 0.05, z: DECK_POS[1] };

export interface ReplaceAnim {
  character: Character;
  start: number;
}

/** `${playerId}:${slot}` → running card_replaced animation. */
export const replaceAnims = new Map<string, ReplaceAnim>();

export const REPLACE_DURATION = 2.1;

export function queueCardReplace(playerId: string, slot: number, character: Character): void {
  replaceAnims.set(`${playerId}:${slot}`, { character, start: nowSec() });
}

export interface ExchangeFlight {
  playerId: string;
  /** 'out' = deck → player (then held), 'back' = player → deck. */
  dir: 'out' | 'back';
  start: number;
  index: number;
}

export const exchangeFlights: ExchangeFlight[] = [];

export function queueExchangeDraw(playerId: string, count: number): void {
  exchangeFlights.length = 0;
  const t = nowSec();
  for (let i = 0; i < count; i++) exchangeFlights.push({ playerId, dir: 'out', start: t + i * 0.18, index: i });
}

export function queueExchangeReturn(playerId: string, count: number): void {
  const t = nowSec();
  exchangeFlights.length = 0;
  for (let i = 0; i < count; i++) exchangeFlights.push({ playerId, dir: 'back', start: t + i * 0.18, index: i });
}

export function easeInOut(t: number): number {
  const x = Math.max(0, Math.min(1, t));
  return x < 0.5 ? 2 * x * x : 1 - (-2 * x + 2) ** 2 / 2;
}
