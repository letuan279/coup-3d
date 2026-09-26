/**
 * Pure helpers that turn the current GameView phase into localized sentences for the phase
 * banner / waiting indicator.
 */
import type { GameView, PhaseView } from '@shared/types';
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
