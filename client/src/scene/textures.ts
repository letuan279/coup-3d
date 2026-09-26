/**
 * Procedural CanvasTextures for the tavern (no external image assets). Every texture is
 * created once and cached at module level; the ones with text (sign, cards) are redrawn in
 * place when the web fonts arrive late (art/refresh.ts).
 */
import {
  CanvasTexture,
  ClampToEdgeWrapping,
  DataTexture,
  NearestFilter,
  RedFormat,
  RepeatWrapping,
  SRGBColorSpace,
  type Texture,
} from 'three';
import type { Character } from '@shared/types';
import type { Lang } from '../store/useGame';
import { getCardBackCanvas, getCardFaceCanvas, repaintCanvas } from '../art/cardArt';
import { FONT_DISPLAY, PALETTE } from '../art/palette';
import { onArtRefresh } from '../art/refresh';
import { createRng } from '@shared/rng';

const cache = new Map<string, Texture>();

function cached<T extends Texture>(key: string, make: () => T): T {
  let t = cache.get(key) as T | undefined;
  if (!t) {
    t = make();
    cache.set(key, t);
  }
  return t;
}

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

function srgb(c: HTMLCanvasElement, repeat = false, anisotropy = 4): CanvasTexture {
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = anisotropy;
  if (repeat) t.wrapS = t.wrapT = RepeatWrapping;
  return t;
}

/** 3-tone ramp for MeshToonMaterial (soft cartoon shading). */
export function toonRamp(): DataTexture {
  return cached('toon', () => {
    const data = new Uint8Array([150, 205, 255]);
    const t = new DataTexture(data, 3, 1, RedFormat);
    t.minFilter = t.magFilter = NearestFilter;
    t.needsUpdate = true;
    return t;
  });
}

/** Honey-coloured plank floor. */
export function floorTexture(): CanvasTexture {
  return cached('floor', () => {
    const [c, g] = canvas(1024, 1024);
    const rand = createRng(7);
    const tones = ['#D9934F', '#CF8646', '#E0A05C', '#C87E40', '#D68D4B'];
    const plankH = 128;
    for (let row = 0; row < 1024 / plankH; row++) {
      let x = row % 2 ? -200 : 0;
      while (x < 1024) {
        const len = 300 + rand() * 360;
        g.fillStyle = tones[Math.floor(rand() * tones.length)];
        g.fillRect(x, row * plankH, len, plankH);
        // grain
        g.globalAlpha = 0.12;
        g.strokeStyle = '#8E5220';
        g.lineWidth = 2;
        for (let k = 0; k < 5; k++) {
          const y = row * plankH + 14 + rand() * (plankH - 28);
          g.beginPath();
          g.moveTo(x + 6, y);
          g.bezierCurveTo(x + len * 0.3, y + 6, x + len * 0.6, y - 6, x + len - 6, y + 2);
          g.stroke();
        }
        if (rand() < 0.35) {
          g.beginPath();
          g.ellipse(x + len * (0.2 + rand() * 0.6), row * plankH + plankH / 2, 14, 7, 0, 0, Math.PI * 2);
          g.fillStyle = '#8E5220';
          g.globalAlpha = 0.25;
          g.fill();
        }
        g.globalAlpha = 1;
        g.fillStyle = '#7A451C';
        g.fillRect(x, row * plankH, 4, plankH);
        x += len;
      }
      g.fillStyle = '#7A451C';
      g.fillRect(0, row * plankH, 1024, 5);
    }
    const t = srgb(c, true, 8);
    t.repeat.set(4, 4);
    return t;
  });
}

/** Wallpaper: turquoise with soft stripes and little sun dots. */
export function wallTexture(): CanvasTexture {
  return cached('wall', () => {
    const [c, g] = canvas(512, 512);
    g.fillStyle = PALETTE.wall;
    g.fillRect(0, 0, 512, 512);
    g.fillStyle = '#7FD8CE';
    for (let x = 0; x < 512; x += 64) g.fillRect(x, 0, 28, 512);
    g.fillStyle = '#FFF6E5';
    g.globalAlpha = 0.55;
    for (let y = 32; y < 512; y += 64) {
      for (let x = 46; x < 512; x += 64) {
        g.beginPath();
        g.arc(x, y, 4, 0, Math.PI * 2);
        g.fill();
      }
    }
    g.globalAlpha = 1;
    const t = srgb(c, true);
    t.repeat.set(8, 2.2);
    return t;
  });
}

