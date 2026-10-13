import { DEFAULT_MANAT, normalizeManat } from './manat';

const MANAT_CACHE_KEY = 'yolustu_manat_cache_v1';
const LEGACY_COINS_CACHE_KEY = 'yolustu_coins_cache_v1';

export { DEFAULT_MANAT };

export function readManatCache(userId: string): number {
  if (typeof window === 'undefined' || !userId) return 0;
  try {
    const raw = localStorage.getItem(MANAT_CACHE_KEY);
    if (raw) {
      const map = JSON.parse(raw) as Record<string, number>;
      if (typeof map[userId] === 'number') return normalizeManat(map[userId]);
    }

    const legacyRaw = localStorage.getItem(LEGACY_COINS_CACHE_KEY);
    if (legacyRaw) {
      const map = JSON.parse(legacyRaw) as Record<string, number>;
      if (typeof map[userId] === 'number') return normalizeManat(map[userId]);
    }
  } catch {
    /* ignore */
  }
  return 0;
}

export function writeManatCache(userId: string, manat: number) {
  if (typeof window === 'undefined' || !userId) return;
  const normalized = normalizeManat(manat);
  try {
    const raw = localStorage.getItem(MANAT_CACHE_KEY);
    const map = raw ? (JSON.parse(raw) as Record<string, number>) : {};
    map[userId] = normalized;
    localStorage.setItem(MANAT_CACHE_KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}
