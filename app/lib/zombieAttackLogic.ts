import {
  CLICK_RAID_CONFIGS,
  computeClickRaidClicksRequired,
  computeClickRaidStolenPoints,
  isClickRaidActive,
} from '@/app/lib/clickRaidLogic';

export const ZOMBIE_BASE_MEMBER_COUNT = CLICK_RAID_CONFIGS.zombi.baseMemberCount;
export const ZOMBIE_BASE_STOLEN = CLICK_RAID_CONFIGS.zombi.baseDamage;
export const ZOMBIE_BASE_CLICKS = CLICK_RAID_CONFIGS.zombi.baseClicks;
export const ZOMBIE_RAID_MS = CLICK_RAID_CONFIGS.zombi.raidMs;
export const ZOMBIE_MIN_CLICKS = CLICK_RAID_CONFIGS.zombi.minClicks;

export function computeZombieStolenPoints(memberCount: number): number {
  return computeClickRaidStolenPoints('zombi', memberCount);
}

export function computeZombieClicksRequired(memberCount: number): number {
  return computeClickRaidClicksRequired('zombi', memberCount);
}

export function isZombieRaidActive(attack: Parameters<typeof isClickRaidActive>[0]): boolean {
  if (attack.cardId !== 'zombi') return false;
  return isClickRaidActive(attack);
}
