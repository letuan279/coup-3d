/**
 * Dev-only fixture mode: open the app with `?mock=<name>` to preview screens without a server.
 *
 *   ?mock=home | lobby | game | respond | block | blockresp | lose | exchange | waiting | six | over
 *   add `&events=1` to replay a scripted loop of game events on the bus (animation testing).
 *
 * Moves/emotes are logged to the console and acknowledged with ok.
 */
import type {
  AvatarId,
  Character,
  GameEvent,
  GameView,
  LobbyPlayer,
  LoggedEvent,
  PhaseView,
  PlayerPublic,
  Prompt,
  RoomView,
} from '@shared/types';
import { ACTIONS } from '@shared/constants';
import { useGame } from '../store/useGame';
import { emit } from '../net/bus';
import { setMockHandler } from '../net/socket';

export function mockNameFromUrl(): string | null {
  try {
    return new URL(window.location.href).searchParams.get('mock');
  } catch {
    return null;
  }
}

const SEATS: { id: string; name: string; avatar: AvatarId; kind: 'human' | 'bot' }[] = [
  { id: 'p1', name: 'Tuấn', avatar: 'fox', kind: 'human' },
  { id: 'p2', name: 'Bé Heo', avatar: 'pig', kind: 'bot' },
  { id: 'p3', name: 'Mai', avatar: 'bunny', kind: 'human' },
  { id: 'p4', name: 'Ông Gấu', avatar: 'bear', kind: 'bot' },
  { id: 'p5', name: 'Khoa', avatar: 'frog', kind: 'human' },
  { id: 'p6', name: 'Cú Mèo', avatar: 'owl', kind: 'bot' },
];

function lobbyPlayers(n: number): LobbyPlayer[] {
  return SEATS.slice(0, n).map((s, i) => ({
    id: s.id,
    name: s.name,
    seat: i,
    kind: s.kind,
    avatar: s.avatar,
    botLevel: s.kind === 'bot' ? (['easy', 'normal', 'hard'] as const)[i % 3] : undefined,
    connected: s.id !== 'p5',
    isHost: i === 0,
    botControlled: false,
    left: false,
    wins: i === 2 ? 2 : i === 0 ? 1 : 0,
  }));
}

function room(n: number, status: RoomView['status']): RoomView {
  return {
    code: 'KX7QP',
    hostId: 'p1',
    status,
    players: lobbyPlayers(n),
    settings: { turnSeconds: 30, responseSeconds: 12 },
    youId: 'p1',
    maxPlayers: 6,
    gameNumber: 3,
  };
}

type Hand = [Character | null, boolean, Character | null, boolean]; // char, revealed, char, revealed

function player(i: number, coins: number, hand: Hand): PlayerPublic {
  const s = SEATS[i];
  const influences = [
    { slot: 0, revealed: hand[1], character: hand[0] },
    { slot: 1, revealed: hand[3], character: hand[2] },
  ];
  const hiddenCount = influences.filter((x) => !x.revealed).length;
  return { id: s.id, name: s.name, seat: i, coins, influences, hiddenCount, eliminated: hiddenCount === 0 };
}

let seq = 1;
function ev(e: GameEvent, turn = 7): LoggedEvent {
  return { ...e, seq: seq++, turn } as LoggedEvent;
}

const baseLog: LoggedEvent[] = [
  ev({ type: 'turn_start', playerId: 'p4', turn: 6 }, 6),
  ev({ type: 'action', actorId: 'p4', action: 'steal', targetId: 'p2', claim: 'captain' }, 6),
  ev({ type: 'block', blockerId: 'p2', character: 'ambassador', actorId: 'p4', action: 'steal' }, 6),
  ev({ type: 'challenge', challengerId: 'p4', challengedId: 'p2', character: 'ambassador', against: 'block' }, 6),
  ev({ type: 'challenge_result', challengerId: 'p4', challengedId: 'p2', character: 'ambassador', challengedHadCard: false }, 6),
  ev({ type: 'influence_lost', playerId: 'p2', slot: 1, character: 'duke', reason: 'caught_bluffing' }, 6),
  ev({ type: 'coins', from: 'p2', to: 'p4', amount: 2, reason: 'steal' }, 6),
  ev({ type: 'action_resolved', actorId: 'p4', action: 'steal', targetId: 'p2' }, 6),
  ev({ type: 'turn_start', playerId: 'p5', turn: 7 }, 7),
  ev({ type: 'action', actorId: 'p5', action: 'income' }, 7),
  ev({ type: 'coins', from: 'treasury', to: 'p5', amount: 1, reason: 'income' }, 7),
  ev({ type: 'action_resolved', actorId: 'p5', action: 'income' }, 7),
];

