import { allianceMemberCount } from '@/app/lib/battleClick/battleClickConfig';

/** info.json zərər tavanı — oğru / zəlzələ / yanğın / buz 10×üzv, maksimum 500. */
export const INFO_DAMAGE_MAX = 500;

export const CARD_VARIANTS = {
  qutb: ['fire', 'ice'],
  felaket: ['tsunami', 'earthquake'],
} as const;

export type CardVariant = (typeof CARD_VARIANTS)[keyof typeof CARD_VARIANTS][number];

export type CardXpBand = {
  perUser: number;
  cap: number;
};

/** Kart oynananda qazanılan XP zərəri — 50 nəfər = cap. */
export const CARD_XP_DAMAGE: Record<string, CardXpBand | Record<string, CardXpBand>> = {
  sehrbaz: { perUser: 2, cap: 100 },
  '2x': { perUser: 0, cap: 0 },
  qaya: { perUser: 2, cap: 100 },
  casus: { perUser: 2, cap: 100 },
  duman: { perUser: 2, cap: 100 },
  joker: { perUser: 2, cap: 100 },
  guzgu: { perUser: 2, cap: 100 },
  qul: { perUser: 0, cap: 0 },
  tikanli: { perUser: 0, cap: 0 },
  usyan: { perUser: 0, cap: 0 },
  ogru: { perUser: 10, cap: 500 },
  felaket: {
    earthquake: { perUser: 10, cap: 500 },
    tsunami: { perUser: 4, cap: 200 },
  },
  qutb: {
    fire: { perUser: 10, cap: 500 },
    ice: { perUser: 10, cap: 500 },
  },
};

export function defaultCardVariant(cardId: string): CardVariant | null {
  if (cardId === 'qutb') return 'fire';
  if (cardId === 'felaket') return 'earthquake';
  return null;
}

export function normalizeCardVariant(cardId: string, raw: unknown): CardVariant | null {
  const allowed = CARD_VARIANTS[cardId as keyof typeof CARD_VARIANTS];
  if (!allowed) {
    if (raw != null && raw !== '') throw new Error('Bu kartın seçimi yoxdur');
    return null;
  }
  const value = typeof raw === 'string' && raw.trim() ? raw.trim() : defaultCardVariant(cardId);
  if (!value || !(allowed as readonly string[]).includes(value)) throw new Error('Kart seçimi yanlışdır');
  return value as CardVariant;
}

export function lookupCardXpBand(cardId: string, variant: CardVariant | null): CardXpBand {
  const row = CARD_XP_DAMAGE[cardId];
  if (!row) return { perUser: 0, cap: 0 };
  if ('perUser' in row) {
    const band = row as CardXpBand;
    if (typeof band.perUser === 'number' && typeof band.cap === 'number') return band;
  }
  const table = row as Record<string, CardXpBand>;
  const key = variant ?? defaultCardVariant(cardId);
  if (!key) return { perUser: 0, cap: 0 };
  const nested = table[key];
  if (nested && typeof nested.perUser === 'number' && typeof nested.cap === 'number') return nested;
  return { perUser: 0, cap: 0 };
}

export function officialXpDamage(
  cardId: string,
  userCount: unknown,
  variant: CardVariant | null,
  multiplier = 1
): number {
  const band = lookupCardXpBand(cardId, variant);
  if (band.perUser <= 0 || band.cap <= 0) return 0;
  const users = typeof userCount === 'number' && Number.isFinite(userCount)
    ? Math.max(1, Math.min(500, Math.trunc(userCount)))
    : 1;
  const mult = multiplier === 2 ? 2 : 1;
  return Math.min(band.cap, Math.max(0, Math.trunc(users * band.perUser * mult)));
}

export function officialInfoDamage(cardId: string, memberCount: unknown, variant: CardVariant | null): number {
  return officialXpDamage(cardId, allianceMemberCount(memberCount), variant);
}
