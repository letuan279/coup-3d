import { memo, useState } from 'react';
import { useT } from '../i18n';
import { acceptInvite, dismissInvite } from '../net/socket';
import { useGame } from '../store/useGame';
import { withToast } from './apiToast';
import { Icon } from './common/Icon';
import { Modal } from './common/Modal';

/**
 * The tab was opened with an invite link (?room=NEW) but the server re-attached this session to
 * the room it is still seated in (OLD). Ask instead of silently dropping the invite.
 */
export const InvitePrompt = memo(function InvitePrompt() {
  const t = useT();
  const conflict = useGame((s) => (s.room && s.invite && s.invite.code !== s.room.code ? s.invite.code : null));
  const oldCode = useGame((s) => s.room?.code ?? '');
  const playing = useGame((s) => s.room?.status === 'playing' && s.game?.phase.kind !== 'game_over');
  const [busy, setBusy] = useState(false);
  if (!conflict) return null;
  const names = { old: oldCode, new: conflict };

  return (
    <Modal title={t('invite.title', names)} className="confirm-modal invite-modal">
      <p className="confirm-modal__body">{t('invite.body', names)}</p>
      {playing && <p className="confirm-modal__warn">{t('invite.bodyPlaying', names)}</p>}
      <div className="confirm-modal__buttons">
        <button type="button" className="btn btn-ghost" disabled={busy} onClick={dismissInvite}>
          {t('invite.stay', names)}
        </button>
        <button
          type="button"
          className="btn btn-coral"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            await withToast(acceptInvite());
            setBusy(false);
          }}
        >
          {busy ? <span className="spinner" /> : <Icon name="leave" size={20} />}
          {t('invite.switch', names)}
        </button>
      </div>
    </Modal>
  );
});
