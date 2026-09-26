import { memo, useEffect, useRef } from 'react';
import { useGame } from '../../store/useGame';
import { useHud } from '../hudStore';
import { ActionBar } from './ActionBar';
import { Hand } from './Hand';
import { ResponsePanel } from './ResponsePanel';
import { TargetPicker } from './TargetPicker';
import { WaitingPanel } from './WaitingPanel';

type Mode = 'action' | 'target' | 'respond' | 'wait';

/** Bottom-centre zone (≤230px): own cards + coins + the current command area. */
export const Dock = memo(function Dock() {
  const promptKind = useGame((s) => s.game?.prompt?.kind ?? null);
  const targeting = useGame((s) => s.ui.targeting !== null);
  const shakeSeq = useHud((s) => s.shakeSeq);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || shakeSeq === 0) return;
    el.classList.remove('shake');
    void el.offsetWidth;
    el.classList.add('shake');
  }, [shakeSeq]);

  const mode: Mode =
    promptKind === 'choose_action'
      ? targeting
        ? 'target'
        : 'action'
      : promptKind === 'respond_action' || promptKind === 'respond_block'
        ? 'respond'
        : 'wait';

  return (
    <div ref={ref} className={`dock sticker interactive dock--${mode}`}>
      <Hand />
      <div className="dock__cmd" key={mode}>
        {mode === 'action' && <ActionBar />}
        {mode === 'target' && <TargetPicker />}
        {mode === 'respond' && <ResponsePanel />}
        {mode === 'wait' && <WaitingPanel />}
      </div>
    </div>
  );
});
