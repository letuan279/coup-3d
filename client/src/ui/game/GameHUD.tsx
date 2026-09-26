import { LogPanel } from '../log/LogPanel';
import { Dock } from './Dock';
import { EmotePicker } from './EmotePicker';
import { ExchangeModal } from './ExchangeModal';
import { GameOverOverlay } from './GameOver';
import { LoseInfluenceModal } from './LoseInfluenceModal';
import { PhaseBanner } from './PhaseBanner';
import { TopBar } from './TopBar';
import { useHotkeys } from './useHotkeys';
import { useMoveFeedback } from './useMoveFeedback';

/**
 * In-game HUD. Fixed zones keep the table centre visible: top strip, top-centre banner, right
 * log, bottom-centre dock, bottom-left emotes. Each child subscribes to its own slice of the
 * store, so this component itself never re-renders during play.
 */
export function GameHUD() {
  useHotkeys();
  useMoveFeedback();
  return (
    <div className="screen game-hud">
      <TopBar />
      <PhaseBanner />
      <LogPanel />
      <Dock />
      <EmotePicker />
      <LoseInfluenceModal />
      <ExchangeModal />
      <GameOverOverlay />
    </div>
  );
}
