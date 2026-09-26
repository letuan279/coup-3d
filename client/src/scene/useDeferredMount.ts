import { useEffect, useState } from 'react';

/**
 * True one animation frame after mount. drei <Html> creates its own React root; mounting it
 * in the same commit as the Canvas makes StrictMode unmount that root synchronously during a
 * render (a console error), so labels mount a frame later instead.
 */
export function useDeferredMount(): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(id);
  }, []);
  return ready;
}
