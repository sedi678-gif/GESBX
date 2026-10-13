export const EFFECT_DAMAGE_MAX = 500;
export const EFFECT_PLAYER_DELTA_MAX = 10;
export const EFFECT_ALLIANCE_DELTA_MAX = 8;
export const EFFECT_STEAL_MAX = 6;
export const EFFECT_CLICK_MAX = 14;
export const EFFECT_FREEZE_MAX_MS = 600_000;
export const EFFECT_KIND_MAX = 6;

function isSafeInt(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && Number.isSafeInteger(value);
}

export function officialInt(value: unknown, max: number): number {
  if (!isSafeInt(value) || value < 0 || value > max) return 0;
  return value;
}
