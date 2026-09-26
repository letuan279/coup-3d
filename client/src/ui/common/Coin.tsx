import { memo } from 'react';

/** Mustard coin glyph (pure SVG). */
export const CoinIcon = memo(function CoinIcon({ size = 18 }: { size?: number }) {
  return (
    <svg className="coin-icon" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="13" r="9.5" fill="#E9A21F" stroke="#2B2140" strokeWidth="2.4" />
      <circle cx="12" cy="11" r="9.5" fill="#FFC24B" stroke="#2B2140" strokeWidth="2.4" />
      <circle cx="12" cy="11" r="5.6" fill="none" stroke="#E9A21F" strokeWidth="2" />
      <path d="M9.6 8.2c1.2-.9 3.4-.9 4.5.3" stroke="#FFF1C8" strokeWidth="1.8" strokeLinecap="round" fill="none" />
    </svg>
  );
});
