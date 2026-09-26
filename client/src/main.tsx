import { StrictMode, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/baloo-2/500.css';
import '@fontsource/baloo-2/700.css';
import '@fontsource/baloo-2/800.css';
import '@fontsource/nunito/400.css';
import '@fontsource/nunito/600.css';
import '@fontsource/nunito/800.css';
import './styles/tokens.css';
import { App } from './App';
import { connectSocket } from './net/socket';

function render(node: ReactNode) {
  createRoot(document.getElementById('root')!).render(<StrictMode>{node}</StrictMode>);
}

/**
 * Canvas-drawn art (cards, avatars) uses the web fonts, so wait for them (bounded) before the
 * first render — otherwise cached canvases would be drawn with a fallback font.
 */
function fontsReady(): Promise<unknown> {
  const wanted = ['500 32px "Baloo 2"', '700 32px "Baloo 2"', '800 32px "Baloo 2"', '600 16px "Nunito"', '800 16px "Nunito"'];
  const load = Promise.all(wanted.map((f) => document.fonts.load(f, 'Aă'))).catch(() => undefined);
  return Promise.race([load, new Promise((r) => setTimeout(r, 1500))]);
}

const params = new URLSearchParams(window.location.search);
const mockName = import.meta.env.DEV ? params.get('mock') : null;
const gallery = import.meta.env.DEV ? params.get('gallery') : null;

fontsReady().then(async () => {
  if (gallery) {
    // Dev-only art gallery (client/src/dev/ArtGallery.tsx).
    const { ArtGallery } = await import('./dev/ArtGallery');
    render(<ArtGallery />);
  } else if (mockName) {
    // Dev-only fixture mode (client/src/dev/mock.ts).
    const m = await import('./dev/mock');
    m.installMock(mockName);
    render(<App />);
  } else {
    connectSocket();
    render(<App />);
  }
});
