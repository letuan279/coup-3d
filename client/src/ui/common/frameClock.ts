/**
 * One shared requestAnimationFrame loop for HUD timers. Subscribers mutate DOM directly (no
 * React state), and the loop stops when nobody listens.
 */
import { serverNow } from '../../store/useGame';

type FrameFn = (serverTimeMs: number) => void;

const subs = new Set<FrameFn>();
let raf = 0;

function loop() {
  raf = 0;
  if (subs.size === 0) return;
  const now = serverNow();
  for (const fn of subs) fn(now);
  raf = requestAnimationFrame(loop);
}

export function subscribeFrame(fn: FrameFn): () => void {
  subs.add(fn);
  fn(serverNow());
  if (!raf) raf = requestAnimationFrame(loop);
  return () => {
    subs.delete(fn);
    if (subs.size === 0 && raf) {
      cancelAnimationFrame(raf);
      raf = 0;
    }
  };
}
