/**
 * Guards the HUD dictionary: both languages have the same keys, every key referenced by the UI
 * source exists, and every dynamic key family (errors, actions, phases…) is filled.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ACTION_TYPES, AVATARS, CHARACTERS, EMOTES } from '@shared/types';
import { core } from '../i18n/core';
import { scene } from '../i18n/scene';
import { ui } from '../i18n/ui';
import { CLIENT_ERRORS, errorKey, MOVE_ERRORS, SERVER_ERROR_CODES } from './errors';

const vi = { ...core.vi, ...ui.vi, ...scene.vi };
const en = { ...core.en, ...ui.en, ...scene.en };

function expectKey(key: string) {
  expect(vi[key], `vi missing "${key}"`).toBeTruthy();
  expect(en[key], `en missing "${key}"`).toBeTruthy();
}

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...sourceFiles(p));
    else if (/\.tsx?$/.test(name) && !name.endsWith('.test.ts')) out.push(p);
  }
  return out;
}

describe('ui dictionary', () => {
  it('vi and en define the same keys', () => {
    expect(Object.keys(ui.vi).sort()).toEqual(Object.keys(ui.en).sort());
  });

  it('placeholders match between languages', () => {
    const ph = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join(',');
    for (const k of Object.keys(ui.vi)) expect(ph(ui.en[k] ?? ''), k).toBe(ph(ui.vi[k]));
  });

  it('every literal t("…") key used by the HUD exists', () => {
    const dir = fileURLToPath(new URL('.', import.meta.url));
    const re = /\bt\(\s*'([a-zA-Z0-9_.]+)'/g;
    const keys = new Set<string>();
    for (const f of sourceFiles(dir)) {
      for (const m of readFileSync(f, 'utf8').matchAll(re)) keys.add(m[1]);
    }
    expect(keys.size).toBeGreaterThan(50);
    for (const k of keys) expectKey(k);
  });

  it('dynamic key families are complete', () => {
    for (const code of [...SERVER_ERROR_CODES, ...MOVE_ERRORS, ...CLIENT_ERRORS, 'something_else']) expectKey(errorKey(code));
    for (const a of ACTION_TYPES) {
      expectKey(`log.action.${a}`);
      expectKey(`rules.effect.${a}`);
      expectKey(`action.${a}`);
      expectKey(`actionDesc.${a}`);
    }
    for (const c of CHARACTERS) {
      expectKey(`char.${c}`);
      expectKey(`charAbility.${c}`);
    }
    for (const p of ['turn', 'action_response', 'block_response', 'lose_influence', 'exchange', 'game_over']) expectKey(`log.timeout.${p}`);
    for (const r of ['not_enough_coins', 'must_coup', 'no_targets']) expectKey(`act.disabled.${r}`);
    for (const l of ['easy', 'normal', 'hard']) {
      expectKey(`lobby.botHint.${l}`);
      expectKey(`botLevel.${l}`);
    }
    for (const r of ['coup', 'assassinate', 'wrong_challenge', 'caught_bluffing']) {
      expectKey(`lose.why.${r}`);
      expectKey(`reason.${r}`);
    }
    for (const e of EMOTES) expectKey(`emote.${e}`);
    for (const a of AVATARS) expectKey(`avatar.${a}`);
    for (const k of ['toast.kicked', 'toast.replaced', 'toast.roomDeleted']) expectKey(k);
  });
});
