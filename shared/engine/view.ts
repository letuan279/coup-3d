/**
 * Redacted per-viewer views (docs/SPEC.md §1.3): no card ids, no deck order, no other player's
 * hidden characters, no other player's exchange draw and no other player's deck knowledge.
 */
import type { DeclaredAction, GameState, GameView, LoggedEvent, PhaseView, PlayerPublic, PlayerState } from '../types';
import { getPromptFor } from './prompts';
import { findPlayer } from './state';

function playerView(p: PlayerState, isViewer: boolean): PlayerPublic {
  let hiddenCount = 0;
  const influences = p.influences.map((inf, slot) => {
    if (!inf.revealed) hiddenCount++;
    return { slot, revealed: inf.revealed, character: inf.revealed || isViewer ? inf.card.character : null };
  });
  return { id: p.id, name: p.name, seat: p.seat, coins: p.coins, influences, hiddenCount, eliminated: p.eliminated };
}

function requireAction(s: GameState): DeclaredAction {
  if (!s.pendingAction) throw new Error(`engine: phase ${s.phase.kind} without a pending action`);
  return { ...s.pendingAction };
}

function phaseView(s: GameState): PhaseView {
  const phase = s.phase;
  switch (phase.kind) {
    case 'turn':
      return { kind: 'turn', actorId: s.actorId };
    case 'action_response':
      return {
        kind: 'action_response',
        action: requireAction(s),
        responders: phase.responders.slice(),
        passed: phase.passed.slice(),
        canChallenge: phase.canChallenge,
        blockers: phase.blockers.slice(),
        blockCharacters: phase.blockCharacters.slice(),
      };
    case 'block_response': {
      if (!s.pendingBlock) throw new Error('engine: block_response without a pending block');
      return {
        kind: 'block_response',
        action: requireAction(s),
        block: { ...s.pendingBlock },
        responders: phase.responders.slice(),
        passed: phase.passed.slice(),
      };
    }
    case 'lose_influence':
      return {
        kind: 'lose_influence',
        playerId: phase.playerId,
        reason: phase.reason,
        action: s.pendingAction ? { ...s.pendingAction } : null,
        // The block this loss is about. A wrong challenge of the ACTION (→ after_action_proven)
        // can happen while a block is already pending (SPEC §1.1); that loss is not about the
        // block, so it is left out here (GameView.pendingBlock still carries it).
        block: s.pendingBlock && phase.then.kind !== 'after_action_proven' ? { ...s.pendingBlock } : null,
      };
    case 'exchange':
      return { kind: 'exchange', actorId: s.actorId, action: requireAction(s) };
    case 'game_over':
      return { kind: 'game_over', winnerId: s.winnerId ?? '' };
  }
}

function cloneEvent(e: LoggedEvent): LoggedEvent {
  return e.type === 'game_start' ? { ...e, playerIds: e.playerIds.slice() } : { ...e };
}

export function buildView(s: GameState, viewerId: string | null, opts?: { logLimit?: number }): GameView {
  const viewer = viewerId === null ? undefined : findPlayer(s, viewerId);
  const limit = opts?.logLimit;
  const log = limit !== undefined && limit >= 0 && limit < s.log.length ? s.log.slice(s.log.length - limit) : s.log;
  return {
    viewerId,
    players: s.players.map((p) => playerView(p, p === viewer)),
    // An in-progress exchange draw has already left s.deck.
    deckCount: s.deck.length,
    treasury: s.treasury,
    turn: s.turn,
    actorId: s.actorId,
    pendingAction: s.pendingAction ? { ...s.pendingAction } : null,
    pendingBlock: s.pendingBlock ? { ...s.pendingBlock } : null,
    // Private: only the viewer's own entry, never anyone else's.
    ...(viewer ? { knownInDeck: s.knownInDeck?.[viewer.id]?.slice() ?? [] } : {}),
    phase: phaseView(s),
    phaseSeq: s.phaseSeq,
    prompt: viewer ? getPromptFor(s, viewer.id) : null,
    winnerId: s.winnerId,
    log: log.map(cloneEvent),
    deadline: null,
    phaseDurationMs: null,
    serverNow: 0,
  };
}
