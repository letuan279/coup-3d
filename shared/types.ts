/**
 * Core domain types shared by engine, bots, server and client.
 *
 * CONTRACT FILE — other modules are written against these shapes. Do not rename or remove
 * fields. Adding optional fields is fine if every producer/consumer is updated.
 */

// ───────────────────────────── Cards & actions ─────────────────────────────

export type Character = 'duke' | 'assassin' | 'captain' | 'ambassador' | 'contessa';

export const CHARACTERS: readonly Character[] = ['duke', 'assassin', 'captain', 'ambassador', 'contessa'];

export type ActionType = 'income' | 'foreign_aid' | 'coup' | 'tax' | 'assassinate' | 'steal' | 'exchange';

export const ACTION_TYPES: readonly ActionType[] = [
  'income',
  'foreign_aid',
  'coup',
  'tax',
  'assassinate',
  'steal',
  'exchange',
];

export interface ActionDef {
  type: ActionType;
  /** Coins paid to the treasury when the action is declared. */
  cost: number;
  /** Character the actor claims to have (challengeable) — undefined for general actions. */
  claim?: Character;
  needsTarget: boolean;
  /** Characters that can block this action. Empty = unblockable. */
  blockedBy: Character[];
  /** Who may block: any other living player (foreign aid) or only the target (steal, assassinate). */
  blockableBy: 'anyone' | 'target' | null;
}

/** A physical card. `id` is internal to the server engine and MUST NEVER be sent to clients. */
export interface Card {
  id: string;
  character: Character;
}

// ───────────────────────────── Internal game state (server only) ─────────────────────────────

export interface Influence {
  card: Card;
  revealed: boolean;
}

export interface PlayerState {
  id: string;
  name: string;
  /** Seat index 0..5, stable for the whole game, turn order follows ascending seat. */
  seat: number;
  coins: number;
  /** Always exactly 2 slots after the deal; slot order is stable (slot = array index). */
  influences: Influence[];
  eliminated: boolean;
}

export interface DeclaredAction {
  type: ActionType;
  actorId: string;
  targetId?: string;
  /** Character claimed for this action (tax→duke, assassinate→assassin, steal→captain, exchange→ambassador). */
  claim?: Character;
}

export interface DeclaredBlock {
  blockerId: string;
  character: Character;
}

/**
 * Why a player is losing an influence.
 * - coup / assassinate: the action's effect
 * - wrong_challenge: the player challenged and the challenged player DID have the card
 * - caught_bluffing: the player was challenged and did NOT have the claimed card
 */
export type LossReason = 'coup' | 'assassinate' | 'wrong_challenge' | 'caught_bluffing';

/** What the engine does after a pending influence loss has been resolved. */
export type Continuation =
  /** Finish the turn (check win, advance to next living player). */
  | { kind: 'end_turn' }
  /** Actor proved the action's claim: open the target-only block window if the action is blockable and the target is still alive, else resolve the action. */
  | { kind: 'after_action_proven' }
  /** Perform the pending action's effect now (block failed / no block). */
  | { kind: 'resolve_action' };

export type Phase =
  /** Current actor must choose an action. */
  | { kind: 'turn' }
  /**
   * Other players react to the declared action. Every id in `responders` may pass, challenge
   * (if `canChallenge`) or block (if listed in `blockers`, with one of `blockCharacters`).
   * The first challenge ends the window. A block of a challengeable action (steal/assassinate)
   * while others have not answered yet is recorded in `pendingBlock` (blocker added to
   * `passed`) and the window stays open so the others can still challenge the ACTION; when
   * everyone has answered, a pending block goes to block_response, otherwise the action resolves.
   */
  | {
      kind: 'action_response';
      responders: string[];
      passed: string[];
      canChallenge: boolean;
      blockers: string[];
      blockCharacters: Character[];
    }
  /** Everyone except the blocker may challenge the pending block (or pass). All pass → action blocked. */
  | { kind: 'block_response'; responders: string[]; passed: string[] }
  /** `playerId` must choose one unrevealed influence to reveal (lose). */
  | { kind: 'lose_influence'; playerId: string; reason: LossReason; then: Continuation }
  /** Actor resolved an Ambassador exchange: chooses which cards to keep from hand + `drawn`. */
  | { kind: 'exchange'; drawn: Card[] }
  | { kind: 'game_over' };

export type PhaseKind = Phase['kind'];

