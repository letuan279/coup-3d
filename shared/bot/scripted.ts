/**
 * Scripted "exploit" opponents for the simulator: fixed, simple strategies a human could adopt
 * against the bots (always lie, always call Contessa, always block steals, never challenge,
 * always challenge…).
 * They see exactly their own GameView, like any player. Used by `simulation.ts` to check that no
 * trivial script beats a harder level more easily than an easier one.
 *
 * Not part of the bot's public API and never imported by the server or client.
 */
import { ACTIONS } from '../constants';
import type { ActionOption, ActionType, Character, GameView, Move, Prompt } from '../types';
import { buildKnowledge } from './knowledge';

export type ScriptId =
  | 'liar'
  | 'contessaCaller'
  | 'stealBlocker'
  | 'honest'
  | 'dukeTellCaller'
  | 'alwaysChallenge'
  | 'challengeWhenHit';

export const SCRIPT_IDS: readonly ScriptId[] = [
  'liar',
  'contessaCaller',
  'stealBlocker',
  'honest',
  'dukeTellCaller',
  'alwaysChallenge',
  'challengeWhenHit',
];

export const SCRIPT_INFO: Readonly<Record<ScriptId, string>> = {
  liar: 'always Tax (Duke or not), block everything with the first blocker, never challenge',
  contessaCaller: 'honest, but challenges every Contessa block made by a player holding 2 cards',
  stealBlocker: 'honest, but blocks every steal (Captain bluff when it has no blocker)',
  honest: 'uses only real cards, blocks only with real cards, never challenges',
  dukeTellCaller: 'honest, but challenges Duke claims by players who declined Tax since their last hand change',
  alwaysChallenge: 'honest turns, but challenges every claim it can (every action claim and every block)',
  challengeWhenHit: 'honest turns, but challenges every claim that hits it (aimed at it, blocking it; heads-up: all)',
};

export type Script = (view: GameView, rand: () => number) => Move;

type ChoosePrompt = Extract<Prompt, { kind: 'choose_action' }>;

/** Keep order for exchanges and reveals: most useful first. */
const KEEP_ORDER: readonly Character[] = ['duke', 'assassin', 'captain', 'contessa', 'ambassador'];

function ownHidden(view: GameView): Character[] {
  const me = view.players.find((p) => p.id === view.viewerId);
  if (!me) return [];
  return me.influences.filter((i) => !i.revealed && i.character).map((i) => i.character as Character);
}

/** The strongest opponent: most hidden cards, then most coins. */
function strongest(view: GameView, ids: readonly string[]): string {
  let best = ids[0];
  let score = -Infinity;
  for (const id of ids) {
    const p = view.players.find((x) => x.id === id);
    if (!p) continue;
    const s = p.hiddenCount * 20 + p.coins;
    if (s > score) {
      score = s;
      best = id;
    }
  }
  return best;
}

function option(prompt: ChoosePrompt, action: ActionType): ActionOption | null {
  const o = prompt.options.find((x) => x.action === action);
  return o && o.enabled && (!ACTIONS[action].needsTarget || o.targets.length > 0) ? o : null;
}

function reveal(view: GameView, prompt: Extract<Prompt, { kind: 'lose_influence' }>): Move {
  const me = view.players.find((p) => p.id === view.viewerId);
  let slot = prompt.slots[0] ?? 0;
  let worst = -1;
  for (const s of prompt.slots) {
    const c = me?.influences.find((i) => i.slot === s)?.character;
    const rank = c ? KEEP_ORDER.indexOf(c) : 0;
    if (rank > worst) {
      worst = rank;
      slot = s;
    }
  }
  return { type: 'reveal', slot };
}

function exchange(prompt: Extract<Prompt, { kind: 'exchange' }>): Move {
  const order = prompt.cards
    .map((c, i) => ({ i, rank: KEEP_ORDER.indexOf(c) }))
    .sort((a, b) => a.rank - b.rank)
    .slice(0, prompt.keepCount)
    .map((x) => x.i)
    .sort((a, b) => a - b);
  return { type: 'exchange', keep: order };
}

/** Honest turn: coup when possible, then real Assassin, Duke, Captain; else Income. */
function honestAction(view: GameView, prompt: ChoosePrompt): Move {
  const own = ownHidden(view);
  const coup = option(prompt, 'coup');
  if (coup) return { type: 'action', action: 'coup', targetId: strongest(view, coup.targets) };
  const assassinate = option(prompt, 'assassinate');
  if (assassinate && own.includes('assassin')) {
    return { type: 'action', action: 'assassinate', targetId: strongest(view, assassinate.targets) };
  }
  if (own.includes('duke') && option(prompt, 'tax')) return { type: 'action', action: 'tax' };
  const steal = option(prompt, 'steal');
  if (steal && own.includes('captain')) {
    const rich = steal.targets.filter((id) => (view.players.find((p) => p.id === id)?.coins ?? 0) >= 2);
    if (rich.length > 0) return { type: 'action', action: 'steal', targetId: strongest(view, rich) };
  }
  return { type: 'action', action: 'income' };
}

