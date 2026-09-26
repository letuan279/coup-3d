import { memo, Fragment } from 'react';
import type { Seg } from '../log/rich';
import { CharChip } from './CharChip';
import { CoinIcon } from './Coin';

/** Renders rich segments: players bold (self highlighted), character chips, coin amounts. */
export const RichText = memo(function RichText({ segs, selfId }: { segs: readonly Seg[]; selfId?: string | null }) {
  return (
    <>
      {segs.map((s, i) => {
        switch (s.k) {
          case 'text':
            return <Fragment key={i}>{s.v}</Fragment>;
          case 'player':
            return (
              <b key={i} className={s.id === selfId ? 'rt-player is-self' : 'rt-player'}>
                {s.name}
              </b>
            );
          case 'char':
            return <CharChip key={i} c={s.c} label={s.name} />;
          case 'action':
            return (
              <b key={i} className="rt-action">
                {s.name}
              </b>
            );
          case 'coins':
            return (
              <span key={i} className="rt-coins">
                <CoinIcon size={14} />
                {s.label}
              </span>
            );
        }
      })}
    </>
  );
});
