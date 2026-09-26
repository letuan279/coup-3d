/**
 * Transient speech bubble for one player (claims, challenges, blocks, emotes). Event-driven
 * state only: it re-renders when a bubble arrives or expires, never per frame.
 */
import { useEffect, useState } from 'react';
import { BUBBLE_MS, onBubble, type Bubble } from '../reactions';

export function SpeechBubble({ playerId, variant }: { playerId: string; variant?: 'local' }) {
  const [bubble, setBubble] = useState<Bubble | null>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const off = onBubble(playerId, (b) => {
      setBubble(b);
      clearTimeout(timer);
      timer = setTimeout(() => setBubble((cur) => (cur?.key === b.key ? null : cur)), BUBBLE_MS);
    });
    return () => {
      off();
      clearTimeout(timer);
    };
  }, [playerId]);

  if (!bubble) return null;
  return (
    <div key={bubble.key} className={`sc-bubble sc-bubble--${bubble.tone}${variant ? ` sc-bubble--${variant}` : ''}`}>
      {bubble.tone === 'challenge' && <span className="sc-bubble__bang">!</span>}
      {bubble.text}
    </div>
  );
}
