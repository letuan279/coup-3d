import { memo, type ReactElement } from 'react';
import type { EmoteId } from '@shared/types';

const INK = '#2B2140';

const FACE_FILL: Record<EmoteId, string> = {
  laugh: '#FFD34D',
  angry: '#FF8A6B',
  think: '#FFD34D',
  liar: '#FFC24B',
  gg: '#9BE7C4',
  wow: '#8FD8FF',
  please: '#FFB8D4',
  cool: '#FFD34D',
};

const FEATURES: Record<EmoteId, ReactElement> = {
  laugh: (
    <>
      <path d="M10 13.5q2-2.5 4 0M18 13.5q2-2.5 4 0" />
      <path d="M9.5 18h13q-1 6-6.5 6t-6.5-6z" fill={INK} />
    </>
  ),
  angry: (
    <>
      <path d="M9 11l5 2.2M23 11l-5 2.2" />
      <circle cx="12.5" cy="15.5" r="1.3" fill={INK} />
      <circle cx="19.5" cy="15.5" r="1.3" fill={INK} />
      <path d="M11.5 23q4.5-3.5 9 0" />
    </>
  ),
  think: (
    <>
      <path d="M10 11.5q2.5-2 5 0M18 12h4" />
      <circle cx="12.5" cy="15" r="1.3" fill={INK} />
      <circle cx="20" cy="15" r="1.3" fill={INK} />
      <path d="M13 21.5q2.5-1.5 4 0t4-.5" />
    </>
  ),
  liar: (
    <>
      <path d="M10 14.5h4.5M17.5 14.5H22" />
      <path d="M16 16.5h10.5q1.2 1.3 0 2.5H16" fill="#FF9E6B" />
      <path d="M11.5 22.5q3 1.8 5.5 0" />
    </>
  ),
  gg: (
    <>
      <path d="M12.5 11.5v5M10 14h5M19.5 11.5v5M17 14h5" />
      <path d="M10.5 19.5q5.5 5.5 11 0" />
    </>
  ),
  wow: (
    <>
      <circle cx="12" cy="13.5" r="2.4" fill="#fff" />
      <circle cx="20" cy="13.5" r="2.4" fill="#fff" />
      <circle cx="12" cy="13.8" r="1" fill={INK} />
      <circle cx="20" cy="13.8" r="1" fill={INK} />
      <ellipse cx="16" cy="21.5" rx="2.4" ry="3" fill={INK} />
    </>
  ),
  please: (
    <>
      <circle cx="12" cy="14.5" r="2.8" fill={INK} />
      <circle cx="20" cy="14.5" r="2.8" fill={INK} />
      <circle cx="12.9" cy="13.5" r="1" fill="#fff" stroke="none" />
      <circle cx="20.9" cy="13.5" r="1" fill="#fff" stroke="none" />
      <path d="M13.5 22q2.5-1.6 5 0" />
      <path d="M8.5 18.5q-1 2 0 3 1 .6 1.4-.8z" fill="#8FD8FF" strokeWidth="1.4" />
    </>
  ),
  cool: (
    <>
      <path d="M8 12.5h16" />
      <path d="M9 12.5h6v2.5q-.3 2.5-3 2.5t-3-2.5zM17 12.5h6v2.5q-.3 2.5-3 2.5t-3-2.5z" fill={INK} />
      <path d="M13 22q3.5 1.6 7-1" />
    </>
  ),
};

/** Tiny cartoon face per emote (inline SVG). */
export const EmoteFace = memo(function EmoteFace({ emote, size = 34 }: { emote: EmoteId; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" className="emote-face">
      <circle cx="16" cy="16.5" r="13" fill={FACE_FILL[emote]} stroke={INK} strokeWidth="2.4" />
      <g fill="none" stroke={INK} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        {FEATURES[emote]}
      </g>
    </svg>
  );
});
