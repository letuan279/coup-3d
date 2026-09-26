import { memo } from 'react';
import { useT } from '../i18n';
import { useGame } from '../store/useGame';
import { Icon } from './common/Icon';

/** Stacked toasts from `ui.toasts` (text is an i18n key or a literal). */
export const Toasts = memo(function Toasts() {
  const toasts = useGame((s) => s.ui.toasts);
  const dismiss = useGame((s) => s.dismissToast);
  const t = useT();
  if (toasts.length === 0) return null;
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((x) => (
        <button key={x.id} type="button" className={`toast toast--${x.tone} pop-in`} onClick={() => dismiss(x.id)}>
          <span className="toast__dot" />
          <span className="toast__text">{t(x.text)}</span>
          <Icon name="close" size={16} />
        </button>
      ))}
    </div>
  );
});
