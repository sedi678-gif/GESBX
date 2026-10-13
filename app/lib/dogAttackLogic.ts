import {
  CLICK_RAID_CONFIGS,
  computeClickRaidClicksRequired,
  computeClickRaidStolenPoints,
  isClickRaidActive,
} from '@/app/lib/clickRaidLogic';

export const DOG_BASE_MEMBER_COUNT = CLICK_RAID_CONFIGS.it.baseMemberCount;
export const DOG_BASE_STOLEN = CLICK_RAID_CONFIGS.it.baseDamage;
export const DOG_BASE_CLICKS = CLICK_RAID_CONFIGS.it.baseClicks;
export const DOG_RAID_MS = CLICK_RAID_CONFIGS.it.raidMs;
export const DOG_MIN_CLICKS = CLICK_RAID_CONFIGS.it.minClicks;

export function computeDogStolenPoints(memberCount: number): number {
  return computeClickRaidStolenPoints('it', memberCount);
}

export function computeDogClicksRequired(memberCount: number): number {
  return computeClickRaidClicksRequired('it', memberCount);
}

export function isDogRaidActive(attack: Parameters<typeof isClickRaidActive>[0]): boolean {
  if (attack.cardId !== 'it') return false;
  return isClickRaidActive(attack);
}
