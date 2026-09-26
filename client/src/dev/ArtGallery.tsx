/**
 * Dev-only: `?gallery=1` shows every canvas-drawn asset (owned by client/src/art) at the sizes
 * the game uses, on switchable backgrounds, plus the cold draw time of the whole set.
 */
import { useState, type CSSProperties, type ReactNode } from 'react';
import { AVATARS, CHARACTERS, type AvatarId, type Character } from '@shared/types';
import type { Lang } from '../store/useGame';
import {
  CARD_H,
  CARD_W,
  getCardBackCanvas,
  getCardBackUrl,
  getCardFaceCanvas,
  getCardFaceUrl,
  getCharacterIconCanvas,
  getCharacterIconUrl,
} from '../art/cardArt';
import { getAvatarCanvas, getAvatarUrl } from '../art/avatars';
import { PALETTE } from '../art/palette';

const LANGS: readonly Lang[] = ['vi', 'en'];

const BACKGROUNDS = {
  sand: PALETTE.sand,
  felt: PALETTE.felt,
  wood: PALETTE.wood,
  ink: PALETTE.ink,
  white: '#FFFFFF',
} as const;
type Bg = keyof typeof BACKGROUNDS;

interface Timing {
  drawMs: number;
  encodeMs: number;
}

/** Draws every asset from a cold cache and measures it. */
function measureAll(): Timing {
  const t0 = performance.now();
  for (const lang of LANGS) for (const c of CHARACTERS) getCardFaceCanvas(c, lang);
  getCardBackCanvas();
  for (const c of CHARACTERS) getCharacterIconCanvas(c);
  for (const a of AVATARS) getAvatarCanvas(a);
  const t1 = performance.now();
  for (const lang of LANGS) for (const c of CHARACTERS) getCardFaceUrl(c, lang);
  getCardBackUrl();
  for (const c of CHARACTERS) getCharacterIconUrl(c);
  for (const a of AVATARS) getAvatarUrl(a);
  return { drawMs: t1 - t0, encodeMs: performance.now() - t1 };
}

// Measured once when the page module loads (main.tsx imports it after the web fonts are ready),
// so React StrictMode's double render can't measure an already-warm cache.
const timing = measureAll();

const page: CSSProperties = {
  position: 'fixed',
  inset: 0,
  overflow: 'auto',
  padding: '24px 32px 64px',
  fontFamily: 'var(--font-body)',
};

const h2: CSSProperties = { fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 24, margin: '28px 0 12px' };

function Section({ title, children, dark }: { title: string; children: ReactNode; dark: boolean }) {
  return (
    <section>
      <h2 style={{ ...h2, color: dark ? PALETTE.cream : PALETTE.ink }}>{title}</h2>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20, alignItems: 'flex-end' }}>{children}</div>
    </section>
  );
}

function Labeled({ label, children, dark }: { label: string; children: ReactNode; dark: boolean }) {
  return (
    <figure style={{ margin: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
      {children}
      <figcaption style={{ fontSize: 12, fontWeight: 800, color: dark ? PALETTE.cream : PALETTE.inkSoft }}>{label}</figcaption>
    </figure>
  );
}

function Card({ src, width, alt }: { src: string; width: number; alt: string }) {
  return (
    <img
      src={src}
      alt={alt}
      width={width}
      height={(width * CARD_H) / CARD_W}
      style={{ display: 'block', filter: 'drop-shadow(0 6px 0 rgba(43,33,64,0.35))' }}
    />
  );
}

export function ArtGallery() {
  const [bg, setBg] = useState<Bg>('sand');
  const dark = bg === 'ink' || bg === 'felt' || bg === 'wood';
  const faceSizes = [250, 110] as const;

  return (
    <div style={{ ...page, background: BACKGROUNDS[bg], color: dark ? PALETTE.cream : PALETTE.ink }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 34, margin: 0 }}>Coup art gallery</h1>
        <span style={{ fontWeight: 800, fontSize: 14 }}>
          cold draw {timing.drawMs.toFixed(1)} ms · PNG encode {timing.encodeMs.toFixed(1)} ms
        </span>
        <span style={{ display: 'flex', gap: 6 }}>
          {(Object.keys(BACKGROUNDS) as Bg[]).map((k) => (
            <button
              key={k}
              onClick={() => setBg(k)}
              style={{
                padding: '4px 12px',
                borderRadius: 999,
                border: `3px solid ${PALETTE.ink}`,
                background: k === bg ? PALETTE.mustard : PALETTE.cream,
                color: PALETTE.ink,
                fontWeight: 800,
                cursor: 'pointer',
              }}
            >
              {k}
            </button>
          ))}
        </span>
      </header>

      {LANGS.map((lang) => (
        <Section key={lang} title={`Card faces — ${lang}`} dark={dark}>
          {CHARACTERS.map((c: Character) => (
            <Labeled key={c} label={c} dark={dark}>
              <Card src={getCardFaceUrl(c, lang)} width={faceSizes[0]} alt={c} />
            </Labeled>
          ))}
          <Labeled label="back" dark={dark}>
            <Card src={getCardBackUrl()} width={faceSizes[0]} alt="back" />
          </Labeled>
        </Section>
      ))}

      <Section title="HUD size (110 px)" dark={dark}>
        {LANGS.flatMap((lang) =>
          CHARACTERS.map((c) => (
            <Labeled key={`${lang}-${c}`} label={`${c} · ${lang}`} dark={dark}>
              <Card src={getCardFaceUrl(c, lang)} width={faceSizes[1]} alt={c} />
            </Labeled>
          )),
        )}
        <Labeled label="back" dark={dark}>
          <Card src={getCardBackUrl()} width={faceSizes[1]} alt="back" />
        </Labeled>
      </Section>

      <Section title="Character icons (128 / 48 / 28 / 24 / 20)" dark={dark}>
        {CHARACTERS.map((c) => (
          <Labeled key={c} label={c} dark={dark}>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10 }}>
              {[128, 48, 28, 24, 20].map((s) => (
                <img key={s} src={getCharacterIconUrl(c)} width={s} height={s} alt={c} />
              ))}
            </div>
          </Labeled>
        ))}
      </Section>

      <Section title="Avatars (256 / 96 / 48 / 32)" dark={dark}>
        {AVATARS.map((a: AvatarId) => (
          <Labeled key={a} label={a} dark={dark}>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10 }}>
              {[256, 96, 48, 32].map((s) => (
                <img key={s} src={getAvatarUrl(a)} width={s} height={s} alt={a} />
              ))}
            </div>
          </Labeled>
        ))}
      </Section>
    </div>
  );
}
