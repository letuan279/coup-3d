import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { NAME_MAX_LENGTH } from '@shared/constants';
import type { AvatarId } from '@shared/types';
import { useT } from '../../i18n';
import { api } from '../../net/socket';
import { useGame } from '../../store/useGame';
import { withToast } from '../apiToast';
import { AvatarPicker } from '../common/AvatarPicker';
import { Icon } from '../common/Icon';
import { useLobbyPlayer, useSelfId } from '../hooks';

/** Change own name / avatar while in the lobby (api.updatePlayer). */
export const ProfilePanel = memo(function ProfilePanel() {
  const t = useT();
  const youId = useSelfId();
  const me = useLobbyPlayer(youId);
  const players = useGame((s) => s.room?.players);
  const setProfile = useGame((s) => s.setProfile);
  const serverName = me?.name;
  const [name, setName] = useState(serverName ?? '');
  const savingRef = useRef(false);

  // Follow server-side renames (e.g. the " 2" suffix for duplicate names).
  useEffect(() => {
    if (serverName !== undefined) setName(serverName);
  }, [serverName]);

  const taken = useMemo<AvatarId[]>(
    () => (players ?? []).filter((p) => p.id !== youId).map((p) => p.avatar),
    [players, youId],
  );

  if (!me) return null;
  const trimmed = name.trim();
  const dirty = trimmed.length > 0 && trimmed !== me.name;

  const saveName = async () => {
    // Enter submits and the following blur would save again — one request at a time.
    if (!dirty || savingRef.current) return;
    savingRef.current = true;
    const res = await withToast(api.updatePlayer({ name: trimmed }));
    savingRef.current = false;
    if (res.ok) {
      setProfile({ name: trimmed });
      useGame.getState().toast('lobby.nameSaved', 'success');
    }
  };

  const pickAvatar = async (avatar: AvatarId) => {
    if (avatar === me.avatar) return;
    const res = await withToast(api.updatePlayer({ avatar }));
    if (res.ok) setProfile({ avatar });
  };

  return (
    <section className="lobby-card sticker">
      <h3 className="panel-title">{t('lobby.profile')}</h3>
      <form
        className="name-row"
        onSubmit={(e) => {
          e.preventDefault();
          void saveName();
        }}
      >
        <input
          className="input"
          value={name}
          maxLength={NAME_MAX_LENGTH}
          onChange={(e) => setName(e.target.value.slice(0, NAME_MAX_LENGTH))}
          onBlur={() => void saveName()}
          aria-label={t('home.nameLabel')}
          spellCheck={false}
        />
        <button type="submit" className="btn btn-teal btn-sm" disabled={!dirty}>
          <Icon name="check" size={18} />
          {t('lobby.save')}
        </button>
      </form>
      <AvatarPicker value={me.avatar} onChange={(a) => void pickAvatar(a)} taken={taken} size={31} />
    </section>
  );
});
