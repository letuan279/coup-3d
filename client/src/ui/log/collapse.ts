/**
 * Render-time clean-up of the public log (the raw log stays untouched: bots read claim history
 * from it and sounds/animations use the bus events).
 */
import type { LoggedEvent } from '@shared/types';

/**
 * A response that ran out of time is logged as `timeout` followed by the default move's own
 * `pass` for the same player. Keep only the timeout line ("X hết giờ — tự động cho qua").
 * Returns the input array itself when nothing was dropped (stable for memoisation).
 */
export function collapseLog(log: readonly LoggedEvent[]): readonly LoggedEvent[] {
  let out: LoggedEvent[] | null = null;
  for (let i = 0; i < log.length; i++) {
    const e = log[i];
    const prev = i > 0 ? log[i - 1] : undefined;
    const redundant =
      e.type === 'pass' &&
      prev?.type === 'timeout' &&
      prev.playerId === e.playerId &&
      (prev.phase === 'action_response' || prev.phase === 'block_response');
    if (redundant) {
      out ??= log.slice(0, i);
      continue;
    }
    out?.push(e);
  }
  return out ?? log;
}
