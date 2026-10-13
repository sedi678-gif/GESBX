import { ActiveShield, DisasterType } from '../alliance/types';

/** Aktiv qalxan hadisədən qoruyurmu? */
export function isProtectedFromDisaster(
  shields: ActiveShield[] | undefined,
  disaster: DisasterType,
  now = Date.now()
): boolean {
  if (!shields?.length) return false;
  return shields.some(
    (s) => s.expiresAt > now && s.protectsAgainst.includes(disaster)
  );
}

/** Bitmiş qalxanları təmizlə */
export function getActiveShields(
  shields: ActiveShield[] | undefined,
  now = Date.now()
): ActiveShield[] {
  return (shields ?? []).filter((s) => s.expiresAt > now);
}
