import { memo, type CSSProperties } from 'react';
import type { Character } from '@shared/types';
import { getCharacterIconUrl } from '../../art/cardArt';
import { useT } from '../../i18n';

interface Props {
  c: Character;
  /** Text next to the icon; defaults to the character's localized name. */
  label?: string;
  size?: 'sm' | 'md';
  /** Icon only (tooltip shows the name). */
  iconOnly?: boolean;
  className?: string;
}

export function charColorVar(c: Character): string {
  return `var(--c-${c})`;
}

/** Character-coloured pill with the round character emblem. */
export const CharChip = memo(function CharChip({ c, label, size = 'sm', iconOnly, className }: Props) {
  const t = useT();
  const name = label ?? t(`char.${c}`);
  const style = { '--cc': charColorVar(c) } as CSSProperties;
  return (
    <span className={`char-chip char-chip--${size}${iconOnly ? ' is-icon' : ''} ${className ?? ''}`} style={style} title={iconOnly ? name : undefined}>
      <img src={getCharacterIconUrl(c)} alt="" draggable={false} />
      {!iconOnly && <span className="char-chip__name">{name}</span>}
    </span>
  );
});
