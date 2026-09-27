/**
 * Pre-encodes the HUD's canvas art (card faces + back, character emblems, avatar portraits)
 * during idle time, so no <img> ever has to PNG-encode a canvas synchronously when it first
 * appears — that stalled the main thread for a frame or more exactly when a card was dealt,
 * claimed or revealed. One item per idle slice: drawing a card face is itself a few ms.
 *
 * Re-runs when the language changes (faces print their name) and after late web fonts
 * redraw the art (art/refresh.ts forgets the stale URLs).
 */
import { CHARACTERS, AVATARS } from '@shared/types';
import type { Lang } from '../store/useGame';
import { useGame } from '../store/useGame';
import { warmCardBackUrl, warmCardFaceUrl, warmCharacterIconUrl } from './cardArt';
import { warmAvatarUrl } from './avatars';
import { onArtRefresh } from './refresh';

type Job = () => Promise<void>;

/** Everything the HUD may show, most urgent first: your dealt hand comes before the rest. */
export function warmupJobs(lang: Lang): Job[] {
  return [
    ...CHARACTERS.map((c) => () => warmCardFaceUrl(c, lang)),
    warmCardBackUrl,
    ...CHARACTERS.map((c) => () => warmCharacterIconUrl(c)),
    ...AVATARS.map((a) => () => warmAvatarUrl(a)),
  ];
}

function idle(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestIdleCallback === 'function') requestIdleCallback(() => resolve(), { timeout: 500 });
    else setTimeout(resolve, 16);
  });
}

/** Runs jobs one per idle slice; a newer run (lang change, art refresh) supersedes an older one. */
export function startArtWarmup(): () => void {
  let run = 0;
  let stopped = false;
  const kick = () => {
    const mine = ++run;
    const lang = useGame.getState().ui.lang;
    void (async () => {
      for (const job of warmupJobs(lang)) {
        await idle();
        if (stopped || mine !== run) return;
        try {
          await job();
        } catch {
          // Warm-up is best effort: the getters still encode synchronously on demand.
        }
      }
    })();
  };
  kick();
  let lang = useGame.getState().ui.lang;
  const offLang = useGame.subscribe((s) => {
    if (s.ui.lang === lang) return;
    lang = s.ui.lang;
    kick();
  });
  const offRefresh = onArtRefresh(kick);
  return () => {
    stopped = true;
    offLang();
    offRefresh();
  };
}
