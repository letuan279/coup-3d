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
import { waitForArtFonts } from './art/fonts';
import { startArtWarmup } from './art/warmup';

function render(node: ReactNode) {
  createRoot(document.getElementById('root')!).render(<StrictMode>{node}</StrictMode>);
}

const params = new URLSearchParams(window.location.search);
const mockName = import.meta.env.DEV ? params.get('mock') : null;
const gallery = import.meta.env.DEV ? params.get('gallery') : null;

// Canvas art needs the web fonts; see art/fonts.ts (late fonts are redrawn in place).
waitForArtFonts().then(async () => {
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
  // Pre-encode the HUD art while idle (no PNG encoding when a card first shows up mid-game).
  if (!gallery) startArtWarmup();
});
