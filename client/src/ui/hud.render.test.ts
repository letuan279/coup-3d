/**
 * Static renders of HUD pieces (react-dom/server, no DOM): lobby seats (clientflow-3 / -9 /
 * completeness-2), the response panel's B badge (clientflow-4) and pending-block wording, the
 * blocker's waiting panel, revealed-character pips (perf3d-4), the invite prompt (completeness-1)
 * and the "opened in another tab" panel (clientflow-1).
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GameView, LobbyPlayer, PhaseView, PlayerPublic, Prompt, RoomView } from '@shared/types';

vi.mock('../art/avatars', () => ({ getAvatarUrl: (a: string) => `avatar:${a}` }));
vi.mock('../art/cardArt', () => ({
  getCardFaceUrl: (c: string) => `face:${c}`,
  getCharacterIconUrl: (c: string) => `icon:${c}`,
  getCardBackUrl: () => 'back',
}));

import { useGame } from '../store/useGame';
import { ReplacedPanel } from './ConnectionBanner';
import { useHud } from './hudStore';
import { InvitePrompt } from './InvitePrompt';
import { LobbyScreen } from './lobby/LobbyScreen';
import { ResponsePanel } from './game/ResponsePanel';
import { TargetPicker } from './game/TargetPicker';
import { WaitingPanel } from './game/WaitingPanel';

/**
 * Server rendering reads zustand's *initial* state (the getServerSnapshot of useSyncExternalStore),
 * so copy the live state onto it before each render.
 */
function syncSsrSnapshot() {
  Object.assign(useGame.getInitialState(), useGame.getState());
  Object.assign(useHud.getInitialState(), useHud.getState());
}

const html = (c: Parameters<typeof createElement>[0]) => {
  syncSsrSnapshot();
  return renderToStaticMarkup(createElement(c as never));
};
const count = (s: string, needle: string) => s.split(needle).length - 1;
const text = (s: string) => s.replace(/<[^>]+>/g, '');

function setHost(hostname: string) {
  (globalThis as any).window = { location: { hostname, origin: `http://${hostname}:3000`, href: `http://${hostname}:3000/` } };
}

function lobbyPlayer(id: string, seat: number, name: string, extra: Partial<LobbyPlayer> = {}): LobbyPlayer {
  return { id, name, seat, kind: 'human', avatar: 'fox', connected: true, isHost: seat === 0, botControlled: false, left: false, wins: 0, ...extra };
}

function room(players: LobbyPlayer[], status: RoomView['status'] = 'lobby'): RoomView {
  return { code: 'KX7QP', hostId: 'p1', status, players, settings: { turnSeconds: 30, responseSeconds: 12 }, youId: 'p1', maxPlayers: 6, gameNumber: 1 };
}

function pub(id: string, name: string, seat: number, hand: [string | null, boolean][]): PlayerPublic {
  const influences = hand.map(([c, revealed], slot) => ({ slot, revealed, character: c as never }));
  const hiddenCount = influences.filter((i) => !i.revealed).length;
  return { id, name, seat, coins: 3, influences, hiddenCount, eliminated: hiddenCount === 0 };
}

function game(phase: PhaseView, prompt: Prompt | null, extra: Partial<GameView> = {}): GameView {
  return {
    viewerId: 'p1',
    players: [
      pub('p1', 'Tuấn', 0, [['duke', false], ['ambassador', false]]),
      pub('p2', 'Heo', 1, [[null, false], ['contessa', true]]),
      pub('p3', 'Mai', 2, [[null, false], [null, false]]),
      pub('p4', 'Gấu', 3, [[null, false], [null, false]]),
    ],
    deckCount: 5,
    treasury: 38,
    turn: 4,
    actorId: 'p2',
    pendingAction: null,
    pendingBlock: null,
    phase,
    phaseSeq: 12,
    prompt,
    winnerId: null,
    log: [],
    deadline: null,
    phaseDurationMs: null,
    serverNow: 0,
    ...extra,
  };
}

