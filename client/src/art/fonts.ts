/**
 * Web-font gate for the canvas art: card faces, the card back and the tavern sign print text
 * with the web fonts and are cached once drawn, so the app waits (bounded) for the fonts
 * before its first render. When that wait times out, whatever gets drawn meanwhile uses a
 * fallback font — it is redrawn in place (`onLate`, i.e. refreshArt) once the fonts are there.
 */
import { refreshArt } from './refresh';

/** Longest the first render waits for the fonts. */
export const FONT_WAIT_MS = 1500;

const WANTED = ['500 32px "Baloo 2"', '700 32px "Baloo 2"', '800 32px "Baloo 2"', '600 16px "Nunito"', '800 16px "Nunito"'];

/** The bits of `document.fonts` used here. */
export interface FontSource {
  load(font: string, text?: string): Promise<unknown>;
  readonly ready: Promise<unknown>;
}

/** Resolves when the fonts are loaded, or after `waitMs` — whichever comes first. */
export function waitForArtFonts(fonts: FontSource = document.fonts, waitMs = FONT_WAIT_MS, onLate: () => void = refreshArt): Promise<void> {
  // 'Aă' also pulls in the Vietnamese / latin-ext subsets.
  const load = Promise.all(WANTED.map((f) => fonts.load(f, 'Aă'))).then(
    () => true,
    () => false,
  );
  let late = false;
  const timeout = new Promise<void>((resolve) =>
    setTimeout(() => {
      late = true;
      resolve();
    }, waitMs),
  );
  void load.then(async (ok) => {
    if (!ok) return;
    await fonts.ready;
    if (late) onLate();
  });
  return Promise.race([load.then(() => undefined), timeout]);
}
