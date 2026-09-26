/** Display-name helpers: uniqueness within a room and fun Vietnamese bot names per avatar. */
import { NAME_MAX_LENGTH } from '@shared/constants';
import type { AvatarId } from '@shared/types';

export const BOT_NAMES: Record<AvatarId, readonly string[]> = {
  pig: ['Bé Heo', 'Heo Mập', 'Ỉn Con', 'Heo Hồng'],
  fox: ['Cáo Già', 'Cáo Lém', 'Cáo Lửa', 'Cáo Láu Cá'],
  bulldog: ['Cún Bự', 'Chó Mặt Xệ', 'Anh Mặt Ngầu', 'Lão Bull'],
  bunny: ['Thỏ Ngọc', 'Thỏ Bông', 'Thỏ Lém', 'Thỏ Tai Dài'],
  frog: ['Ếch Ộp', 'Cóc Tía', 'Nhái Bén', 'Ếch Xanh'],
  bear: ['Ông Gấu', 'Gấu Mật', 'Gấu Bự', 'Gấu Ngủ Đông'],
  cat: ['Mèo Mướp', 'Mèo Ú', 'Miu Miu', 'Mèo Hoang'],
  owl: ['Cú Mèo', 'Cú Thông Thái', 'Cú Đêm', 'Cú Già'],
};

/** Case-insensitive key used for name comparisons (uniqueness, rejoin by name). */
export function nameKey(name: string): string {
  return name.normalize('NFC').trim().toLocaleLowerCase('vi');
}

/**
 * `desired` if no one in the room uses it, else `desired 2`, `desired 3`… (the base is
 * shortened so the result still fits NAME_MAX_LENGTH).
 */
export function uniqueName(desired: string, taken: Iterable<string>): string {
  const used = new Set<string>();
  for (const n of taken) used.add(nameKey(n));
  if (!used.has(nameKey(desired))) return desired;
  for (let i = 2; ; i++) {
    const suffix = ` ${i}`;
    const base = desired.slice(0, NAME_MAX_LENGTH - suffix.length).trimEnd();
    const candidate = `${base}${suffix}`;
    if (!used.has(nameKey(candidate))) return candidate;
  }
}

/** A random unused name from the avatar's list; falls back to a numbered variant. */
export function pickBotName(avatar: AvatarId, taken: Iterable<string>, rand: () => number): string {
  const takenList = [...taken];
  const used = new Set(takenList.map(nameKey));
  const options = BOT_NAMES[avatar];
  const free = options.filter((n) => !used.has(nameKey(n)));
  const pool = free.length > 0 ? free : options;
  const pick = pool[Math.floor(rand() * pool.length) % pool.length];
  return uniqueName(pick, takenList);
}
