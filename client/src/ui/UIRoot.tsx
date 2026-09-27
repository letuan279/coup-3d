/**
 * Entry of the 2D HUD (owned by client/src/ui), layered over the always-mounted 3D scene.
 * Picks the screen from the store: no room → Home, lobby → Lobby, playing/finished → Game HUD.
 */
import '../styles/ui-base.css';
import '../styles/ui-screens.css';
import '../styles/ui-hud.css';
import '../styles/ui-responsive.css';
import { useEffect } from 'react';
import { useT } from '../i18n';
import { useGame } from '../store/useGame';
import { ConnectionBanner, ReplacedPanel } from './ConnectionBanner';
import { applyDocumentLang } from './documentLang';
import { GameHUD } from './game/GameHUD';
import { HomeScreen } from './home/HomeScreen';
import { InvitePrompt } from './InvitePrompt';
import { LobbyScreen } from './lobby/LobbyScreen';
import { RejoinPrompt } from './RejoinPrompt';
import { RulesModal } from './RulesModal';
import { SfxDirector } from './SfxDirector';
import { Toasts } from './Toasts';
import { useResponsiveAttributes } from './responsive';

type Screen = 'home' | 'lobby' | 'game' | 'dealing';

function DealingNotice() {
  const t = useT();
  return (
    <div className="screen dealing">
      <div className="sticker dealing__card pop-in">
        <span className="spinner" />
        {t('hud.dealing')}
      </div>
    </div>
  );
}

export function UIRoot() {
  const lang = useGame((s) => s.ui.lang);
  useEffect(() => applyDocumentLang(lang), [lang]);
  useResponsiveAttributes();

  const screen = useGame((s): Screen => {
    if (!s.room) return 'home';
    if (s.room.status === 'lobby') return 'lobby';
    return s.game ? 'game' : 'dealing';
  });

  return (
    <div className={`ui-root ui-root--${screen}`}>
      {screen === 'home' && <HomeScreen />}
      {screen === 'lobby' && <LobbyScreen />}
      {screen === 'game' && <GameHUD />}
      {screen === 'dealing' && <DealingNotice />}
      <RulesModal />
      <InvitePrompt />
      <RejoinPrompt />
      <Toasts />
      <ConnectionBanner />
      <ReplacedPanel />
      <SfxDirector />
    </div>
  );
}