/** Emerald felt with a soft vignette and a faint sun emblem in the middle. */
export function feltTexture(): CanvasTexture {
  return cached('felt', () => {
    const S = 1024;
    const [c, g] = canvas(S, S);
    const grad = g.createRadialGradient(S / 2, S / 2, 40, S / 2, S / 2, S / 2);
    grad.addColorStop(0, '#3CC08E');
    grad.addColorStop(0.7, '#2FA37A');
    grad.addColorStop(1, '#228A64');
    g.fillStyle = grad;
    g.fillRect(0, 0, S, S);
    // fibres
    const rand = createRng(3);
    for (let i = 0; i < 9000; i++) {
      g.fillStyle = rand() < 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,40,20,0.06)';
      g.fillRect(rand() * S, rand() * S, 2, 2);
    }
    // gold inlay ring
    g.strokeStyle = 'rgba(255, 211, 77, 0.75)';
    g.lineWidth = 6;
    g.beginPath();
    g.arc(S / 2, S / 2, S * 0.46, 0, Math.PI * 2);
    g.stroke();
    g.lineWidth = 2;
    g.beginPath();
    g.arc(S / 2, S / 2, S * 0.44, 0, Math.PI * 2);
    g.stroke();
    // faint sun emblem in the centre
    g.save();
    g.translate(S / 2, S / 2);
    g.fillStyle = 'rgba(255, 244, 190, 0.12)';
    for (let i = 0; i < 12; i++) {
      g.rotate(Math.PI / 6);
      g.beginPath();
      g.moveTo(-18, 110);
      g.lineTo(0, 200);
      g.lineTo(18, 110);
      g.fill();
    }
    g.beginPath();
    g.arc(0, 0, 96, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = 'rgba(255, 244, 190, 0.18)';
    g.lineWidth = 4;
    g.beginPath();
    g.arc(0, 0, 240, 0, Math.PI * 2);
    g.stroke();
    g.restore();
    return srgb(c, false, 8);
  });
}

/** Bright sky with fluffy clouds and a green hill, seen through the windows. */
export function skyTexture(): CanvasTexture {
  return cached('sky', () => {
    const [c, g] = canvas(512, 512);
    const grad = g.createLinearGradient(0, 0, 0, 512);
    grad.addColorStop(0, '#5EC2FF');
    grad.addColorStop(0.65, '#BDEBFF');
    grad.addColorStop(1, '#FFF1C9');
    g.fillStyle = grad;
    g.fillRect(0, 0, 512, 512);
    const rand = createRng(11);
    g.fillStyle = 'rgba(255,255,255,0.95)';
    for (let k = 0; k < 5; k++) {
      const cx = rand() * 512;
      const cy = 60 + rand() * 220;
      for (let i = 0; i < 6; i++) {
        g.beginPath();
        g.arc(cx + (i - 3) * 22 + rand() * 10, cy + rand() * 14, 20 + rand() * 18, 0, Math.PI * 2);
        g.fill();
      }
    }
    g.fillStyle = '#8FD86E';
    g.beginPath();
    g.moveTo(0, 440);
    g.bezierCurveTo(140, 380, 300, 420, 512, 400);
    g.lineTo(512, 512);
    g.lineTo(0, 512);
    g.fill();
    g.fillStyle = '#6CC45A';
    g.beginPath();
    g.moveTo(0, 480);
    g.bezierCurveTo(200, 440, 330, 470, 512, 450);
    g.lineTo(512, 512);
    g.lineTo(0, 512);
    g.fill();
    return srgb(c);
  });
}

/** Round rug with concentric coloured rings (floor under the table). */
export function rugTexture(): CanvasTexture {
  return cached('rug', () => {
    const S = 512;
    const [c, g] = canvas(S, S);
    const rings = [PALETTE.coral, PALETTE.cream, PALETTE.mustard, PALETTE.teal, PALETTE.cream, PALETTE.coral, PALETTE.mustard];
    for (let i = 0; i < rings.length; i++) {
      g.fillStyle = rings[i];
      g.beginPath();
      g.arc(S / 2, S / 2, (S / 2) * (1 - i / rings.length) - 2, 0, Math.PI * 2);
      g.fill();
    }
    // tassel-like dots on the outer ring
    g.fillStyle = PALETTE.cream;
    for (let i = 0; i < 48; i++) {
      const a = (i / 48) * Math.PI * 2;
      g.beginPath();
      g.arc(S / 2 + Math.cos(a) * (S / 2 - 18), S / 2 + Math.sin(a) * (S / 2 - 18), 6, 0, Math.PI * 2);
      g.fill();
    }
    return srgb(c);
  });
}

/** Painted wooden sign board with the tavern's name. */
export function signTexture(lang: Lang): CanvasTexture {
  return cached(`sign:${lang}`, () => {
    const [c, g] = canvas(1024, 256);
    drawSign(g, lang);
    return srgb(c);
  });
}

