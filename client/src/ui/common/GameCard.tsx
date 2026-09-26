import { memo, type CSSProperties } from 'react';
import type { Character } from '@shared/types';
import { getCardBackUrl, getCardFaceUrl } from '../../art/cardArt';
import { useArtVersion } from '../../art/refresh';
import { useGame } from '../../store/useGame';

interface Props {
  /** null → card back. */
  character: Character | null;
  /** Face-up (lost) influence: greyed with a red X. */
  revealed?: boolean;
  width?: number;
  className?: string;
  style?: CSSProperties;
}

/** A playing card rendered from the canvas art (5:7). */
export const GameCard = memo(function GameCard({ character, revealed, width = 100, className, style }: Props) {
  const lang = useGame((s) => s.ui.lang);
  // Re-render (memo skips parent renders) when late web fonts redraw the art: fresh data URLs.
  useArtVersion();
  const src = character ? getCardFaceUrl(character, lang) : getCardBackUrl();
  const cls = ['game-card', revealed ? 'is-revealed' : '', className ?? ''].filter(Boolean).join(' ');
  return (
    <span className={cls} style={{ width, height: Math.round((width * 7) / 5), ...style }}>
      <img src={src} alt="" draggable={false} />
      {revealed && (
        <svg className="game-card__x" viewBox="0 0 100 140" preserveAspectRatio="none" aria-hidden="true">
          <path d="M18 22L82 118M82 22L18 118" />
        </svg>
      )}
    </span>
  );
});
