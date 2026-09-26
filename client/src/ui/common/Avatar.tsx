import { memo, useMemo } from 'react';
import type { AvatarId } from '@shared/types';
import { getAvatarUrl } from '../../art/avatars';

interface Props {
  avatar: AvatarId | undefined;
  size?: number;
  className?: string;
  /** Greyed out (eliminated / offline). */
  dim?: boolean;
  title?: string;
}

/** Round animal portrait from the canvas-drawn avatar art. */
export const Avatar = memo(function Avatar({ avatar, size = 48, className, dim, title }: Props) {
  const src = useMemo(() => (avatar ? getAvatarUrl(avatar) : null), [avatar]);
  const cls = ['avatar', dim ? 'is-dim' : '', className ?? ''].filter(Boolean).join(' ');
  return (
    <span className={cls} style={{ width: size, height: size }} title={title}>
      {src && <img src={src} alt="" draggable={false} />}
    </span>
  );
});
