/**
 * Tiny "rich text" model for localized sentences that embed players, character chips, action
 * names and coin amounts. Pure (no DOM) so it can be unit-tested and reused by the log, the
 * phase banner and the response panel.
 */
import type { ActionType, Character } from '@shared/types';

export type Seg =
  | { k: 'text'; v: string }
  | { k: 'player'; id: string; name: string }
  | { k: 'char'; c: Character; name: string }
  | { k: 'action'; a: ActionType; name: string }
  | { k: 'coins'; n: number; label: string };

export type SegParam = Seg | string | number;

export type Translate = (key: string, params?: Record<string, string | number>) => string;

const PLACEHOLDER = /\{(\w+)\}/g;

/**
 * Splits a template such as "{actor} claims {char}" into segments, replacing each placeholder
 * with the matching param. Unknown placeholders are kept verbatim so gaps are visible.
 */
export function formatSegs(template: string, params: Record<string, SegParam>): Seg[] {
  const out: Seg[] = [];
  let last = 0;
  for (const m of template.matchAll(PLACEHOLDER)) {
    const idx = m.index ?? 0;
    if (idx > last) out.push({ k: 'text', v: template.slice(last, idx) });
    const p = params[m[1]];
    if (p === undefined) out.push({ k: 'text', v: m[0] });
    else if (typeof p === 'string' || typeof p === 'number') out.push({ k: 'text', v: String(p) });
    else out.push(p);
    last = idx + m[0].length;
  }
  if (last < template.length) out.push({ k: 'text', v: template.slice(last) });
  return out;
}

export function segText(s: Seg): string {
  switch (s.k) {
    case 'text':
      return s.v;
    case 'coins':
      return s.label;
    default:
      return s.name;
  }
}

export function segsToText(segs: readonly Seg[]): string {
  return segs.map(segText).join('');
}

// ── Segment builders ──

export function coinsLabel(n: number, t: Translate): string {
  return `${n} ${n === 1 ? t('ui.coin') : t('common.coins')}`;
}

export const seg = {
  player(id: string, name: string): Seg {
    return { k: 'player', id, name };
  },
  char(c: Character, t: Translate): Seg {
    return { k: 'char', c, name: t(`char.${c}`) };
  },
  action(a: ActionType, t: Translate): Seg {
    return { k: 'action', a, name: t(`action.${a}`) };
  },
  coins(n: number, t: Translate): Seg {
    return { k: 'coins', n, label: coinsLabel(n, t) };
  },
};
