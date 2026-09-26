import { memo } from 'react';
import { useT } from '../i18n';
import { useGame } from '../store/useGame';
import { Icon } from './common/Icon';

/** Shown while the socket is not connected (initial connect or reconnecting). */
export const ConnectionBanner = memo(function ConnectionBanner() {
  const conn = useGame((s) => s.conn);
  const t = useT();
  if (conn === 'connected') return null;
  return (
    <div className={`conn-banner conn-banner--${conn}`} role="status">
      {conn === 'reconnecting' ? <Icon name="wifiOff" size={20} /> : <span className="spinner" />}
      <span>{t(conn === 'reconnecting' ? 'conn.reconnecting' : 'conn.connecting')}</span>
      {conn === 'reconnecting' && <span className="spinner" />}
    </div>
  );
});
