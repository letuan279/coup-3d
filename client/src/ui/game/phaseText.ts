/**
 * Pure helpers that turn the current GameView phase into localized sentences for the phase
 * banner / waiting indicator.
 */
import type { DeclaredBlock, GameView, PhaseView } from '@shared/types';
import { describeEvent, type NamedPlayer } from '../log/describe';
import { formatSegs, seg, type Seg, type Translate } from '../log/rich';

export interface PhaseDescription {
  segs: Seg[];
  /** Player shown next to the sentence (actor, blocker, loser, winner…). */
  focusId: string | null;
  /** The sentence addresses the local player. */
  mine: boolean;
}

/** Players who still have to decide something in this phase. */
export function pendingDeciders(phase: PhaseView): string[] {
  switch (phase.kind) {
    case 'turn':
      return [phase.actorId];
    case 'action_response':
    case 'block_response':
      return phase.responders.filter((id) => !phase.passed.includes(id));
    case 'lose_influence':
      return [phase.playerId];
    case 'exchange':
      return [phase.actorId];
    case 'game_over':
      return [];
  }
}

/**
 * The block already declared while the action window is still open for the OTHER players to
 * challenge the action's claim (SPEC §1.1). null in every other situation.
 */
export function blockDuringActionWindow(g: Pick<GameView, 'phase' | 'pendingBlock'>): DeclaredBlock | null {
  return g.phase.kind === 'action_response' ? g.pendingBlock : null;
}

/**
 * "Heo tuyên bố Thuyền trưởng để Cướp xu của Gấu — Gấu đã chặn bằng Đại sứ": the declared action
 * followed by the block that is waiting for the action window to close.
 */
export function describeBlockedAction(g: GameView, block: DeclaredBlock, selfId: string | null, t: Translate): Seg[] {
  const players: readonly NamedPlayer[] = g.players;
  const a = g.phase.kind === 'action_response' ? g.phase.action : g.pendingAction;
  if (!a) return [];
  const d = describeEvent({ type: 'action', actorId: a.actorId, action: a.type, targetId: a.targetId, claim: a.claim }, players, t, {
    selfId,
  });
  const blocker = seg.player(block.blockerId, players.find((p) => p.id === block.blockerId)?.name ?? '???');
  return [...d.segs, { k: 'text', v: ' ' }, ...formatSegs(t('phase.blockedTail'), { blocker, char: seg.char(block.character, t) })];
}

export function describePhase(g: GameView, selfId: string | null, t: Translate): PhaseDescription {
  const players: readonly NamedPlayer[] = g.players;
  const P = (id: string): Seg => seg.player(id, players.find((p) => p.id === id)?.name ?? '???');
  const f = (key: string, params: Record<string, Seg | string | number> = {}) => formatSegs(t(key), params);
  const ph = g.phase;

  switch (ph.kind) {
    case 'turn': {
      if (ph.actorId === selfId) {
        const mustCoup = g.prompt?.kind === 'choose_action' && g.prompt.mustCoup;
        return { segs: f(mustCoup ? 'phase.turn.mustCoup' : 'phase.turn.self'), focusId: ph.actorId, mine: true };
      }
      return { segs: f('phase.turn.other', { player: P(ph.actorId) }), focusId: ph.actorId, mine: false };
    }
    case 'action_response': {
      const a = ph.action;
      const b = g.pendingBlock;
      if (b) {
        // Blocked already, but the others may still challenge the action's claim first.
        const params = { blocker: P(b.blockerId), actor: P(a.actorId), action: seg.action(a.type, t), char: seg.char(b.character, t) };
        if (b.blockerId === selfId) return { segs: f('phase.selfBlockPending', params), focusId: b.blockerId, mine: true };
        if (a.actorId === selfId) return { segs: f('phase.blockYouPending', params), focusId: b.blockerId, mine: false };
        return { segs: describeBlockedAction(g, b, selfId, t), focusId: a.actorId, mine: false };
      }
      if (a.actorId === selfId) {
        return { segs: f('phase.selfAction', { action: seg.action(a.type, t) }), focusId: a.actorId, mine: true };
      }
      const d = describeEvent(
        { type: 'action', actorId: a.actorId, action: a.type, targetId: a.targetId, claim: a.claim },
        players,
        t,
        { selfId },
      );
      return { segs: d.segs, focusId: a.actorId, mine: false };
    }
    case 'block_response': {
      const { action: a, block: b } = ph;
      const params = { blocker: P(b.blockerId), actor: P(a.actorId), action: seg.action(a.type, t), char: seg.char(b.character, t) };
      if (b.blockerId === selfId) return { segs: f('phase.selfBlock', params), focusId: b.blockerId, mine: true };
      if (a.actorId === selfId) return { segs: f('phase.blockYou', params), focusId: b.blockerId, mine: false };
      return { segs: f('log.block', params), focusId: b.blockerId, mine: false };
    }
    case 'lose_influence': {
      const reason = t(`reason.${ph.reason}`);
      if (ph.playerId === selfId) return { segs: f('phase.lose.self', { reason }), focusId: ph.playerId, mine: true };
      return { segs: f('phase.lose.other', { player: P(ph.playerId), reason }), focusId: ph.playerId, mine: false };
    }
    case 'exchange': {
      if (ph.actorId === selfId) {
        const n = g.prompt?.kind === 'exchange' ? g.prompt.keepCount : 0;
        return { segs: f(n === 1 ? 'phase.exchange.selfOne' : 'phase.exchange.self', { n }), focusId: ph.actorId, mine: true };
      }
      return { segs: f('phase.exchange.other', { player: P(ph.actorId) }), focusId: ph.actorId, mine: false };
    }
    case 'game_over': {
      if (ph.winnerId === selfId) return { segs: f('phase.over.self'), focusId: ph.winnerId, mine: true };
      return { segs: f('phase.over.other', { player: P(ph.winnerId) }), focusId: ph.winnerId, mine: false };
    }
  }
}

/** "Mai", "Mai và Khoa", "Mai, Khoa và 2 người khác". */
export function joinNames(names: readonly string[], t: Translate, max = 3): string {
  if (names.length === 0) return '';
  if (names.length === 1) return names[0];
  if (names.length <= max) {
    return t('ui.listAnd', { a: names.slice(0, -1).join(', '), b: names[names.length - 1] });
  }
  const shown = names.slice(0, max - 1).join(', ');
  return t('ui.listAnd', { a: shown, b: t('ui.nOthers', { n: names.length - (max - 1) }) });
}
