/**
 * i18n (Vietnamese default, English optional). CONTRACT FILE.
 *
 * Dictionaries are split by owner to avoid edit conflicts:
 *   core.ts  – shared vocabulary (characters, actions, reasons, common words)
 *   ui.ts    – everything the 2D HUD needs (owned by the UI)
 *   scene.ts – in-world labels/bubbles (owned by the 3D scene)
 * Keys are dot-separated strings; `{name}` placeholders are interpolated from params.
 * A missing key falls back to English, then to the key itself.
 */
import { useCallback } from 'react';
import type { ActionType, Character } from '@shared/types';
import { useGame, type Lang } from '../store/useGame';
import { core } from './core';
import { ui } from './ui';
import { scene } from './scene';

export type Dict = Record<string, string>;
export interface DictPair {
  vi: Dict;
  en: Dict;
}

const dicts: Record<Lang, Dict> = {
  vi: { ...core.vi, ...ui.vi, ...scene.vi },
  en: { ...core.en, ...ui.en, ...scene.en },
};

export type Params = Record<string, string | number>;

export function translate(lang: Lang, key: string, params?: Params): string {
  let s = dicts[lang][key] ?? dicts.en[key] ?? key;
  if (params) {
    for (const k in params) s = s.split(`{${k}}`).join(String(params[k]));
  }
  return s;
}

/** Non-hook translate using the current store language (for event handlers, canvas drawing, etc.). */
export function t(key: string, params?: Params): string {
  return translate(useGame.getState().ui.lang, key, params);
}

/** React hook: re-renders when the language changes. */
export function useT(): (key: string, params?: Params) => string {
  const lang = useGame((s) => s.ui.lang);
  return useCallback((key: string, params?: Params) => translate(lang, key, params), [lang]);
}

export const charKey = (c: Character) => `char.${c}`;
export const actionKey = (a: ActionType) => `action.${a}`;
