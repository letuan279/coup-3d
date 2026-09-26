import { memo } from 'react';
import { useT } from '../../i18n';
import { useGame } from '../../store/useGame';
import { Icon } from './Icon';

/** VI / EN segmented switch. */
export const LangToggle = memo(function LangToggle({ compact }: { compact?: boolean }) {
  const lang = useGame((s) => s.ui.lang);
  const setLang = useGame((s) => s.setLang);
  const t = useT();
  return (
    <div className={`seg-toggle${compact ? ' is-compact' : ''}`} role="group" aria-label={t('hud.language')} title={t('hud.language')}>
      <button type="button" className={lang === 'vi' ? 'is-on' : ''} onClick={() => setLang('vi')} aria-pressed={lang === 'vi'}>
        VI
      </button>
      <button type="button" className={lang === 'en' ? 'is-on' : ''} onClick={() => setLang('en')} aria-pressed={lang === 'en'}>
        EN
      </button>
    </div>
  );
});

/** Speaker icon button toggling `ui.muted`. */
export const SoundToggle = memo(function SoundToggle() {
  const muted = useGame((s) => s.ui.muted);
  const toggleMute = useGame((s) => s.toggleMute);
  const t = useT();
  const label = muted ? t('ui.sound.off') : t('ui.sound.on');
  return (
    <button type="button" className={`icon-btn sticker-btn${muted ? ' is-muted' : ''}`} onClick={toggleMute} aria-label={label} title={label}>
      <Icon name={muted ? 'soundOff' : 'soundOn'} />
    </button>
  );
});

export const RulesButton = memo(function RulesButton({ withLabel }: { withLabel?: boolean }) {
  const setShowRules = useGame((s) => s.setShowRules);
  const t = useT();
  return (
    <button
      type="button"
      className={withLabel ? 'btn btn-ghost btn-sm' : 'icon-btn sticker-btn'}
      onClick={() => setShowRules(true)}
      aria-label={t('hud.rules')}
      title={t('hud.rules')}
    >
      <Icon name="book" />
      {withLabel && <span>{t('hud.rules')}</span>}
    </button>
  );
});
