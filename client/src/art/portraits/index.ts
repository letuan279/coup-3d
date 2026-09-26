/** Portrait window content for each character: sunny background, backdrop props, then the bust. */
import type { Character } from '@shared/types';
import { CHARACTER_COLORS } from '../palette';
import { glow, sunburst, type Ctx } from '../draw';
import { lighten, rgba } from '../color';
import { drawDuke, drawDukeBackdrop } from './duke';
import { drawAssassin, drawAssassinBackdrop } from './assassin';
import { drawCaptain, drawCaptainBackdrop } from './captain';
import { drawAmbassador, drawAmbassadorBackdrop } from './ambassador';
import { drawContessa, drawContessaBackdrop } from './contessa';
import { CX, PH, PW } from './figure';

export { PW as PORTRAIT_W, PH as PORTRAIT_H } from './figure';

const PORTRAITS: Record<Character, { backdrop: (g: Ctx) => void; figure: (g: Ctx) => void }> = {
  duke: { backdrop: drawDukeBackdrop, figure: drawDuke },
  assassin: { backdrop: drawAssassinBackdrop, figure: drawAssassin },
  captain: { backdrop: drawCaptainBackdrop, figure: drawCaptain },
  ambassador: { backdrop: drawAmbassadorBackdrop, figure: drawAmbassador },
  contessa: { backdrop: drawContessaBackdrop, figure: drawContessa },
};

/** Draws into a PW × PH box at the current origin (the caller clips to the window shape). */
export function drawPortrait(g: Ctx, character: Character): void {
  const col = CHARACTER_COLORS[character];
  g.fillStyle = col.light;
  g.fillRect(0, 0, PW, PH);
  sunburst(g, CX, 170, PW, 20, rgba(lighten(col.light, 0.6), 0.75), 0.08);
  glow(g, CX, 170, 190, '#FFFFFF', 0.7);
  const p = PORTRAITS[character];
  g.save();
  p.backdrop(g);
  g.restore();
  g.save();
  p.figure(g);
  g.restore();
}