function drawSign(g: CanvasRenderingContext2D, lang: Lang): void {
  g.fillStyle = '#8E5220';
  roundRect(g, 0, 0, 1024, 256, 60);
  g.fill();
  g.fillStyle = '#C9803F';
  roundRect(g, 14, 14, 996, 228, 48);
  g.fill();
  g.strokeStyle = PALETTE.mustard;
  g.lineWidth = 6;
  roundRect(g, 30, 30, 964, 196, 38);
  g.stroke();
  // little sun on both sides
  for (const x of [110, 914]) {
    g.fillStyle = PALETTE.mustard;
    g.beginPath();
    g.arc(x, 128, 38, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = PALETTE.mustard;
    g.lineWidth = 8;
    g.lineCap = 'round';
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      g.beginPath();
      g.moveTo(x + Math.cos(a) * 52, 128 + Math.sin(a) * 52);
      g.lineTo(x + Math.cos(a) * 66, 128 + Math.sin(a) * 66);
      g.stroke();
    }
  }
  const title = lang === 'vi' ? 'QUÁN BÀI NẮNG' : 'SUNNY TAVERN';
  g.font = `800 104px ${FONT_DISPLAY}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineJoin = 'round';
  g.lineWidth = 16;
  g.strokeStyle = PALETTE.ink;
  g.strokeText(title, 512, 140, 700);
  g.fillStyle = PALETTE.cream;
  g.fillText(title, 512, 140, 700);
}

/** Soft-edged fade used by the light shafts (bright near the window, fading out along the beam). */
export function shaftTexture(): CanvasTexture {
  return cached('shaft', () => {
    const [c, g] = canvas(64, 256);
    const grad = g.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, 'rgba(255,236,170,0.0)');
    grad.addColorStop(0.08, 'rgba(255,236,170,0.9)');
    grad.addColorStop(0.55, 'rgba(255,226,150,0.45)');
    grad.addColorStop(1, 'rgba(255,220,140,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 256);
    // soften the long edges
    const edge = g.createLinearGradient(0, 0, 64, 0);
    edge.addColorStop(0, 'rgba(0,0,0,1)');
    edge.addColorStop(0.25, 'rgba(0,0,0,0)');
    edge.addColorStop(0.75, 'rgba(0,0,0,0)');
    edge.addColorStop(1, 'rgba(0,0,0,1)');
    g.globalCompositeOperation = 'destination-out';
    g.fillStyle = edge;
    g.fillRect(0, 0, 64, 256);
    const t = srgb(c);
    t.wrapS = t.wrapT = ClampToEdgeWrapping;
    return t;
  });
}

/** Soft radial glow (light pools, halos). */
export function glowTexture(): CanvasTexture {
  return cached('glow', () => {
    const [c, g] = canvas(128, 128);
    const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.35, 'rgba(255,255,255,0.55)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
    return srgb(c);
  });
}

/** Glowing ring decal (active actor / target markers). */
export function ringTexture(): CanvasTexture {
  return cached('ring', () => {
    const [c, g] = canvas(256, 256);
    const grad = g.createRadialGradient(128, 128, 60, 128, 128, 128);
    grad.addColorStop(0, 'rgba(255,255,255,0)');
    grad.addColorStop(0.55, 'rgba(255,255,255,0.15)');
    grad.addColorStop(0.78, 'rgba(255,255,255,1)');
    grad.addColorStop(0.86, 'rgba(255,255,255,0.9)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 256, 256);
    return srgb(c);
  });
}

/** Little white ghost face for eliminated players. */
export function ghostTexture(): CanvasTexture {
  return cached('ghost', () => {
    const [c, g] = canvas(128, 128);
    g.fillStyle = 'rgba(255,255,255,0.95)';
    g.beginPath();
    g.arc(64, 54, 40, Math.PI, 0);
    g.lineTo(104, 108);
    for (let i = 0; i < 4; i++) {
      g.quadraticCurveTo(99 - i * 20, 96, 94 - i * 20, 108);
    }
    g.lineTo(24, 108);
    g.closePath();
    g.fill();
    g.fillStyle = PALETTE.ink;
    g.beginPath();
    g.ellipse(50, 56, 6, 9, 0, 0, Math.PI * 2);
    g.ellipse(78, 56, 6, 9, 0, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    g.ellipse(64, 78, 7, 5, 0, 0, Math.PI * 2);
    g.fill();
    return srgb(c);
  });
}

/** Card face texture (character art from the art module) — cached per character + language. */
export function cardFaceTexture(character: Character, lang: Lang): CanvasTexture {
  return cached(`card:${character}:${lang}`, () => srgb(getCardFaceCanvas(character, lang), false, 8));
}

export function cardBackTexture(): CanvasTexture {
  return cached('card:back', () => srgb(getCardBackCanvas(), false, 8));
}

/**
 * Fonts arrived after the text textures were drawn: the art module has already repainted the
 * card canvases in place; repaint the sign here and re-upload all of them (same objects, so
 * every material keeps working).
 */
export function refreshTextTextures(): void {
  for (const [key, tex] of cache) {
    if (key.startsWith('sign:')) {
      repaintCanvas(tex.image as HTMLCanvasElement, (g) => drawSign(g, key.slice(5) as Lang));
      tex.needsUpdate = true;
    } else if (key.startsWith('card:')) {
      tex.needsUpdate = true;
    }
  }
}

onArtRefresh(refreshTextTextures);

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}
