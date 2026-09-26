import {
  CARDS_PER_CHARACTER,
  INFLUENCES_PER_PLAYER,
  MAX_PLAYERS,
  MIN_PLAYERS,
  STARTING_COINS,
  TREASURY_COINS,
  TWO_PLAYER_FIRST_PLAYER_COINS,
} from '../constants';
import { CHARACTERS } from '../types';
import type { Card, GameState, PlayerState } from '../types';
import { emit, nextRandom, shuffleDeck } from './state';
import type { NewGameOptions } from './index';

/** The 15-card court deck with internal ids 'c0'..'c14' (never exposed to clients). */
function buildDeck(): Card[] {
  const deck: Card[] = [];
  for (const character of CHARACTERS) {
    for (let i = 0; i < CARDS_PER_CHARACTER; i++) deck.push({ id: `c${deck.length}`, character });
  }
  return deck;
}

function validateOptions(opts: NewGameOptions): void {
  const { players, firstPlayerId } = opts;
  if (players.length < MIN_PLAYERS || players.length > MAX_PLAYERS) {
    throw new Error(`createGame: need ${MIN_PLAYERS}..${MAX_PLAYERS} players, got ${players.length}`);
  }
  if (new Set(players.map((p) => p.id)).size !== players.length) throw new Error('createGame: duplicate player id');
  if (new Set(players.map((p) => p.seat)).size !== players.length) throw new Error('createGame: duplicate seat');
  if (firstPlayerId !== undefined && !players.some((p) => p.id === firstPlayerId)) {
    throw new Error(`createGame: unknown first player ${firstPlayerId}`);
  }
}

export function createGameState(opts: NewGameOptions): GameState {
  validateOptions(opts);
  const seated = opts.players.slice().sort((a, b) => a.seat - b.seat);

  const s: GameState = {
    rngState: opts.seed | 0,
    players: [],
    deck: buildDeck(),
    treasury: TREASURY_COINS,
    turn: 1,
    actorId: '',
    pendingAction: null,
    pendingBlock: null,
    knownInDeck: {},
    phase: { kind: 'turn' },
    phaseSeq: 1,
    log: [],
    nextEventSeq: 1,
    winnerId: null,
  };

  shuffleDeck(s);
  const firstPlayerId = opts.firstPlayerId ?? seated[Math.floor(nextRandom(s) * seated.length)].id;

  const hands: PlayerState['influences'][] = seated.map(() => []);
  for (let round = 0; round < INFLUENCES_PER_PLAYER; round++) {
    for (const hand of hands) hand.push({ card: s.deck.shift() as Card, revealed: false });
  }

  s.players = seated.map((p, i) => ({
    id: p.id,
    name: p.name,
    seat: p.seat,
    coins: seated.length === 2 && p.id === firstPlayerId ? TWO_PLAYER_FIRST_PLAYER_COINS : STARTING_COINS,
    influences: hands[i],
    eliminated: false,
  }));
  s.treasury = TREASURY_COINS - s.players.reduce((sum, p) => sum + p.coins, 0);
  s.actorId = firstPlayerId;

  emit(s, { type: 'game_start', playerIds: s.players.map((p) => p.id), firstPlayerId });
  emit(s, { type: 'turn_start', playerId: firstPlayerId, turn: 1 });
  return s;
}
