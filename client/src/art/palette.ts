/**
 * Art direction tokens shared by 2D UI, canvas-drawn art and the 3D scene. CONTRACT FILE.
 * "Sunny Tavern": Liar's Bar–style seated animal characters around a card table, but in a warm,
 * sun-lit, saturated cartoon look instead of a grim dark bar.
 */
import type { AvatarId, Character } from '@shared/types';

export const PALETTE = {
  ink: '#2B2140', // outlines, primary text
  inkSoft: '#5A4E73',
  cream: '#FFF6E5', // panels
  paper: '#FFFBF2',
  sand: '#FFE7BF',
  coral: '#FF6B5B', // primary / danger-ish CTA
  coralDark: '#E0473A',
  teal: '#1FB5A8', // secondary / confirm
  tealDark: '#138A80',
  mustard: '#FFC24B', // coins, highlights
  mustardDark: '#E9A21F',
  violet: '#7B61FF',
  sky: '#8FD8FF',
  mint: '#9BE7C4',
  pink: '#FF9EC7',
  wood: '#C9803F',
  woodDark: '#8E5220',
  felt: '#2FA37A', // table felt (bright emerald, not dark casino green)
  feltDark: '#1F7D5C',
  wall: '#6CCFC4',
  gold: '#FFD34D',
  danger: '#F2415A',
  success: '#35C27A',
} as const;

/** Card colours follow the original Coup colour coding. */
export const CHARACTER_COLORS: Record<Character, { main: string; dark: string; light: string }> = {
  duke: { main: '#8E4FD6', dark: '#5E2E9E', light: '#E3D1FF' },
  assassin: { main: '#3B3553', dark: '#1E1A2E', light: '#D9D4EA' },
  captain: { main: '#2F86E0', dark: '#1B5AA6', light: '#CFE6FF' },
  ambassador: { main: '#2DB36A', dark: '#1B7F48', light: '#CFF5DF' },
  contessa: { main: '#E6454D', dark: '#A8232B', light: '#FFD6D8' },
};

export const AVATAR_COLORS: Record<AvatarId, { body: string; accent: string }> = {
  pig: { body: '#FFA9C0', accent: '#E86F93' },
  fox: { body: '#FF8A3D', accent: '#FFF1E0' },
  bulldog: { body: '#D9A87A', accent: '#8C5E3C' },
  bunny: { body: '#F4F1FF', accent: '#FF9EC7' },
  frog: { body: '#7DD35B', accent: '#F6FFC9' },
  bear: { body: '#A8744B', accent: '#E8C8A0' },
  cat: { body: '#9AA3B5', accent: '#FFD1A9' },
  owl: { body: '#8C6BC2', accent: '#FFD34D' },
};

export const FONT_DISPLAY = "'Baloo 2', 'Nunito', system-ui, sans-serif";
export const FONT_BODY = "'Nunito', system-ui, sans-serif";
