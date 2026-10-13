import {
  CLICK_RAID_CONFIGS,
  computeClickRaidClicksRequired,
  computeClickRaidDamage,
  isClickRaidActive,
} from '@/app/lib/clickRaidLogic';

export const STANDING_BASE_MEMBER_COUNT = CLICK_RAID_CONFIGS.standing.baseMemberCount;
export const STANDING_BASE_DAMAGE = CLICK_RAID_CONFIGS.standing.baseDamage;
export const STANDING_BASE_CLICKS = CLICK_RAID_CONFIGS.standing.baseClicks;
export const STANDING_RAID_MS = CLICK_RAID_CONFIGS.standing.raidMs;
export const STANDING_MIN_CLICKS = CLICK_RAID_CONFIGS.standing.minClicks;

export function computeStandingDamage(memberCount: number): number {
  return computeClickRaidDamage('standing', memberCount);
}

export function computeStandingClicksRequired(memberCount: number): number {
  return computeClickRaidClicksRequired('standing', memberCount);
}

export function isStandingRaidActive(attack: Parameters<typeof isClickRaidActive>[0]): boolean {
  if (attack.cardId !== 'standing') return false;
  return isClickRaidActive(attack);
}