export interface GameState {
  /** Mulberry32 state, advanced on every random draw so games are reproducible from the seed. */
  rngState: number;
  players: PlayerState[];
  /** Court deck; index 0 is the top. */
  deck: Card[];
  treasury: number;
  /** 1-based turn counter. */
  turn: number;
  /** Player whose turn it is. */
  actorId: string;
  pendingAction: DeclaredAction | null;
  /**
   * The declared block. Set as soon as the block is declared — possibly while the
   * action_response window is still open for the OTHER players to challenge the action itself
   * (see SPEC §1.1 "block while others may still challenge the action").
   */
  pendingBlock: DeclaredBlock | null;
  /**
   * Private knowledge: for each player, the characters they returned to the court deck with
   * their last Exchange that are provably still in the deck (cleared for everyone as soon as
   * anyone draws from the deck again). Optional for backwards compatibility.
   */
  knownInDeck?: Record<string, Character[]>;
  phase: Phase;
  /** Incremented on EVERY phase change (including a new response window). Clients echo it with moves to avoid stale input. */
  phaseSeq: number;
  log: LoggedEvent[];
  /** Next event sequence number (monotonic across the whole game). */
  nextEventSeq: number;
  winnerId: string | null;
}

// ───────────────────────────── Moves (player input) ─────────────────────────────

export type Move =
  | { type: 'action'; action: ActionType; targetId?: string }
  | { type: 'pass' }
  | { type: 'challenge' }
  | { type: 'block'; character: Character }
  /** Choose which influence slot to reveal when losing influence. */
  | { type: 'reveal'; slot: number }
  /** Exchange: indexes into `Prompt.exchange.cards` to keep; length must equal `keepCount`. */
  | { type: 'exchange'; keep: number[] };

export type MoveError =
  | 'game_over'
  | 'not_your_decision'
  | 'invalid_move'
  | 'invalid_target'
  | 'not_enough_coins'
  | 'must_coup'
  | 'stale_phase'
  | 'unknown_player';

// ───────────────────────────── Events (public log) ─────────────────────────────

/** Where coins move from/to. A player id or the treasury. */
export type CoinParty = string | 'treasury';

export type CoinReason = 'income' | 'foreign_aid' | 'tax' | 'steal' | 'coup' | 'assassinate' | 'refund' | 'eliminated';

/**
 * Public game events. Everything here is visible to every player — never include hidden
 * information (hidden characters, deck order, exchange draws, card ids).
 */
export type GameEvent =
  | { type: 'game_start'; playerIds: string[]; firstPlayerId: string }
  | { type: 'turn_start'; playerId: string; turn: number }
  | { type: 'action'; actorId: string; action: ActionType; targetId?: string; claim?: Character }
  | { type: 'pass'; playerId: string }
  | {
      type: 'challenge';
      challengerId: string;
      challengedId: string;
      character: Character;
      against: 'action' | 'block';
    }
  | {
      type: 'challenge_result';
      challengerId: string;
      challengedId: string;
      character: Character;
      /** true → challenged player revealed the card (challenger was wrong). */
      challengedHadCard: boolean;
      /** Slot of the proven card (only when challengedHadCard). */
      slot?: number;
    }
  /** A proven card was shown, shuffled into the deck and replaced by a new face-down card in the same slot. */
  | { type: 'card_replaced'; playerId: string; slot: number; character: Character }
  | { type: 'block'; blockerId: string; character: Character; actorId: string; action: ActionType }
  | { type: 'influence_lost'; playerId: string; slot: number; character: Character; reason: LossReason }
  | { type: 'eliminated'; playerId: string }
  | { type: 'coins'; from: CoinParty; to: CoinParty; amount: number; reason: CoinReason }
  | { type: 'exchange_draw'; playerId: string; count: number }
  | { type: 'exchange_done'; playerId: string; returned: number }
  | { type: 'action_resolved'; actorId: string; action: ActionType; targetId?: string }
  | { type: 'action_blocked'; actorId: string; action: ActionType; blockerId: string; character: Character }
  | { type: 'action_failed'; actorId: string; action: ActionType }
  /** The server applied a default move because the player's timer ran out. */
  | { type: 'timeout'; playerId: string; phase: PhaseKind }
  | { type: 'game_over'; winnerId: string };

export type GameEventType = GameEvent['type'];

export type LoggedEvent = GameEvent & { seq: number; turn: number };

// ───────────────────────────── Views (what a client / bot sees) ─────────────────────────────

export interface InfluenceView {
  slot: number;
  revealed: boolean;
  /** Visible if revealed, or if this is the viewer's own card. Otherwise null. */
  character: Character | null;
}

export interface PlayerPublic {
  id: string;
  name: string;
  seat: number;
  coins: number;
  influences: InfluenceView[];
  /** Number of unrevealed influences. */
  hiddenCount: number;
  eliminated: boolean;
}

