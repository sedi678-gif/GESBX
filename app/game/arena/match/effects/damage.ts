import { officialXpDamage, type CardVariant } from '@/app/lib/battleEffects/infoDamage';

export const ARENA_DAMAGE_HEAVY_MAX = 500;
export const ARENA_DAMAGE_TSUNAMI_MAX = 200;
export const ARENA_DAMAGE_STRATEGIC_MAX = 100;
export const ARENA_DAMAGE_FIRE_MAX = 500;

export type ArenaDamageBand = 'none' | 'strategic' | 'tsunami' | 'heavy';

export type ArenaCardMode = 'earthquake' | 'tsunami' | 'fire' | 'ice';

const ZERO_CARDS = new Set(['2x', 'qul', 'tikanli', 'usyan']);
const STRATEGIC_CARDS = new Set(['sehrbaz', 'qaya', 'casus', 'duman', 'joker', 'guzgu']);
const HEAVY_CARDS = new Set(['ogru']);

export function clampInt(value: number, max: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.min(max, Math.max(0, Math.trunc(value)));
}

export function officialActiveUsers(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 1;
  return Math.max(1, Math.min(500, Math.trunc(value)));
}

export function validateArenaCardMode(cardId: string, raw: unknown): ArenaCardMode | null {
  if (cardId === 'felaket') {
    if (raw === 'earthquake' || raw === 'tsunami') return raw;
    if (raw == null || raw === '') return 'earthquake';
    throw new Error('REJECT');
  }
  if (cardId === 'qutb') {
    if (raw === 'fire' || raw === 'ice') return raw;
    if (raw == null || raw === '') return 'fire';
    throw new Error('REJECT');
  }
  if (raw != null && raw !== '') throw new Error('REJECT');
  return null;
}

export function arenaDamageBand(cardId: string, mode: ArenaCardMode | null): ArenaDamageBand {
  if (cardId === 'felaket' && mode === 'tsunami') return 'tsunami';
  if (cardId === 'felaket' && mode === 'earthquake') return 'heavy';
  if (cardId === 'qutb' && (mode === 'fire' || mode === 'ice')) return 'heavy';
  if (HEAVY_CARDS.has(cardId)) return 'heavy';
  if (STRATEGIC_CARDS.has(cardId)) return 'strategic';
  if (ZERO_CARDS.has(cardId)) return 'none';
  return 'none';
}

export function officialArenaDamage(input: {
  cardId: string;
  mode?: ArenaCardMode | null;
  activeUsers: unknown;
  multiplier?: number;
}): number {
  const users = officialActiveUsers(input.activeUsers);
  return officialXpDamage(
    input.cardId,
    users,
    (input.mode ?? null) as CardVariant | null,
    input.multiplier === 2 ? 2 : 1
  );
}

export const ARENA_CLICK_CARD_IDS = new Set(['qul', 'usyan', 'felaket', 'qutb']);

export function isArenaClickCard(cardId: string): boolean {
  return ARENA_CLICK_CARD_IDS.has(cardId);
}

/** Buz dərhal donur; klik pəncərəsi yalnız Od / Zəlzələ / Tsunami / Qul / Üsyan. */
export function isArenaDefenseClickCard(cardId: string, mode: ArenaCardMode | null): boolean {
  if (cardId === 'qutb' && mode === 'ice') return false;
  return isArenaClickCard(cardId);
}
