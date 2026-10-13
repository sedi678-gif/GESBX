import type { ArenaRewardAllocationTable, ArenaRewardCurrency, ArenaRewardRecipientType } from './types';

export const ARENA_REWARD_COLLECTION = 'arena_rewards';
export const ARENA_REWARD_EVENTS_COLLECTION = 'reward_events';
export const ARENA_REWARD_SETTLEMENT_COLLECTION = 'arena_reward_settlements';
export const ARENA_REWARD_SCHEMA = 1;
export const ARENA_REWARD_CURRENCY: ArenaRewardCurrency = 'AZN';
/** Mövcud xəritə ölkəsi — yeni pool faizi deyil. */
export const ARENA_REWARD_COUNTRY_CODE = 'AZ';
export const ARENA_REWARD_TYPE = 'BATTLE_COMPLETION';
export const ARENA_REWARD_SOURCE_TYPE = 'ARENA_MATCH';
export const ARENA_WEEKLY_REWARD_TYPE = 'WEEKLY_RANKING';
export const ARENA_WEEKLY_REWARD_SOURCE_TYPE = 'WEEKLY_RANKING';
/**
 * Həftəlik rank məbləğ cədvəli.
 * Boşdur: uydurma 1/2/3-cü yer və ölkə faizi yoxdur.
 * Dolu olanda Stage 10 mövcud cədvəli oxuyur.
 */
export const ARENA_REWARD_ALLOCATION: ArenaRewardAllocationTable = { entries: [] };
export const ARENA_REWARD_PAGE_SIZE = 20;
export const ARENA_REWARD_PAYOUT_PAGE_SIZE = 80;

export function lookupArenaRewardAllocation(input: {
  countryCode: string;
  recipientType: ArenaRewardRecipientType;
  rank: number;
  table?: ArenaRewardAllocationTable;
}): { amount: number; currency: ArenaRewardCurrency } | null {
  const table = input.table ?? ARENA_REWARD_ALLOCATION;
  const rank = Math.trunc(input.rank);
  if (!Number.isInteger(rank) || rank < 1) return null;
  const hit = table.entries.find(
    (entry) =>
      entry.countryCode === input.countryCode &&
      entry.recipientType === input.recipientType &&
      entry.rank === rank &&
      entry.currency === ARENA_REWARD_CURRENCY &&
      Number.isInteger(entry.amount) &&
      entry.amount >= 0
  );
  return hit ? { amount: hit.amount, currency: hit.currency } : null;
}
