import { memo } from 'react';
import { AVATARS, type AvatarId } from '@shared/types';
import { useT } from '../../i18n';
import { Avatar } from './Avatar';

interface Props {
  value: AvatarId;
  onChange: (a: AvatarId) => void;
  /** Avatars used by other players (shown dimmed, not selectable). */
  taken?: readonly AvatarId[];
  size?: number;
}

export const AvatarPicker = memo(function AvatarPicker({ value, onChange, taken = [], size = 60 }: Props) {
  const t = useT();
  return (
    <div className="avatar-picker" role="radiogroup">
      {AVATARS.map((a) => {
        const isTaken = taken.includes(a) && a !== value;
        const name = t(`avatar.${a}`);
        return (
          <button
            key={a}
            type="button"
            role="radio"
            aria-checked={a === value}
            className={`avatar-pick${a === value ? ' is-on' : ''}${isTaken ? ' is-taken' : ''}`}
            disabled={isTaken}
            onClick={() => onChange(a)}
            title={isTaken ? `${name} — ${t('lobby.taken')}` : name}
          >
            <Avatar avatar={a} size={size} />
            <span className="avatar-pick__name">{name}</span>
          </button>
        );
      })}
    </div>
  );
});
