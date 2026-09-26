import { memo, useSyncExternalStore } from 'react';
import { useT } from '../i18n';
import { confirmRejoin, declineRejoin, isRejoinAsked, onRejoinAsked } from '../net/socket';
import { useGame } from '../store/useGame';
import { Icon } from './common/Icon';
import { Modal } from './common/Modal';

/**
 * The tab was opened with a rejoin link (`/?room=CODE&key=KEY`) and is not seated anywhere: one
 * click takes the seat on this device. Never automatic (net/socket.ts `isRejoinAsked`): a stray
 * visit to the link must not pull the seat away from the device that is playing it.
 */
export const RejoinPrompt = memo(function RejoinPrompt() {
  const t = useT();
  const asked = useSyncExternalStore(onRejoinAsked, isRejoinAsked, isRejoinAsked);
  const code = useGame((s) => (!s.room && s.invite?.key ? s.invite.code : null));
  const joining = useGame((s) => !!s.invite?.joining);
  if (!asked || !code) return null;
  const vars = { code };

  return (
    <Modal title={t('rejoin.title', vars)} className="confirm-modal rejoin-modal">
      <p className="confirm-modal__body">{t('rejoin.body', vars)}</p>
      <div className="confirm-modal__buttons">
        <button type="button" className="btn btn-ghost" disabled={joining} onClick={declineRejoin}>
          {t('rejoin.later')}
        </button>
        <button type="button" className="btn btn-coral" disabled={joining} onClick={() => void confirmRejoin()}>
          {joining ? <span className="spinner" /> : <Icon name="chevronRight" size={20} />}
          {t('rejoin.confirm')}
        </button>
      </div>
    </Modal>
  );
});