const lobby4 = [
  lobbyPlayer('p1', 0, 'Tuấn'),
  lobbyPlayer('p2', 1, 'Heo', { avatar: 'pig' }),
  lobbyPlayer('p3', 2, 'Mai', { avatar: 'bunny' }),
  lobbyPlayer('p4', 3, 'Gấu', { avatar: 'bear' }),
];

beforeEach(() => {
  setHost('192.168.1.5');
  useHud.setState({ moveInFlight: false, moveSeq: null });
  useGame.setState((s) => ({ conn: 'connected', room: null, game: null, invite: null, ui: { ...s.ui, lang: 'vi', targeting: null } }));
});

describe('lobby seats', () => {
  it('only the lowest empty seat (the one the server fills) offers "add bot"', () => {
    // Seat 2 was freed by a kick: seats 2, 5 and 6 are empty.
    const players = [
      lobbyPlayer('p1', 0, 'Tuấn'),
      lobbyPlayer('p2', 3, 'Cú Thông Thái 2', { kind: 'bot', botLevel: 'normal', avatar: 'owl' }),
      lobbyPlayer('p3', 2, 'Mai', { avatar: 'bunny' }),
    ];
    useGame.setState({ room: room(players) });
    const out = html(LobbyScreen);
    expect(count(out, 'seat-card is-empty')).toBe(3);
    expect(count(out, 'seat-card__add')).toBe(1);
    // …and it is on seat 2 (index 1), right after Tuấn's row.
    const firstEmpty = out.indexOf('seat-card is-empty');
    expect(out.slice(firstEmpty, out.indexOf('</li>', firstEmpty))).toContain('seat-card__add');
  });

  it('the bot badge sits on the status line so the name keeps the whole name line', () => {
    const players = [lobbyPlayer('p1', 0, 'Tuấn'), lobbyPlayer('p2', 1, 'Gấu Ngủ Đông', { kind: 'bot', botLevel: 'hard', avatar: 'bear' })];
    useGame.setState({ room: room(players) });
    const out = html(LobbyScreen);
    const nameLine = /<span class="seat-card__name"><span class="truncate" title="Gấu Ngủ Đông">Gấu Ngủ Đông<\/span><\/span>/;
    expect(out).toMatch(nameLine);
    const status = out.slice(out.indexOf('seat-card__status', out.indexOf('Gấu Ngủ Đông')));
    expect(text(status.slice(0, status.indexOf('</span></span>') + 14))).toContain('Bot · Khó');
  });

  it('warns that a localhost invite link only works on this computer', () => {
    useGame.setState({ room: room(lobby4) });
    expect(html(LobbyScreen)).not.toContain('code-hint');
    setHost('localhost');
    expect(text(html(LobbyScreen))).toContain('Link này chỉ mở được trên chính máy này (localhost)');
    setHost('127.0.0.1');
    expect(html(LobbyScreen)).toContain('code-hint');
  });
});

