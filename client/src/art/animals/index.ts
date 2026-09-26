/** Avatar portrait composition: pastel sunny disc + the animal head. */
import type { AvatarId } from '@shared/types';
import { AVATAR_COLORS } from '../palette';
import { circle, clipped, ellipse, fill, glow, outline, sparkle, sunburst, type Ctx } from '../draw';
import { lighten, rgba } from '../color';
import { AL, C, type AnimalFn } from './common';
import { drawPig } from './pig';
import { drawFox } from './fox';
import { drawBulldog } from './bulldog';
import { drawBunny } from './bunny';
import { drawFrog } from './frog';
import { drawBear } from './bear';
import { drawCat } from './cat';
import { drawOwl } from './owl';

export { AVATAR_SIZE } from './common';

const HEADS: Record<AvatarId, AnimalFn> = {
  pig: drawPig,
  fox: drawFox,
  bulldog: drawBulldog,
  bunny: drawBunny,
  frog: drawFrog,
  bear: drawBear,
  cat: drawCat,
  owl: drawOwl,
};

/** Light background per animal, chosen to contrast with its fur. */
export const AVATAR_BACKGROUNDS: Record<AvatarId, string> = {
  pig: '#C9F2DF',
  fox: '#CBEAFF',
  bulldog: '#E4DBFF',
  bunny: '#FFD9E8',
  frog: '#FFEFB8',
  bear: '#D3F4DE',
  cat: '#FFE2C7',
  owl: '#FFF1BD',
};

const DISC_R = 118;

export function drawAvatar(g: Ctx, avatar: AvatarId): void {
  const bg = AVATAR_BACKGROUNDS[avatar];
  const disc = circle(C, C, DISC_R);
  fill(g, disc, bg);
  clipped(g, disc, () => {
    sunburst(g, C, C, DISC_R * 1.2, 16, rgba(lighten(bg, 0.55), 0.8), 0.1);
    glow(g, C, C - 10, 110, '#FFFFFF', 0.55);
    sparkle(g, 40, 92, 9, '#FFFFFF');
    sparkle(g, 214, 60, 7, '#FFFFFF');
    // Soft contact shadow under the head.
    fill(g, ellipse(C, 234, 80, 16), rgba('#2B2140', 0.1));
  });
  outline(g, disc, AL);
  HEADS[avatar](g, AVATAR_COLORS[avatar]);
}
