/**
 * Game keyboard shortcuts: 1–7 actions (ACTION_TYPES order; digits pick targets / cards while
 * targeting or losing influence), C challenge, B block (a held block character first — see
 * hotkeyBlockCharacter), P / Space pass, Esc cancel / close. Reads the store at key time — no
 * subscriptions.
 */
import { useEffect } from 'react';
import { ACTION_TYPES } from '@shared/types';
import { useGame } from '../../store/useGame';
import { useHud } from '../hudStore';
import { hotkeyBlockCharacter, isMoveLocked, pickAction, pickTarget, respond, sendMove } from '../moves';

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT';
}

function digitOf(e: KeyboardEvent): number | null {
  const m = /^(?:Digit|Numpad)([1-9])$/.exec(e.code);
  return m ? Number(m[1]) : null;
}

/** Esc: close the innermost thing that is open. Returns true if something was closed. */
function escape(): boolean {
  const g = useGame.getState();
  const hud = useHud.getState();
  if (hud.leaveConfirm) {
    hud.set({ leaveConfirm: false });
  } else if (g.ui.showRules) {
    g.setShowRules(false);
  } else if (hud.menuOpen || hud.emoteOpen) {
    hud.set({ menuOpen: false, emoteOpen: false });
  } else if (g.ui.targeting) {
    g.cancelTargeting();
  } else {
    return false;
  }
  return true;
}

export function useHotkeys(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
      if (isTyping(e.target)) return;
      if (e.key === 'Escape') {
        if (escape()) e.preventDefault();
        return;
      }
      if (e.repeat) return;
      const s = useGame.getState();
      const hud = useHud.getState();
      if (hud.leaveConfirm || s.ui.showRules || isMoveLocked()) return;
      const prompt = s.game?.prompt;
      if (!prompt) return;
      const digit = digitOf(e);
      const key = e.key.toLowerCase();
      // A focused button would also "click" on Space — drop focus so only the hotkey acts.
      if (e.code === 'Space' && e.target instanceof HTMLButtonElement) e.target.blur();

      switch (prompt.kind) {
        case 'choose_action': {
          if (digit === null) return;
          const targeting = s.ui.targeting;
          if (targeting) {
            const opt = prompt.options.find((o) => o.action === targeting);
            const target = opt?.targets[digit - 1];
            if (target) pickTarget(targeting, target);
          } else {
            const action = ACTION_TYPES[digit - 1];
            const opt = action && prompt.options.find((o) => o.action === action);
            if (opt) pickAction(opt);
          }
          e.preventDefault();
          return;
        }
        case 'respond_action': {
          const me = s.game?.players.find((p) => p.id === s.game?.viewerId);
          const blockChar = hotkeyBlockCharacter(prompt.blockCharacters, me?.influences);
          if (key === 'c' && prompt.canChallenge) respond.challenge();
          else if (key === 'b' && blockChar) respond.block(blockChar);
          else if (key === 'p' || e.code === 'Space') respond.pass();
          else return;
          e.preventDefault();
          return;
        }
        case 'respond_block':
          if (key === 'c') respond.challenge();
          else if (key === 'p' || e.code === 'Space') respond.pass();
          else return;
          e.preventDefault();
          return;
        case 'lose_influence': {
          if (digit === null) return;
          const me = s.game?.players.find((p) => p.id === s.game?.viewerId);
          const slot = me?.influences[digit - 1]?.slot;
          if (slot !== undefined && prompt.slots.includes(slot)) void sendMove({ type: 'reveal', slot });
          e.preventDefault();
          return;
        }
        case 'exchange':
          return;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