describe('response panel', () => {
  const steal = { type: 'steal' as const, actorId: 'p2', targetId: 'p1', claim: 'captain' as const };

  it('the B badge sits on the block the player really holds (Ambassador, not a Captain bluff)', () => {
    const phase: PhaseView = {
      kind: 'action_response',
      action: steal,
      responders: ['p1', 'p3', 'p4'],
      passed: [],
      canChallenge: true,
      blockers: ['p1'],
      blockCharacters: ['captain', 'ambassador'],
    };
    useGame.setState({ room: room(lobby4, 'playing'), game: game(phase, { kind: 'respond_action', canChallenge: true, blockCharacters: ['captain', 'ambassador'] }) });
    const out = html(ResponsePanel);
    const buttons = out.split('<button').slice(1);
    const captain = buttons.find((b) => b.includes('icon:captain'))!;
    const ambassador = buttons.find((b) => b.includes('icon:ambassador'))!;
    expect(captain).not.toContain('>B</kbd>');
    expect(captain).toContain('resp-btn__bluff');
    expect(ambassador).toContain('>B</kbd>');
    expect(ambassador).toContain('aria-keyshortcuts="B"');
  });

  it('with a block pending, a bystander is asked to challenge the ACTION', () => {
    const stealGau = { type: 'steal' as const, actorId: 'p2', targetId: 'p4', claim: 'captain' as const };
    const phase: PhaseView = {
      kind: 'action_response',
      action: stealGau,
      responders: ['p1', 'p3', 'p4'],
      passed: ['p4'],
      canChallenge: true,
      blockers: ['p4'],
      blockCharacters: ['captain', 'ambassador'],
    };
    useGame.setState({
      room: room(lobby4, 'playing'),
      game: game(phase, { kind: 'respond_action', canChallenge: true, blockCharacters: [] }, {
        pendingAction: stealGau,
        pendingBlock: { blockerId: 'p4', character: 'ambassador' },
      }),
    });
    const t = text(html(ResponsePanel));
    expect(t).toContain('Heo tuyên bố Thuyền trưởng để Cướp xu của Gấu — Gấu đã chặn bằng Đại sứ');
    expect(t).toContain('Bạn có thách thức Thuyền trưởng của Heo không?');
    expect(t).toContain('Thách thức');
    expect(t).toContain('Cho qua');
    expect(t).not.toContain('Chặn bằng');
  });
});

describe('waiting panel', () => {
  it('the blocker sees that they blocked and who may still challenge the action', () => {
    const phase: PhaseView = {
      kind: 'action_response',
      action: { type: 'steal', actorId: 'p2', targetId: 'p1', claim: 'captain' },
      responders: ['p1', 'p3', 'p4'],
      passed: ['p1'],
      canChallenge: true,
      blockers: ['p1'],
      blockCharacters: ['captain', 'ambassador'],
    };
    useGame.setState({ room: room(lobby4, 'playing'), game: game(phase, null, { pendingBlock: { blockerId: 'p1', character: 'ambassador' } }) });
    const t = text(html(WaitingPanel));
    expect(t).toContain('Bạn đã chặn');
    expect(t).not.toContain('Bạn đã cho qua');
    expect(t).toContain('Đang chờ Mai và Gấu quyết định có thách thức Heo không');
  });
});

describe('target picker', () => {
  it('lost pips show which character was revealed', () => {
    const choose: Prompt = {
      kind: 'choose_action',
      mustCoup: false,
      options: [{ action: 'coup', enabled: true, targets: ['p2', 'p3'], cost: 7 }],
    };
    useGame.setState((s) => ({ room: room(lobby4, 'playing'), game: game({ kind: 'turn', actorId: 'p1' }, choose), ui: { ...s.ui, targeting: 'coup' } }));
    const out = html(TargetPicker);
    expect(out).toContain('title="Đã lật: Nữ bá tước"');
    expect(out).toContain('--cc:var(--c-contessa)');
    expect(count(out, 'class="pip"')).toBe(3); // Heo's hidden card + Mai's two
  });
});

describe('invite / replaced panels', () => {
  it('asks before leaving the room the server re-attached us to', () => {
    useGame.setState({ room: room(lobby4, 'playing'), game: game({ kind: 'turn', actorId: 'p2' }, null), invite: { code: 'NEWXX' } });
    const t = text(html(InvitePrompt));
    expect(t).toContain('Bạn vẫn đang ở phòng KX7QP — rời phòng đó và vào NEWXX?');
    expect(t).toContain('bot sẽ chơi thay bạn');
    expect(t).toContain('Rời và vào NEWXX');
    useGame.setState({ invite: { code: 'KX7QP' } });
    expect(html(InvitePrompt)).toBe('');
  });

  it('a replaced tab gets a blocking "play in this tab" panel', () => {
    expect(html(ReplacedPanel)).toBe('');
    useGame.setState({ conn: 'replaced' });
    const out = html(ReplacedPanel);
    expect(out).toContain('is-blocking');
    expect(text(out)).toContain('Phiên đã mở ở tab khác');
    expect(text(out)).toContain('Chơi ở tab này');
  });
});