function players(n: number): PlayerPublic[] {
  const all = [
    player(0, 4, ['duke', false, 'contessa', false]),
    player(1, 1, [null, false, 'duke', true]),
    player(2, 6, [null, false, null, false]),
    player(3, 5, [null, false, null, false]),
    player(4, 3, ['captain', true, null, false]),
    player(5, 0, ['assassin', true, 'ambassador', true]),
  ];
  return all.slice(0, n);
}

function chooseActionPrompt(coins: number): Prompt {
  const targets = ['p2', 'p3', 'p4', 'p5'];
  return {
    kind: 'choose_action',
    mustCoup: false,
    options: (Object.keys(ACTIONS) as (keyof typeof ACTIONS)[]).map((a) => {
      const def = ACTIONS[a];
      const enabled = coins >= def.cost;
      return {
        action: a,
        enabled,
        targets: def.needsTarget ? targets : [],
        claim: def.claim,
        cost: def.cost,
        disabledReason: enabled ? undefined : 'not_enough_coins',
      };
    }),
  };
}

function view(n: number, phase: PhaseView, prompt: Prompt | null, actorId: string, extra: Partial<GameView> = {}): GameView {
  const now = Date.now();
  const dur = phase.kind === 'turn' || phase.kind === 'exchange' ? 30000 : 12000;
  const pa = 'action' in phase ? phase.action : null;
  const pb = phase.kind === 'block_response' ? phase.block : null;
  return {
    viewerId: 'p1',
    players: players(n),
    deckCount: 3,
    treasury: 50 - players(n).reduce((a, p) => a + p.coins, 0),
    turn: 8,
    actorId,
    pendingAction: pa,
    pendingBlock: pb,
    phase,
    phaseSeq: 42,
    prompt,
    winnerId: null,
    log: baseLog,
    deadline: now + dur * 0.8,
    phaseDurationMs: dur,
    serverNow: now,
    ...extra,
  };
}

function fixture(name: string): { room: RoomView | null; game: GameView | null } {
  switch (name) {
    case 'home':
      return { room: null, game: null };
    case 'lobby':
      return { room: room(4, 'lobby'), game: null };
    case 'game':
      return {
        room: room(5, 'playing'),
        game: view(5, { kind: 'turn', actorId: 'p1' }, chooseActionPrompt(4), 'p1'),
      };
    case 'six':
      return {
        room: room(6, 'playing'),
        game: view(6, { kind: 'turn', actorId: 'p3' }, null, 'p3'),
      };
    case 'waiting': {
      const action = { type: 'tax' as const, actorId: 'p3', claim: 'duke' as const };
      return {
        room: room(5, 'playing'),
        game: view(
          5,
          { kind: 'action_response', action, responders: ['p1', 'p2', 'p4', 'p5'], passed: ['p1', 'p2'], canChallenge: true, blockers: [], blockCharacters: [] },
          null,
          'p3',
        ),
      };
    }
    case 'respond': {
      const action = { type: 'tax' as const, actorId: 'p3', claim: 'duke' as const };
      return {
        room: room(5, 'playing'),
        game: view(
          5,
          { kind: 'action_response', action, responders: ['p1', 'p2', 'p4', 'p5'], passed: ['p2'], canChallenge: true, blockers: [], blockCharacters: [] },
          { kind: 'respond_action', canChallenge: true, blockCharacters: [] },
          'p3',
        ),
      };
    }
    case 'block': {
      const action = { type: 'steal' as const, actorId: 'p4', targetId: 'p1', claim: 'captain' as const };
      return {
        room: room(5, 'playing'),
        game: view(
          5,
          {
            kind: 'action_response',
            action,
            responders: ['p1', 'p2', 'p3', 'p5'],
            passed: [],
            canChallenge: true,
            blockers: ['p1'],
            blockCharacters: ['captain', 'ambassador'],
          },
          { kind: 'respond_action', canChallenge: true, blockCharacters: ['captain', 'ambassador'] },
          'p4',
        ),
      };
    }
    case 'blockresp': {
      const action = { type: 'foreign_aid' as const, actorId: 'p1' };
      const block = { blockerId: 'p3', character: 'duke' as const };
      return {
        room: room(5, 'playing'),
        game: view(
          5,
          { kind: 'block_response', action, block, responders: ['p1', 'p2', 'p4', 'p5'], passed: ['p4'] },
          { kind: 'respond_block' },
          'p1',
        ),
      };
    }
    case 'lose': {
      const action = { type: 'assassinate' as const, actorId: 'p3', targetId: 'p1', claim: 'assassin' as const };
      return {
        room: room(5, 'playing'),
        game: view(
          5,
          { kind: 'lose_influence', playerId: 'p1', reason: 'assassinate', action, block: null },
          { kind: 'lose_influence', slots: [0, 1], reason: 'assassinate' },
          'p3',
        ),
      };
    }
    case 'exchange': {
      const action = { type: 'exchange' as const, actorId: 'p1', claim: 'ambassador' as const };
      return {
        room: room(5, 'playing'),
        game: view(
          5,
          { kind: 'exchange', actorId: 'p1', action },
          { kind: 'exchange', cards: ['duke', 'contessa', 'assassin', 'captain'], keepCount: 2 },
          'p1',
        ),
      };
    }
    case 'over': {
      const g = view(5, { kind: 'game_over', winnerId: 'p1' }, null, 'p1', {
        winnerId: 'p1',
        deadline: null,
        phaseDurationMs: null,
      });
      g.players = g.players.map((p) =>
        p.id === 'p1'
          ? p
          : {
              ...p,
              eliminated: true,
              hiddenCount: 0,
              influences: p.influences.map((inf) => ({ ...inf, revealed: true, character: inf.character ?? 'captain' })),
            },
      );
      return { room: room(5, 'finished'), game: g };
    }
    default:
      return { room: room(4, 'lobby'), game: null };
  }
}

