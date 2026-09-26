/**
 * SRV-SEAM-3: a page opened with a rejoin link asks "play your seat on this device?" with one
 * click to rejoin, instead of reclaiming by itself. Static renders (react-dom/server, no DOM).
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RoomView } from '@shared/types';

const h = vi.hoisted(() => ({ asked: false }));

vi.mock('../net/socket', () => ({
  isRejoinAsked: () => h.asked,
  onRejoinAsked: () => () => {},
  confirmRejoin: vi.fn(),
  declineRejoin: vi.fn(),
}));

import { useGame } from '../store/useGame';
import { RejoinPrompt } from './RejoinPrompt';

const html = () => {
  Object.assign(useGame.getInitialState(), useGame.getState());
  return renderToStaticMarkup(createElement(RejoinPrompt));
};
const text = (s: string) => s.replace(/<[^>]+>/g, '');

const seated: RoomView = {
  code: 'OLDYY',
  hostId: 'p1',
  status: 'playing',
  players: [],
  settings: { turnSeconds: 30, responseSeconds: 12 },
  youId: 'p1',
  maxPlayers: 6,
  gameNumber: 1,
};

beforeEach(() => {
  h.asked = false;
  useGame.setState((s) => ({ room: null, game: null, invite: { code: 'KX7QP', key: 'SECRET' }, ui: { ...s.ui, lang: 'vi' } }));
});

describe('rejoin link prompt', () => {
  it('stays hidden until net/socket asks (the server may still re-attach us)', () => {
    expect(html()).toBe('');
  });

  it('asks in Vietnamese and English, with [Vào lại] and [Để sau]', () => {
    h.asked = true;
    const vi = text(html());
    expect(vi).toContain('Chơi ghế của bạn trong phòng KX7QP trên thiết bị này?');
    expect(vi).toContain('Vào lại');
    expect(vi).toContain('Để sau');
    expect(vi).not.toContain('SECRET'); // the key is never displayed
    useGame.setState((s) => ({ ui: { ...s.ui, lang: 'en' } }));
    const en = text(html());
    expect(en).toContain('Play your seat in room KX7QP on this device?');
    expect(en).toContain('Rejoin');
    expect(en).toContain('Later');
  });

  it('shows a spinner and disables both buttons while the confirmed rejoin is in flight', () => {
    h.asked = true;
    useGame.setState({ invite: { code: 'KX7QP', key: 'SECRET', joining: true } });
    const out = html();
    expect(out).toContain('class="spinner"');
    expect(out.match(/disabled=""/g)).toHaveLength(2);
  });

  it('never shows without a key, or once seated (the invite prompt handles another room)', () => {
    h.asked = true;
    useGame.setState({ invite: { code: 'KX7QP' } });
    expect(html()).toBe('');
    useGame.setState({ invite: { code: 'KX7QP', key: 'SECRET' }, room: seated });
    expect(html()).toBe('');
  });
});
