import { memo } from 'react';
import { RESPONSE_SECONDS_OPTIONS, TURN_SECONDS_OPTIONS } from '@shared/constants';
import type { BotLevel, RoomSettings } from '@shared/types';
import { useT } from '../../i18n';
import { api } from '../../net/socket';
import { useGame } from '../../store/useGame';
import { withToast } from '../apiToast';
import { Icon } from '../common/Icon';

const LEVELS: readonly BotLevel[] = ['easy', 'normal', 'hard'];

interface Props {
  isHost: boolean;
  full: boolean;
  botLevel: BotLevel;
  onBotLevel: (l: BotLevel) => void;
}

function SecondsPicker({
  label,
  options,
  value,
  field,
  readOnly,
}: {
  label: string;
  options: readonly number[];
  value: number;
  field: keyof RoomSettings;
  readOnly: boolean;
}) {
  const t = useT();
  return (
    <div className="field">
      <span className="field__label">
        <Icon name="clock" size={16} /> {label}
      </span>
      <div className="seg-toggle seg-toggle--wide" role="radiogroup" aria-label={label}>
        {options.map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={n === value}
            className={n === value ? 'is-on' : ''}
            disabled={readOnly && n !== value}
            onClick={() => {
              if (!readOnly && n !== value) void withToast(api.updateSettings({ [field]: n }));
            }}
          >
            {t('lobby.seconds', { n })}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Room settings: bots (host only) and timers (read-only for guests). */
export const HostPanel = memo(function HostPanel({ isHost, full, botLevel, onBotLevel }: Props) {
  const t = useT();
  const settings = useGame((s) => s.room?.settings);
  if (!settings) return null;

  return (
    <section className="lobby-card sticker">
      <h3 className="panel-title">{t('lobby.settings')}</h3>

      {isHost && (
        <div className="field">
          <span className="field__label">
            <Icon name="bot" size={16} /> {t('lobby.addBot')}
          </span>
          <div className="bot-row">
            <div className="seg-toggle" role="radiogroup" aria-label={t('lobby.botLevel')}>
              {LEVELS.map((l) => (
                <button
                  key={l}
                  type="button"
                  role="radio"
                  aria-checked={l === botLevel}
                  className={`lvl-${l}${l === botLevel ? ' is-on' : ''}`}
                  onClick={() => onBotLevel(l)}
                >
                  {t(`botLevel.${l}`)}
                </button>
              ))}
            </div>
            <button type="button" className="btn btn-violet btn-sm" disabled={full} onClick={() => void withToast(api.addBot(botLevel))}>
              <Icon name="plus" size={18} />
              {t('lobby.addBotShort')}
            </button>
          </div>
          <span className="field__hint">{t(`lobby.botHint.${botLevel}`)}</span>
        </div>
      )}

      <SecondsPicker label={t('lobby.turnTimer')} options={TURN_SECONDS_OPTIONS} value={settings.turnSeconds} field="turnSeconds" readOnly={!isHost} />
      <SecondsPicker
        label={t('lobby.responseTimer')}
        options={RESPONSE_SECONDS_OPTIONS}
        value={settings.responseSeconds}
        field="responseSeconds"
        readOnly={!isHost}
      />
      {!isHost && <p className="field__hint">{t('lobby.settingsReadonly')}</p>}
    </section>
  );
});
