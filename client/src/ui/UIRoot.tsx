/**
 * Entry of the 2D HUD (owned by client/src/ui), layered over the always-mounted 3D scene.
 * Picks the screen from the store: no room → Home, lobby → Lobby, playing/finished → Game HUD.
 */
import '../styles/ui-base.css';
import '../styles/ui-screens.css';
import '../styles/ui-hud.css';
import { useT } from '../i18n';
import { useGame } from '../store/useGame';
import { ConnectionBanner } from './ConnectionBanner';
import { GameHUD } from './game/GameHUD';
import { HomeScreen } from './home/HomeScreen';
import { LobbyScreen } from './lobby/LobbyScreen';
import { RulesModal } from './RulesModal';
import { SfxDirector } from './SfxDirector';
import { Toasts } from './Toasts';

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
      <Toasts />
      <ConnectionBanner />
      <SfxDirector />
    </div>
  );
}
