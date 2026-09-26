import { memo } from 'react';
import { useT } from '../i18n';
import { reconnectHere } from '../net/socket';
import { useGame } from '../store/useGame';
import { Icon } from './common/Icon';
import { Modal } from './common/Modal';

/** Shown while the socket is not connected (initial connect or reconnecting). */
export const ConnectionBanner = memo(function ConnectionBanner() {
  const conn = useGame((s) => s.conn);
  const t = useT();
  if (conn === 'connected' || conn === 'replaced') return null;
  return (
    <div className={`conn-banner conn-banner--${conn}`} role="status">
      {conn === 'reconnecting' ? <Icon name="wifiOff" size={20} /> : <span className="spinner" />}
      <span>{t(conn === 'reconnecting' ? 'conn.reconnecting' : 'conn.connecting')}</span>
      {conn === 'reconnecting' && <span className="spinner" />}
    </div>
  );
});

/**
 * Blocking panel when this tab lost its session to another tab (the server closed this socket and
 * Socket.IO will not reconnect by itself). Playing here reconnects explicitly and takes it back.
 */
export const ReplacedPanel = memo(function ReplacedPanel() {
  const replaced = useGame((s) => s.conn === 'replaced');
  const t = useT();
  if (!replaced) return null;
  return (
    <Modal title={t('conn.replacedTitle')} className="confirm-modal replaced-modal" blocking>
      <div className="replaced-modal__body">
        <Icon name="wifiOff" size={34} />
        <div>
          <p className="confirm-modal__body">{t('conn.replacedBody')}</p>
          <p className="replaced-modal__hint">{t('conn.replacedHint')}</p>
        </div>
      </div>
      <div className="confirm-modal__buttons">
        <button type="button" className="btn btn-coral" onClick={reconnectHere} autoFocus>
          <Icon name="chevronRight" size={20} />
          {t('conn.playHere')}
        </button>
      </div>
    </Modal>
  );
});
