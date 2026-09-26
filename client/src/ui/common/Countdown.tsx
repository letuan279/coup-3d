import { memo, useEffect, useRef } from 'react';
import { useGame } from '../../store/useGame';
import { subscribeFrame } from './frameClock';

interface Props {
  className?: string;
  /** Show the remaining seconds next to the bar. */
  showSeconds?: boolean;
  /** Called once per whole-second change of the remaining time (e.g. to play ticks). */
  onSecond?: (secondsLeft: number) => void;
  /** Below this the bar turns red. */
  lowMs?: number;
}

/**
 * Countdown bar for the current phase (`game.deadline` / `game.phaseDurationMs`). Animated in a
 * shared rAF loop that writes `transform` directly — React only re-renders on a new deadline.
 */
export const Countdown = memo(function Countdown({ className, showSeconds = true, onSecond, lowMs = 5000 }: Props) {
  const deadline = useGame((s) => s.game?.deadline ?? null);
  const duration = useGame((s) => s.game?.phaseDurationMs ?? null);
  const rootRef = useRef<HTMLDivElement>(null);
  const fillRef = useRef<HTMLDivElement>(null);
  const labelRef = useRef<HTMLSpanElement>(null);
  const onSecondRef = useRef(onSecond);
  onSecondRef.current = onSecond;

  useEffect(() => {
    const root = rootRef.current;
    const fill = fillRef.current;
    if (!root || !fill) return;
    if (deadline == null || !duration) {
      fill.style.transform = 'scaleX(0)';
      root.classList.remove('is-low');
      if (labelRef.current) labelRef.current.textContent = '';
      return;
    }
    let lastSec = -1;
    let lastFrac = -1;
    let lastLow: boolean | null = null;
    return subscribeFrame((now) => {
      const left = Math.max(0, deadline - now);
      const frac = Math.min(1, left / duration);
      if (Math.abs(frac - lastFrac) > 0.0004) {
        fill.style.transform = `scaleX(${frac.toFixed(4)})`;
        lastFrac = frac;
      }
      const low = left < lowMs;
      if (low !== lastLow) {
        root.classList.toggle('is-low', low);
        lastLow = low;
      }
      const sec = Math.ceil(left / 1000);
      if (sec !== lastSec) {
        const first = lastSec === -1;
        lastSec = sec;
        if (labelRef.current) labelRef.current.textContent = `${sec}s`;
        if (!first) onSecondRef.current?.(sec);
      }
    });
  }, [deadline, duration, lowMs]);

  return (
    <div ref={rootRef} className={`countdown ${className ?? ''}`} role="timer">
      <div className="countdown__track">
        <div ref={fillRef} className="countdown__fill" />
      </div>
      {showSeconds && <span ref={labelRef} className="countdown__label" />}
    </div>
  );
});