/** Scripted event loop for animation testing (`&events=1`). */
function scriptedEvents(): LoggedEvent[][] {
  return [
    [ev({ type: 'turn_start', playerId: 'p3', turn: 8 }, 8)],
    [ev({ type: 'action', actorId: 'p3', action: 'tax', claim: 'duke' }, 8)],
    [ev({ type: 'challenge', challengerId: 'p4', challengedId: 'p3', character: 'duke', against: 'action' }, 8)],
    [
      ev({ type: 'challenge_result', challengerId: 'p4', challengedId: 'p3', character: 'duke', challengedHadCard: true, slot: 0 }, 8),
      ev({ type: 'card_replaced', playerId: 'p3', slot: 0, character: 'duke' }, 8),
    ],
    [ev({ type: 'influence_lost', playerId: 'p4', slot: 0, character: 'contessa', reason: 'wrong_challenge' }, 8)],
    [
      ev({ type: 'coins', from: 'treasury', to: 'p3', amount: 3, reason: 'tax' }, 8),
      ev({ type: 'action_resolved', actorId: 'p3', action: 'tax' }, 8),
    ],
    [ev({ type: 'turn_start', playerId: 'p4', turn: 9 }, 9)],
    [ev({ type: 'action', actorId: 'p4', action: 'steal', targetId: 'p1', claim: 'captain' }, 9)],
    [ev({ type: 'block', blockerId: 'p1', character: 'captain', actorId: 'p4', action: 'steal' }, 9)],
    [ev({ type: 'action_blocked', actorId: 'p4', action: 'steal', blockerId: 'p1', character: 'captain' }, 9)],
    [ev({ type: 'turn_start', playerId: 'p5', turn: 10 }, 10)],
    [
      ev({ type: 'action', actorId: 'p5', action: 'coup', targetId: 'p2' }, 10),
      ev({ type: 'coins', from: 'p5', to: 'treasury', amount: 7, reason: 'coup' }, 10),
    ],
    [
      ev({ type: 'influence_lost', playerId: 'p2', slot: 0, character: 'captain', reason: 'coup' }, 10),
      ev({ type: 'eliminated', playerId: 'p2' }, 10),
    ],
  ];
}

export function installMock(name: string) {
  const f = fixture(name);
  useGame.setState({ conn: 'connected', room: f.room, game: f.game, clockOffset: 0 });
  setMockHandler((call, payload) => {
    console.info('[mock api]', call, payload);
    if (call === 'game:emote' && payload && typeof payload === 'object') {
      emit('emote', { playerId: 'p1', emote: (payload as { emote: never }).emote });
    }
    return { ok: true, code: 'KX7QP' };
  });

  // Keep timers alive: restart the deadline whenever it expires.
  setInterval(() => {
    const g = useGame.getState().game;
    if (g && g.deadline != null && g.deadline < Date.now()) {
      useGame.setState({ game: { ...g, deadline: Date.now() + (g.phaseDurationMs ?? 12000), serverNow: Date.now() } });
    }
  }, 500);

  const params = new URL(window.location.href).searchParams;
  if (params.get('events')) {
    const script = scriptedEvents();
    let i = 0;
    setInterval(() => {
      const batch = script[i % script.length].map((e) => ({ ...e, seq: seq++ }));
      i++;
      const g = useGame.getState().game;
      if (g) useGame.setState({ game: { ...g, log: [...g.log, ...batch].slice(-120) } });
      emit('events', batch);
      if (i % 4 === 0) emit('emote', { playerId: ['p2', 'p3', 'p4'][i % 3], emote: (['liar', 'laugh', 'think'] as const)[i % 3] });
    }, 1800);
  }
}
