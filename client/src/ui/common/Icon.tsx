/**
 * Small inline SVG icon set (24×24, rounded ink strokes) so the HUD needs no icon font/assets.
 */
import { memo, type ReactElement } from 'react';

export type IconName =
  | 'menu'
  | 'close'
  | 'soundOn'
  | 'soundOff'
  | 'log'
  | 'book'
  | 'copy'
  | 'link'
  | 'crown'
  | 'bot'
  | 'trophy'
  | 'leave'
  | 'check'
  | 'globe'
  | 'smile'
  | 'wifiOff'
  | 'plus'
  | 'chevronLeft'
  | 'chevronRight'
  | 'users'
  | 'clock'
  | 'sword'
  | 'hand'
  | 'shield'
  | 'eye';

const PATHS: Record<IconName, ReactElement> = {
  menu: (
    <>
      <path d="M4 7h16M4 12h16M4 17h16" />
    </>
  ),
  close: <path d="M6 6l12 12M18 6L6 18" />,
  soundOn: (
    <>
      <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor" fillOpacity={0.15} />
      <path d="M15.5 9a4 4 0 010 6M18 6.5a7.5 7.5 0 010 11" />
    </>
  ),
  soundOff: (
    <>
      <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor" fillOpacity={0.15} />
      <path d="M16 9.5l5 5M21 9.5l-5 5" />
    </>
  ),
  log: (
    <>
      <rect x="5" y="3.5" width="14" height="17" rx="2.5" fill="currentColor" fillOpacity={0.12} />
      <path d="M8.5 8h7M8.5 12h7M8.5 16h4" />
    </>
  ),
  book: (
    <>
      <path d="M4 5.5c2.5-1 5.5-1 8 .8 2.5-1.8 5.5-1.8 8-.8v13c-2.5-1-5.5-1-8 .8-2.5-1.8-5.5-1.8-8-.8z" fill="currentColor" fillOpacity={0.12} />
      <path d="M12 6.3v13" />
    </>
  ),
  copy: (
    <>
      <rect x="8.5" y="8.5" width="11" height="11" rx="2.5" fill="currentColor" fillOpacity={0.12} />
      <path d="M15.5 5.5v-.5a1.5 1.5 0 00-1.5-1.5H6A1.5 1.5 0 004.5 5v8A1.5 1.5 0 006 14.5h.5" />
    </>
  ),
  link: (
    <>
      <path d="M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1" />
      <path d="M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1" />
    </>
  ),
  crown: <path d="M4 18h16l1-10-5 4-4-7-4 7-5-4z" fill="currentColor" fillOpacity={0.9} />,
  bot: (
    <>
      <rect x="5" y="8" width="14" height="11" rx="3" fill="currentColor" fillOpacity={0.12} />
      <path d="M12 8V4.5M9.5 13h.01M14.5 13h.01M9.5 16.2h5" />
      <circle cx="12" cy="4" r="1.2" fill="currentColor" />
    </>
  ),
  trophy: (
    <>
      <path d="M8 4.5h8v5a4 4 0 01-8 0z" fill="currentColor" fillOpacity={0.9} />
      <path d="M8 6H5a3 3 0 003 4M16 6h3a3 3 0 01-3 4M12 13.5v3M8.5 19.5h7M10 16.5h4v3h-4z" />
    </>
  ),
  leave: (
    <>
      <path d="M13 4.5H6.5A1.5 1.5 0 005 6v12a1.5 1.5 0 001.5 1.5H13" />
      <path d="M10.5 12h9M16.5 8.5L20 12l-3.5 3.5" />
    </>
  ),
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  globe: (
    <>
      <circle cx="12" cy="12" r="8.5" fill="currentColor" fillOpacity={0.12} />
      <path d="M3.5 12h17M12 3.5c2.6 2.4 3.6 5.2 3.6 8.5s-1 6.1-3.6 8.5c-2.6-2.4-3.6-5.2-3.6-8.5s1-6.1 3.6-8.5z" />
    </>
  ),
  smile: (
    <>
      <circle cx="12" cy="12" r="8.5" fill="currentColor" fillOpacity={0.12} />
      <path d="M8.5 14.5c1.8 2 5.2 2 7 0M9 9.8h.01M15 9.8h.01" />
    </>
  ),
  wifiOff: (
    <>
      <path d="M3.5 9a13 13 0 0117 0M6.5 12.3a8.5 8.5 0 0111 0M9.5 15.5a4 4 0 015 0M12 19h.01" />
      <path d="M4 4l16 16" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  chevronLeft: <path d="M14.5 6l-6 6 6 6" />,
  chevronRight: <path d="M9.5 6l6 6-6 6" />,
  users: (
    <>
      <circle cx="9" cy="8.5" r="3.2" fill="currentColor" fillOpacity={0.12} />
      <path d="M3.5 19c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5M15.5 5.5a3 3 0 010 6M17.5 14.3c1.7.6 2.8 2.2 3.1 4.7" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" fill="currentColor" fillOpacity={0.12} />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  sword: (
    <>
      <path d="M19.5 4.5l-9.5 9.5M19.5 4.5l-.5 4-2.5-.5-.5-2.5z" />
      <path d="M7 12l5 5M8.5 15.5l-4 4" />
    </>
  ),
  hand: (
    <path
      d="M8 11V5.5a1.5 1.5 0 013 0V10m0-5.5v-1a1.5 1.5 0 013 0V10m0-4.5a1.5 1.5 0 013 0V13c0 4-2.5 7-6.5 7-3 0-4.5-1.5-6-4l-1.6-2.8a1.4 1.4 0 012.3-1.5L8 13.5"
      fill="currentColor"
      fillOpacity={0.12}
    />
  ),
  shield: (
    <>
      <path d="M12 3.5l7 2.8v5.2c0 4.6-3 7.8-7 9-4-1.2-7-4.4-7-9V6.3z" fill="currentColor" fillOpacity={0.12} />
      <path d="M8.8 12l2.2 2.2 4.2-4.4" />
    </>
  ),
  eye: (
    <>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" fill="currentColor" fillOpacity={0.12} />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
};

export const Icon = memo(function Icon({ name, size = 22, className }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg
      className={className ? `icon ${className}` : 'icon'}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.4}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {PATHS[name]}
    </svg>
  );
});
