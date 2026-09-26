import { SceneRoot } from './scene/SceneRoot';
import { UIRoot } from './ui/UIRoot';

/**
 * Layering: the 3D tavern (SceneRoot) fills the window behind everything; the 2D HUD (UIRoot)
 * is an absolutely-positioned overlay on top. The scene is always mounted (home, lobby, game)
 * so it never re-initialises WebGL when screens change.
 */
export function App() {
  return (
    <div className="app-root">
      <div className="scene-layer">
        <SceneRoot />
      </div>
      <div className="ui-layer">
        <UIRoot />
      </div>
    </div>
  );
}
