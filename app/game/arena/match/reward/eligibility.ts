import { officialWeekKey, isPeriodKey } from '@/app/lib/leaderboard/leaderboardConfig';
import { assertRewardOnce } from '@/app/lib/battleSecurity/battleSecurityPolicy';
import {
  ARENA_REWARD_COUNTRY_CODE,
  ARENA_REWARD_SOURCE_TYPE,
  ARENA_REWARD_TYPE,
  ARENA_WEEKLY_REWARD_SOURCE_TYPE,
  ARENA_WEEKLY_REWARD_TYPE,
  lookupArenaRewardAllocation,
} from './config';
import type { LeaderboardBoard } from '@/app/lib/leaderboard/leaderboardConfig';
import type { ArenaMatchState } from '../types';
import type {
  ArenaRewardAllocationTable,
  ArenaRewardPlan,
  ArenaRewardPublic,
  ArenaRewardRecord,
  ArenaRewardSecurityStatus,
  ArenaRewardStatus,
} from './types';

const ISO_COUNTRY = /^[A-Z]{2}$/;

function clipId(value: string, max = 80): string {
  return value.trim().replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, max);
}

export function officialArenaRewardPeriodId(completedAt: number): string {
  return officialWeekKey(completedAt);
}

export function arenaRewardId(plan: Pick<ArenaRewardPlan, 'periodId' | 'sourceId' | 'recipientType' | 'recipientId' | 'rewardType' | 'countryCode' | 'rank'>): string {
  if (plan.rewardType === ARENA_WEEKLY_REWARD_TYPE) {
    return clipId(
      `${plan.periodId}_${plan.countryCode}_${plan.recipientType}_${plan.recipientId}_${plan.rank ?? 0}_${plan.rewardType}`,
      120
    );
  }
  return clipId(
    `${plan.periodId}_${plan.sourceId}_${plan.recipientType}_${plan.recipientId}_${ARENA_REWARD_TYPE}`
  );
}

export function planArenaMatchRewards(match: ArenaMatchState): ArenaRewardPlan[] {
  const result = match.result;
  if (match.status !== 'closed' || !result || result.status !== 'COMPLETED') return [];
  const periodId = officialArenaRewardPeriodId(result.completedAt);
  if (!isPeriodKey(periodId)) return [];
  const sourceId = result.resultId;
  const viewerIds = [...new Set(match.participantIds.filter(Boolean))];
  if (result.gameMode === '1v1' && result.winnerPlayerId) {
    const recipientId = result.winnerPlayerId;
    const plan: ArenaRewardPlan = {
      periodId,
      sourceId,
      matchId: result.matchId,
      recipientType: 'USER',
      recipientId,
      viewerIds: [...new Set([...viewerIds, recipientId])],
      rewardId: '',
      sourceType: ARENA_REWARD_SOURCE_TYPE,
      rewardType: ARENA_REWARD_TYPE,
      countryCode: ARENA_REWARD_COUNTRY_CODE,
      rank: null,
      amount: null,
    };
    plan.rewardId = arenaRewardId(plan);
    return [plan];
  }
  if (result.gameMode === '5v5' && result.winnerAllianceId) {
    const recipientId = result.winnerAllianceId;
    const plan: ArenaRewardPlan = {
      periodId,
      sourceId,
      matchId: result.matchId,
      recipientType: 'ALLIANCE',
      recipientId,
      viewerIds,
      rewardId: '',
      sourceType: ARENA_REWARD_SOURCE_TYPE,
      rewardType: ARENA_REWARD_TYPE,
      countryCode: ARENA_REWARD_COUNTRY_CODE,
      rank: null,
      amount: null,
    };
    plan.rewardId = arenaRewardId(plan);
    return [plan];
  }
  return [];
}

export function assertArenaRewardEligible(match: ArenaMatchState, plan: ArenaRewardPlan): void {
  const result = match.result;
  if (match.status !== 'closed' || !result) throw new Error('REJECT');
  if (result.status !== 'COMPLETED') throw new Error('REJECT');
  if (result.resultId !== plan.sourceId) throw new Error('REJECT');
  if (result.matchId !== plan.matchId) throw new Error('REJECT');
  if (plan.periodId !== officialArenaRewardPeriodId(result.completedAt)) throw new Error('REJECT');
  if (!isPeriodKey(plan.periodId)) throw new Error('REJECT');
  if (!plan.recipientId.trim()) throw new Error('REJECT');
  if (plan.recipientType === 'USER' && result.winnerPlayerId !== plan.recipientId) throw new Error('REJECT');
  if (plan.recipientType === 'ALLIANCE' && result.winnerAllianceId !== plan.recipientId) throw new Error('REJECT');
  if (plan.sourceType !== ARENA_REWARD_SOURCE_TYPE || plan.rewardType !== ARENA_REWARD_TYPE) throw new Error('REJECT');
  if (!ISO_COUNTRY.test(plan.countryCode || ARENA_REWARD_COUNTRY_CODE)) throw new Error('REJECT');
  if (plan.amount != null || plan.rank != null) throw new Error('REJECT');
  if (plan.recipientType === 'USER' && !match.participantIds.includes(plan.recipientId) && !match.homePlayerIds.includes(plan.recipientId) && !match.awayPlayerIds.includes(plan.recipientId)) {
    throw new Error('REJECT');
  }
}

