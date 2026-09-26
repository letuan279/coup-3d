/**
 * Pure helpers for room links: invite `/?room=CODE` and seat rejoin `/?room=CODE&key=KEY`.
 * No DOM access — callers pass `location.href` / `location.origin` so they are unit-testable.
 */
import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH } from '@shared/constants';

export interface RoomLink {
  /** Upper-cased, sanitised room code. */
  code: string;
  /** Rejoin key, when the link carries one. */
  key?: string;
}

/** Upper-cases and keeps only room-code characters (max ROOM_CODE_LENGTH). */
export function sanitizeCode(raw: string): string {
  let out = '';
  for (const ch of raw.toUpperCase()) {
    if (ROOM_CODE_ALPHABET.includes(ch)) out += ch;
    if (out.length >= ROOM_CODE_LENGTH) break;
  }
  return out;
}

/** Reads `?room=` (and `&key=`) from a URL. null when there is no usable room code. */
export function parseRoomLink(href: string): RoomLink | null {
  try {
    const params = new URL(href).searchParams;
    const code = sanitizeCode(params.get('room') ?? '');
    if (code.length !== ROOM_CODE_LENGTH) return null;
    const key = params.get('key')?.trim();
    return key ? { code, key } : { code };
  } catch {
    return null;
  }
}

/** `href` with `?room=` set to `code` (removed when null). The secret `key` param is always dropped. */
export function hrefWithRoom(href: string, code: string | null): string {
  const url = new URL(href);
  if (code) url.searchParams.set('room', code);
  else url.searchParams.delete('room');
  url.searchParams.delete('key');
  return url.toString();
}

export function inviteLink(origin: string, code: string): string {
  return `${origin}/?room=${encodeURIComponent(code)}`;
}

/** Secret link that lets the seat's owner take the seat back from another device. */
export function rejoinLink(origin: string, code: string, key: string): string {
  return `${inviteLink(origin, code)}&key=${encodeURIComponent(key)}`;
}

/** True when the page is served from this machine only, so a copied link cannot work for friends. */
export function isLocalHostname(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return (
    h === 'localhost' ||
    h.endsWith('.localhost') ||
    h === '::1' ||
    h === '[::1]' ||
    /^127(?:\.\d{1,3}){3}$/.test(h)
  );
}
