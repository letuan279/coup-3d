import type { ReactNode } from 'react';
import { Icon } from './Icon';

interface Props {
  title?: ReactNode;
  children: ReactNode;
  onClose?: () => void;
  className?: string;
  /** Lighter backdrop so the table stays visible (in-game decisions). */
  soft?: boolean;
  closeLabel?: string;
}

/** Centered sticker panel over a dimmed backdrop. Clicking the backdrop closes (if closable). */
export function Modal({ title, children, onClose, className, soft, closeLabel }: Props) {
  return (
    <div
      className={`modal-backdrop interactive${soft ? ' is-soft' : ''}`}
      onPointerDown={(e) => {
        if (onClose && e.target === e.currentTarget) onClose();
      }}
    >
      <div className={`modal sticker pop-in ${className ?? ''}`} role="dialog" aria-modal="true">
        {(title || onClose) && (
          <div className="modal__head">
            {title && <h2 className="modal__title">{title}</h2>}
            {onClose && (
              <button type="button" className="icon-btn" onClick={onClose} aria-label={closeLabel} title={closeLabel}>
                <Icon name="close" />
              </button>
            )}
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