export function planWeeklyRankingRewards(input: {
  board: LeaderboardBoard;
  countryCode?: string;
  table?: ArenaRewardAllocationTable;
}): ArenaRewardPlan[] {
  const countryCode = input.countryCode || ARENA_REWARD_COUNTRY_CODE;
  if (input.board.kind !== 'weekly' || input.board.status !== 'closed') return [];
  if (!isPeriodKey(input.board.periodKey) || !ISO_COUNTRY.test(countryCode)) return [];
  const plans: ArenaRewardPlan[] = [];
  for (const row of input.board.rows) {
    const rank = Math.trunc(row.rank);
    if (!row.id.trim() || !Number.isInteger(rank) || rank < 1) continue;
    const hit = lookupArenaRewardAllocation({
      countryCode,
      recipientType: 'ALLIANCE',
      rank,
      table: input.table,
    });
    if (!hit) continue;
    const plan: ArenaRewardPlan = {
      periodId: input.board.periodKey,
      sourceId: input.board.periodKey,
      matchId: '',
      recipientType: 'ALLIANCE',
      recipientId: row.id,
      viewerIds: [row.id],
      rewardId: '',
      sourceType: ARENA_WEEKLY_REWARD_SOURCE_TYPE,
      rewardType: ARENA_WEEKLY_REWARD_TYPE,
      countryCode,
      rank,
      amount: hit.amount,
    };
    plan.rewardId = arenaRewardId(plan);
    plans.push(plan);
  }
  return plans;
}

export function assertWeeklyArenaRewardEligible(
  board: LeaderboardBoard,
  plan: ArenaRewardPlan,
  table?: ArenaRewardAllocationTable
): void {
  if (board.kind !== 'weekly' || board.status !== 'closed') throw new Error('REJECT');
  if (plan.sourceType !== ARENA_WEEKLY_REWARD_SOURCE_TYPE || plan.rewardType !== ARENA_WEEKLY_REWARD_TYPE) {
    throw new Error('REJECT');
  }
  if (plan.matchId !== '') throw new Error('REJECT');
  if (plan.sourceId !== board.periodKey || plan.periodId !== board.periodKey) throw new Error('REJECT');
  if (!isPeriodKey(plan.periodId)) throw new Error('REJECT');
  if (plan.recipientType !== 'ALLIANCE' || !plan.recipientId.trim()) throw new Error('REJECT');
  if (!ISO_COUNTRY.test(plan.countryCode)) throw new Error('REJECT');
  const rank = plan.rank == null ? 0 : Math.trunc(plan.rank);
  if (!Number.isInteger(rank) || rank < 1) throw new Error('REJECT');
  const row = board.rows.find((item) => item.id === plan.recipientId);
  if (!row || Math.trunc(row.rank) !== rank) throw new Error('REJECT');
  const hit = lookupArenaRewardAllocation({
    countryCode: plan.countryCode,
    recipientType: plan.recipientType,
    rank,
    table,
  });
  if (!hit || plan.amount !== hit.amount) throw new Error('REJECT');
}

export function resolveArenaRewardSecurity(blocked: boolean): {
  securityStatus: ArenaRewardSecurityStatus;
  status: Extract<ArenaRewardStatus, 'APPROVED' | 'REJECTED'>;
} {
  if (blocked) return { securityStatus: 'BLOCKED', status: 'REJECTED' };
  return { securityStatus: 'CLEAR', status: 'APPROVED' };
}

export function buildArenaRewardRecord(input: {
  plan: ArenaRewardPlan;
  createdAt: number;
  blocked: boolean;
  receiptExists: boolean;
}): ArenaRewardRecord | null {
  const once = assertRewardOnce(input.receiptExists);
  if (!once.apply) return null;
  const security = resolveArenaRewardSecurity(input.blocked);
  return {
    rewardId: input.plan.rewardId,
    periodId: input.plan.periodId,
    sourceType: input.plan.sourceType,
    sourceId: input.plan.sourceId,
    matchId: input.plan.matchId,
    rewardType: input.plan.rewardType,
    recipientType: input.plan.recipientType,
    recipientId: input.plan.recipientId,
    countryCode: input.plan.countryCode || ARENA_REWARD_COUNTRY_CODE,
    rank: input.plan.rank,
    amount: input.plan.amount,
    currency: 'AZN',
    status: security.status,
    createdAt: input.createdAt,
    approvedAt: security.status === 'APPROVED' ? input.createdAt : null,
    rejectedAt: security.status === 'REJECTED' ? input.createdAt : null,
    securityStatus: security.securityStatus,
    viewerIds: input.plan.viewerIds,
    payoutCheckStatus: null,
    payoutCheckedAt: null,
    payoutReady: false,
  };
}

export function toArenaRewardPublic(record: ArenaRewardRecord): ArenaRewardPublic {
  return {
    rewardId: record.rewardId,
    periodId: record.periodId,
    sourceId: record.sourceId,
    recipientType: record.recipientType,
    recipientId: record.recipientId,
    countryCode: record.countryCode,
    rank: record.rank,
    amount: record.amount,
    currency: record.currency,
    status: record.status,
    createdAt: record.createdAt,
    approvedAt: record.approvedAt,
    payoutCheckStatus: record.payoutCheckStatus,
    payoutReady: record.payoutReady,
  };
}
