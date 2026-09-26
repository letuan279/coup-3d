/**
 * SCN-5: when late web fonts redraw the card art (art/refresh.ts), the HUD <img>s must pick up the
 * fresh data URLs — the Home card fan (memoised) and GameCard (memo component) included.
 *
 * No DOM here, so the refresh is simulated inside one server render: the mocked `useArtVersion`
 * returns 0, schedules a render-phase update, and on the re-render (hook state and useMemo caches
 * kept, as on a real client re-render) returns 1 with the art "redrawn". A component that does not
 * subscribe, or a memo that ignores the version, still shows the version-0 picture.
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ art: 0, hookCalls: 0 }));

vi.mock('../art/refresh', async () => {
  const { useState } = await import('react');
  return {
    useArtVersion: () => {
      h.hookCalls++;
      const [v, setV] = useState(0);
      if (v === 0) setV(1);
      else h.art = 1; // the fonts arrived and the canvases were redrawn
      return v;
    },
  };
});
vi.mock('../art/cardArt', () => ({
  getCardFaceUrl: (c: string, lang: string) => `face:${c}:${lang}:v${h.art}`,
  getCardBackUrl: () => `back:v${h.art}`,
  getCharacterIconUrl: (c: string) => `icon:${c}`,
}));
vi.mock('../art/avatars', () => ({ getAvatarUrl: (a: string) => `avatar:${a}` }));

import { useGame } from '../store/useGame';
import { GameCard } from './common/GameCard';
import { HomeScreen } from './home/HomeScreen';

function html(el: ReturnType<typeof createElement>): string {
  Object.assign(useGame.getInitialState(), useGame.getState());
  return renderToStaticMarkup(el);
}

beforeEach(() => {
  h.art = 0;
  h.hookCalls = 0;
  useGame.setState((s) => ({ room: null, game: null, invite: null, ui: { ...s.ui, lang: 'vi' } }));
});

describe('late-font art refresh reaches the HUD images', () => {
  it('the Home card fan re-reads the art (memo keyed on the art version)', () => {
    const out = html(createElement(HomeScreen));
    expect(h.hookCalls).toBeGreaterThan(0);
    for (const c of ['duke', 'assassin', 'contessa']) expect(out).toContain(`src="face:${c}:vi:v1"`);
    expect(out).not.toContain(':v0"');
  });

  it('GameCard (memo) re-renders with fresh face and back pictures', () => {
    expect(html(createElement(GameCard, { character: 'duke' }))).toContain('src="face:duke:vi:v1"');
    h.art = 0;
    expect(html(createElement(GameCard, { character: null }))).toContain('src="back:v1"');
  });
});
