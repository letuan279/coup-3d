import { inviteLink as makeInviteLink, isLocalHostname, rejoinLink as makeRejoinLink } from '../net/links';
import { useGame } from '../store/useGame';

/** Copies text and shows a toast. Falls back to a hidden textarea when the async API is blocked. */
export async function copyText(text: string): Promise<void> {
  const { toast } = useGame.getState();
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      legacyCopy(text);
    }
    toast('ui.copied', 'success');
  } catch {
    try {
      legacyCopy(text);
      toast('ui.copied', 'success');
    } catch {
      toast('ui.copyFailed', 'error');
    }
  }
}

function legacyCopy(text: string) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  const ok = document.execCommand('copy');
  document.body.removeChild(ta);
  if (!ok) throw new Error('copy failed');
}

export function inviteLink(code: string): string {
  return makeInviteLink(window.location.origin, code);
}

/** Secret "rejoin from another device" link for your own seat. */
export function rejoinLink(code: string, key: string): string {
  return makeRejoinLink(window.location.origin, code, key);
}

/** The page is opened via localhost, so a copied link only works on this computer. */
export function servedFromLocalhost(): boolean {
  try {
    return isLocalHostname(window.location.hostname);
  } catch {
    return false;
  }
}
