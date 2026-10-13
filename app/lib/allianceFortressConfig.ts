export type AllianceFortressLevel = 1 | 2 | 3 | 4 | 5 | 6;

export const ALLIANCE_FORTRESS_MIN_MEMBERS = 5;
export const ALLIANCE_FORTRESS_MIN_ONLINE = 5;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Növbəti səviyyə üçün tələb olunan “5 nəfər eyni vaxtda onlayn” vaxtı */
export const FORTRESS_UPGRADE_REQUIRED_MS: Record<
  1 | 2 | 3 | 4 | 5,
  { days: number; ms: number; label: string }
> = {
  1: { days: 10, ms: 10 * DAY_MS, label: '10 gün' },
  2: { days: 30, ms: 30 * DAY_MS, label: '1 ay' },
  3: { days: 60, ms: 60 * DAY_MS, label: '2 ay' },
  4: { days: 90, ms: 90 * DAY_MS, label: '3 ay' },
  5: { days: 120, ms: 120 * DAY_MS, label: '4 ay' },
};

export interface FortressShopProduct {
  level: AllianceFortressLevel;
  name: string;
  price: number;
  desc: string;
}

export const FORTRESS_SHOP_PRODUCTS: FortressShopProduct[] = [
  { level: 2, name: 'Qala — Səviyyə 2', price: 20, desc: 'Orta qala binası — dərhal aktiv.' },
  { level: 3, name: 'Qala — Səviyyə 3', price: 40, desc: 'Güclü qala — dərhal aktiv.' },
  { level: 4, name: 'Qala — Səviyyə 4', price: 60, desc: 'Nadir qala — dərhal aktiv.' },
  { level: 5, name: 'Qala — Səviyyə 5', price: 80, desc: 'Epik qala — dərhal aktiv.' },
  { level: 6, name: 'Qala — Səviyyə 6', price: 100, desc: 'Əfsanəvi qala — dərhal aktiv.' },
];

const FORTRESS_IMAGE_BASE = '/images/alliance-fortress';
const FORTRESS_HUB_IMAGE_BASE = '/images/alliance-hub';

export function getFortressMarkerUrl(level: number): string {
  const safe = Math.min(6, Math.max(1, Math.floor(level))) as AllianceFortressLevel;
  return `${FORTRESS_IMAGE_BASE}/fortress-level-${safe}.png?v=7`;
}

/** İttifaq səhifəsinin arxa fonu — qala səviyyəsinə görə */
export function getFortressHubBgUrl(level: number): string {
  const safe = normalizeFortressLevel(level);
  return `${FORTRESS_HUB_IMAGE_BASE}/hub-level-${safe}.jpg`;
}

const FORTRESS_LEVEL_STORAGE_KEY = 'app_user_alliance_fortress_level';

export function readCachedFortressLevel(): AllianceFortressLevel | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(FORTRESS_LEVEL_STORAGE_KEY);
    if (raw == null || raw === '') return null;
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 1) return null;
    return normalizeFortressLevel(n);
  } catch {
    return null;
  }
}

export function writeCachedFortressLevel(level: number | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (level == null) {
      localStorage.removeItem(FORTRESS_LEVEL_STORAGE_KEY);
      return;
    }
    localStorage.setItem(FORTRESS_LEVEL_STORAGE_KEY, String(normalizeFortressLevel(level)));
  } catch {
    /* ignore */
  }
}

/** Firebase gələnə qədər Lv.1 göstərmə — keş və ya heç nə. */
export function resolveAllianceHubLevel(options: {
  alliancesReady: boolean;
  hasAlliance: boolean;
  fortressLevel?: number | null;
}): AllianceFortressLevel | null {
  if (options.alliancesReady) {
    if (!options.hasAlliance) return 1;
    return normalizeFortressLevel(options.fortressLevel);
  }
  return readCachedFortressLevel();
}

export function normalizeFortressLevel(raw: unknown): AllianceFortressLevel {
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(n)) return 1;
  return Math.min(6, Math.max(1, Math.floor(n))) as AllianceFortressLevel;
}

export function formatFortressProgress(ms: number, requiredMs: number): string {
  const pct = requiredMs > 0 ? Math.min(100, Math.round((ms / requiredMs) * 100)) : 0;
  const daysDone = (ms / DAY_MS).toFixed(1);
  const daysNeed = (requiredMs / DAY_MS).toFixed(0);
  return `${pct}% (${daysDone} / ${daysNeed} gün ekv.)`;
}