export type PhaseView =
  | { kind: 'turn'; actorId: string }
  | {
      kind: 'action_response';
      action: DeclaredAction;
      responders: string[];
      passed: string[];
      canChallenge: boolean;
      blockers: string[];
      blockCharacters: Character[];
    }
  | { kind: 'block_response'; action: DeclaredAction; block: DeclaredBlock; responders: string[]; passed: string[] }
  | {
      kind: 'lose_influence';
      playerId: string;
      reason: LossReason;
      action: DeclaredAction | null;
      /** The block this loss is about (null when the loss comes from the action, e.g. a wrong challenge of the action's claim). */
      block: DeclaredBlock | null;
    }
  | { kind: 'exchange'; actorId: string; action: DeclaredAction }
  | { kind: 'game_over'; winnerId: string };

export interface ActionOption {
  action: ActionType;
  enabled: boolean;
  /** Legal target ids (only for targeted actions; empty otherwise). */
  targets: string[];
  claim?: Character;
  cost: number;
  disabledReason?: 'not_enough_coins' | 'must_coup' | 'no_targets';
}

/** The decision the viewer must/may make right now. null = nothing to do. */
export type Prompt =
  | { kind: 'choose_action'; options: ActionOption[]; mustCoup: boolean }
  /** Pass is always allowed. */
  | { kind: 'respond_action'; canChallenge: boolean; blockCharacters: Character[] }
  /** Challenge the block or pass. */
  | { kind: 'respond_block' }
  /** Slots (unrevealed) the viewer may reveal. */
  | { kind: 'lose_influence'; slots: number[]; reason: LossReason }
  /** `cards` = viewer's current hidden cards (in slot order) followed by the drawn cards. Keep exactly `keepCount`. */
  | { kind: 'exchange'; cards: Character[]; keepCount: number };

export type PromptKind = Prompt['kind'];

export interface GameView {
  /** null = spectator. */
  viewerId: string | null;
  players: PlayerPublic[];
  deckCount: number;
  treasury: number;
  turn: number;
  actorId: string;
  pendingAction: DeclaredAction | null;
  /**
   * Non-null during block_response, and ALSO during action_response when the target has already
   * blocked but other players may still challenge the action's claim (the target is then in
   * `passed`). UI: show "X blocked — waiting for others to challenge the action or allow".
   */
  pendingBlock: DeclaredBlock | null;
  /** Viewer-only: characters the viewer knows are in the court deck (returned by their own Exchange, until the next draw). */
  knownInDeck?: Character[];
  phase: PhaseView;
  phaseSeq: number;
  prompt: Prompt | null;
  winnerId: string | null;
  /** Public log (possibly truncated to the most recent entries). */
  log: LoggedEvent[];
  /** Epoch ms when the current phase auto-resolves (filled by the server; null from the engine). */
  deadline: number | null;
  /** Total duration of the current phase timer in ms (filled by the server). */
  phaseDurationMs: number | null;
  /** Server clock at send time, for client clock-offset correction (filled by the server). */
  serverNow: number;
}

// ───────────────────────────── Lobby / room ─────────────────────────────

export type AvatarId = 'pig' | 'fox' | 'bulldog' | 'bunny' | 'frog' | 'bear' | 'cat' | 'owl';

export const AVATARS: readonly AvatarId[] = ['pig', 'fox', 'bulldog', 'bunny', 'frog', 'bear', 'cat', 'owl'];

export type BotLevel = 'easy' | 'normal' | 'hard';

export type SeatKind = 'human' | 'bot';

export interface LobbyPlayer {
  id: string;
  name: string;
  seat: number;
  kind: SeatKind;
  avatar: AvatarId;
  /** Only for kind === 'bot'. */
  botLevel?: BotLevel;
  /** Humans: socket currently connected. Bots: always true. */
  connected: boolean;
  isHost: boolean;
  /** Human seat currently being played by a bot (disconnected past the grace period, or left mid-game). */
  botControlled: boolean;
  /** Human left the room mid-game — the seat stays bot-controlled until the game ends. */
  left: boolean;
  /** Wins in this room across games. */
  wins: number;
}

export interface RoomSettings {
  turnSeconds: number;
  responseSeconds: number;
}

export type RoomStatus = 'lobby' | 'playing' | 'finished';

export interface RoomView {
  code: string;
  hostId: string;
  status: RoomStatus;
  players: LobbyPlayer[];
  settings: RoomSettings;
  /** The receiving client's own player id. */
  youId: string;
  /**
   * Secret for the receiving player's own (human) seat. Lets them reclaim the seat from another
   * device/browser with `room:join {code, rejoinKey}` (share link: `/?room=CODE&key=KEY`). Never
   * sent to anyone else.
   */
  rejoinKey?: string;
  maxPlayers: number;
  /** Increments each time a game starts. */
  gameNumber: number;
}

export type EmoteId = 'laugh' | 'angry' | 'think' | 'liar' | 'gg' | 'wow' | 'please' | 'cool';

export const EMOTES: readonly EmoteId[] = ['laugh', 'angry', 'think', 'liar', 'gg', 'wow', 'please', 'cool'];
