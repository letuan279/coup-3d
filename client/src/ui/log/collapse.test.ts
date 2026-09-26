import { describe, expect, it } from 'vitest';
import type { GameEvent, LoggedEvent } from '@shared/types';
import { translate } from '../../i18n';
import { collapseLog } from './collapse';
import { describeEvent } from './describe';

function logOf(events: GameEvent[], firstSeq = 1): LoggedEvent[] {
  return events.map((e, i) => ({ ...e, seq: firstSeq + i, turn: 3 }) as LoggedEvent);
}

const players = [
  { id: 'a', name: 'Cáo' },
  { id: 'b', name: 'Ông Gấu' },
  { id: 'c', name: 'Mèo' },
];

describe('collapseLog', () => {
  it('shows one line per timed-out responder instead of "timeout" + "pass"', () => {
    const log = logOf([
      { type: 'action', actorId: 'a', action: 'foreign_aid' },
      { type: 'timeout', playerId: 'b', phase: 'action_response' },
      { type: 'pass', playerId: 'b' },
      { type: 'timeout', playerId: 'c', phase: 'action_response' },
      { type: 'pass', playerId: 'c' },
      { type: 'coins', from: 'treasury', to: 'a', amount: 2, reason: 'foreign_aid' },
    ]);
    const out = collapseLog(log);
    expect(out.map((e) => e.type)).toEqual(['action', 'timeout', 'timeout', 'coins']);
    // The timeout line keeps its own seq (used as the React key).
    expect(out[1].seq).toBe(2);
    const text = out.map((e) => describeEvent(e, players, (k, p) => translate('vi', k, p)).text);
    expect(text[1]).toBe('Ông Gấu hết giờ — tự động cho qua');
  });

  it('also collapses block_response timeouts but keeps real passes and other timeouts', () => {
    const log = logOf([
      { type: 'pass', playerId: 'c' }, // a real pass
      { type: 'timeout', playerId: 'b', phase: 'block_response' },
      { type: 'pass', playerId: 'b' },
      { type: 'timeout', playerId: 'a', phase: 'turn' },
      { type: 'action', actorId: 'a', action: 'income' }, // turn timeout + chosen action stay (informative)
      { type: 'timeout', playerId: 'b', phase: 'action_response' },
      { type: 'pass', playerId: 'c' }, // different player → not the default move of b
    ]);
    expect(collapseLog(log).map((e) => `${e.type}:${e.seq}`)).toEqual([
      'pass:1',
      'timeout:2',
      'timeout:4',
      'action:5',
      'timeout:6',
      'pass:7',
    ]);
  });

  it('keeps an orphan pass at the start of a trimmed log window', () => {
    const log = logOf([{ type: 'pass', playerId: 'b' }, { type: 'turn_start', playerId: 'c', turn: 4 }], 500);
    expect(collapseLog(log)).toBe(log); // untouched → same array (memo friendly)
  });
});
