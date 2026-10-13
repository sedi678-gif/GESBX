/** @deprecated clickRaidLogic istifadə et — geriyə uyğunluq */
import {
  CLICK_RAID_CONFIGS,
  computeClickRaidClicksRequired,
  computeClickRaidDamage,
  isClickRaidActive,
} from '@/app/lib/clickRaidLogic';

export const MUTANT_BASE_MEMBER_COUNT = CLICK_RAID_CONFIGS.mutant.baseMemberCount;
export const MUTANT_BASE_DAMAGE = CLICK_RAID_CONFIGS.mutant.baseDamage;
export const MUTANT_BASE_CLICKS = CLICK_RAID_CONFIGS.mutant.baseClicks;
export const MUTANT_RAID_MS = CLICK_RAID_CONFIGS.mutant.raidMs;
export const MUTANT_MIN_CLICKS = CLICK_RAID_CONFIGS.mutant.minClicks;

export function computeMutantDamage(memberCount: number): number {
  return computeClickRaidDamage('mutant', memberCount);
}

export function computeMutantClicksRequired(memberCount: number): number {
  return computeClickRaidClicksRequired('mutant', memberCount);
}

export function isMutantRaidActive(attack: Parameters<typeof isClickRaidActive>[0]): boolean {
  if (attack.cardId !== 'mutant') return false;
  return isClickRaidActive(attack);
}