/** Shared skeleton: `turn` picks the action, `respond` may override the honest response. */
function script(
  turn: (view: GameView, prompt: ChoosePrompt) => Move,
  respond: (view: GameView, prompt: Prompt) => Move | null,
): Script {
  return (view) => {
    const prompt = view.prompt;
    if (!prompt) return { type: 'pass' };
    const special = respond(view, prompt);
    if (special) return special;
    switch (prompt.kind) {
      case 'choose_action':
        return turn(view, prompt);
      case 'respond_action': {
        const own = ownHidden(view);
        const real = prompt.blockCharacters.find((c) => own.includes(c));
        return real ? { type: 'block', character: real } : { type: 'pass' };
      }
      case 'respond_block':
        return { type: 'pass' };
      case 'lose_influence':
        return reveal(view, prompt);
      case 'exchange':
        return exchange(prompt);
    }
  };
}

const honest: Script = script(honestAction, () => null);

const liar: Script = script(
  (view, prompt) => {
    const coup = option(prompt, 'coup');
    if (coup) return { type: 'action', action: 'coup', targetId: strongest(view, coup.targets) };
    return option(prompt, 'tax') ? { type: 'action', action: 'tax' } : { type: 'action', action: 'income' };
  },
  (_view, prompt) =>
    prompt.kind === 'respond_action' && prompt.blockCharacters.length > 0
      ? { type: 'block', character: prompt.blockCharacters[0] }
      : null,
);

const contessaCaller: Script = script(honestAction, (view, prompt) => {
  if (prompt.kind !== 'respond_block') return null;
  const block = view.pendingBlock;
  if (!block || block.character !== 'contessa') return null;
  const blocker = view.players.find((p) => p.id === block.blockerId);
  return blocker && blocker.hiddenCount >= 2 ? { type: 'challenge' } : null;
});

const stealBlocker: Script = script(honestAction, (view, prompt) => {
  if (prompt.kind !== 'respond_action' || view.pendingAction?.type !== 'steal') return null;
  if (prompt.blockCharacters.length === 0) return null;
  const own = ownHidden(view);
  const real = prompt.blockCharacters.find((c) => own.includes(c));
  return { type: 'block', character: real ?? prompt.blockCharacters[0] };
});

const dukeTellCaller: Script = script(honestAction, (view, prompt) => {
  let claimant: string | undefined;
  if (prompt.kind === 'respond_action' && prompt.canChallenge && view.pendingAction?.claim === 'duke') {
    claimant = view.pendingAction.actorId;
  } else if (prompt.kind === 'respond_block' && view.pendingBlock?.character === 'duke') {
    claimant = view.pendingBlock.blockerId;
  }
  if (!claimant || ownHidden(view).includes('duke')) return null;
  const intel = buildKnowledge(view).players.get(claimant);
  return intel?.declinedTax ? { type: 'challenge' } : null;
});

/** Whether the prompt lets the player challenge the pending claim. */
function canChallenge(prompt: Prompt): boolean {
  return (prompt.kind === 'respond_action' && prompt.canChallenge) || prompt.kind === 'respond_block';
}

const alwaysChallenge: Script = script(honestAction, (_view, prompt) =>
  canChallenge(prompt) ? { type: 'challenge' } : null,
);

/** The pending claim hits the viewer directly: aimed at it, blocking its action, or heads-up. */
function hitsMe(view: GameView, prompt: Prompt): boolean {
  const act = view.pendingAction;
  if (!act) return false;
  if (view.players.filter((p) => !p.eliminated).length <= 2) return true;
  return prompt.kind === 'respond_block' ? act.actorId === view.viewerId : act.targetId === view.viewerId;
}

const challengeWhenHit: Script = script(honestAction, (view, prompt) =>
  canChallenge(prompt) && hitsMe(view, prompt) ? { type: 'challenge' } : null,
);

export const SCRIPTS: Readonly<Record<ScriptId, Script>> = {
  liar,
  contessaCaller,
  stealBlocker,
  honest,
  dukeTellCaller,
  alwaysChallenge,
  challengeWhenHit,
};

export function isScriptId(x: string): x is ScriptId {
  return (SCRIPT_IDS as readonly string[]).includes(x);
}
