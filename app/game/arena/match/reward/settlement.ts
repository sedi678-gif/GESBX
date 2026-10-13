import { doc, getDoc, runTransaction, type Transaction } from 'firebase/firestore';
import { db } from '@/firebase';
import { requireFirebaseAuth, withTimeout } from '@/app/lib/firebaseAuth';
import { replayBattleRequest } from '@/app/lib/battleReconnect/replayBattleRequest';
import { serverNowMs, syncServerClock } from '@/app/lib/battlePlay/battleServerClock';
import {
  isPeriodKey,
  LEADERBOARD_RESETS_COLLECTION,
} from '@/app/lib/leaderboard/leaderboardConfig';
import { viewLeaderboardBoard, weeklyBoardRef } from '@/app/lib/leaderboard/leaderboardService';
import {
  ARENA_REWARD_COLLECTION,
  ARENA_REWARD_COUNTRY_CODE,
  ARENA_REWARD_EVENTS_COLLECTION,
  ARENA_REWARD_SETTLEMENT_COLLECTION,
} from './config';
import {
  assertWeeklyArenaRewardEligible,
  buildArenaRewardRecord,
  planWeeklyRankingRewards,
} from './eligibility';
import { arenaRewardLedgerWrite, arenaRewardRef, parseArenaReward } from './rewardService';
import type { ArenaRewardEventType, ArenaRewardRecord, ArenaRewardSettlementReceipt } from './types';

const TX_MS = 12_000;

export function arenaWeeklySettlementId(periodId: string, countryCode = ARENA_REWARD_COUNTRY_CODE): string {
  return `${periodId}_${countryCode}`.slice(0, 80);
}

export function arenaWeeklySettlementRef(periodId: string, countryCode = ARENA_REWARD_COUNTRY_CODE) {
  return doc(db, ARENA_REWARD_SETTLEMENT_COLLECTION, arenaWeeklySettlementId(periodId, countryCode));
}

function weeklyResetRef(periodId: string) {
  return doc(db, LEADERBOARD_RESETS_COLLECTION, `weekly_${periodId}`);
}

async function requireServerNow(): Promise<number> {
  await syncServerClock().catch(() => {});
  const now = serverNowMs();
  if (now <= 0) throw new Error('Server saatı yoxdur');
  return now;
}

function allianceViewerIds(data: Record<string, unknown> | undefined, allianceId: string): string[] {
  const members = Array.isArray(data?.members)
    ? data.members.filter((id): id is string => typeof id === 'string' && Boolean(id.trim()))
    : [];
  const leaderId = typeof data?.leaderId === 'string' ? data.leaderId : '';
  return [...new Set([allianceId, leaderId, ...members].filter(Boolean))];
}

function writeRewardEvents(tx: Transaction, record: ArenaRewardRecord, timestamp: number) {
  const types: ArenaRewardEventType[] = [
    'REWARD_ELIGIBILITY_CHECKED',
    'REWARD_CREATED',
    'REWARD_ALLOCATION_CREATED',
    'REWARD_SECURITY_CHECKED',
    record.status === 'REJECTED' ? 'REWARD_REJECTED' : 'REWARD_APPROVED',
  ];
  types.forEach((type) => {
    tx.set(doc(db, ARENA_REWARD_COLLECTION, record.rewardId, ARENA_REWARD_EVENTS_COLLECTION, type), {
      type,
      rewardId: record.rewardId,
      matchId: record.matchId,
      sourceId: record.sourceId,
      periodId: record.periodId,
      status: record.status,
      timestamp,
    });
  });
}

function writeSettlementEvents(
  tx: Transaction,
  receipt: ArenaRewardSettlementReceipt,
  timestamp: number,
  includeStart: boolean
) {
  const types: ArenaRewardEventType[] = includeStart
    ? ['REWARD_ALLOCATION_STARTED', 'REWARD_ALLOCATION_COMPLETED']
    : ['REWARD_ALLOCATION_COMPLETED'];
  types.forEach((type) => {
    tx.set(
      doc(db, ARENA_REWARD_SETTLEMENT_COLLECTION, receipt.settlementId, ARENA_REWARD_EVENTS_COLLECTION, type),
      {
        type,
        rewardId: receipt.settlementId,
        matchId: '',
        sourceId: receipt.periodId,
        periodId: receipt.periodId,
        status: receipt.status.toUpperCase(),
        timestamp,
      }
    );
  });
}

function parseSettlement(
  raw: Record<string, unknown> | undefined,
  fallbackId: string
): ArenaRewardSettlementReceipt | null {
  if (!raw) return null;
  if (raw.status !== 'completed') return null;
  return {
    settlementId: typeof raw.settlementId === 'string' ? raw.settlementId : fallbackId,
    periodId: typeof raw.periodId === 'string' ? raw.periodId : '',
    countryCode: typeof raw.countryCode === 'string' ? raw.countryCode : '',
    status: 'completed',
    allocatedCount: typeof raw.allocatedCount === 'number' ? Math.trunc(raw.allocatedCount) : 0,
    createdAt: typeof raw.createdAt === 'number' ? Math.trunc(raw.createdAt) : 0,
  };
}

export async function settleWeeklyRankingRewards(input: {
  periodId: string;
}): Promise<ArenaRewardSettlementReceipt | null> {
  const periodId = input.periodId.trim();
  const countryCode = ARENA_REWARD_COUNTRY_CODE;
  if (!isPeriodKey(periodId)) return null;
  await requireFirebaseAuth();
  const now = await requireServerNow();
  const boardSnap = await getDoc(weeklyBoardRef(periodId));
  const resetSnap = await getDoc(weeklyResetRef(periodId));
  const board = viewLeaderboardBoard(
    'weekly',
    periodId,
    boardSnap.exists() ? (boardSnap.data() as Record<string, unknown>) : null
  );
  if (!boardSnap.exists() || board.status !== 'closed') return null;
  if (!resetSnap.exists() || resetSnap.data()?.status !== 'done' || resetSnap.data()?.kind !== 'weekly') {
    return null;
  }
  return replayBattleRequest(`arena-weekly-settle:${periodId}:${countryCode}`, async () =>
    withTimeout(
      runTransaction(db, async (tx) => {
        const liveBoardSnap = await tx.get(weeklyBoardRef(periodId));
        const liveResetSnap = await tx.get(weeklyResetRef(periodId));
        const settlementSnap = await tx.get(arenaWeeklySettlementRef(periodId, countryCode));
        const existing = parseSettlement(
          settlementSnap.data() as Record<string, unknown> | undefined,
          arenaWeeklySettlementId(periodId, countryCode)
        );
        if (existing) return existing;
        if (!liveBoardSnap.exists()) return null;
        const liveBoard = viewLeaderboardBoard(
          'weekly',
          periodId,
          liveBoardSnap.data() as Record<string, unknown>
        );
        if (liveBoard.status !== 'closed') return null;
        if (
          !liveResetSnap.exists() ||
          liveResetSnap.data()?.status !== 'done' ||
          liveResetSnap.data()?.kind !== 'weekly'
        ) {
          return null;
        }
        const plans = planWeeklyRankingRewards({ board: liveBoard, countryCode });
        const rewardSnaps = await Promise.all(plans.map((plan) => tx.get(arenaRewardRef(plan.rewardId))));
        const allianceSnaps = await Promise.all(
          plans.map((plan) => tx.get(doc(db, 'alliances', plan.recipientId)))
        );
        const written: ArenaRewardRecord[] = [];
        plans.forEach((plan, index) => {
          const allianceData = allianceSnaps[index].data() as Record<string, unknown> | undefined;
          const nextPlan = {
            ...plan,
            viewerIds: allianceViewerIds(allianceData, plan.recipientId),
          };
          assertWeeklyArenaRewardEligible(liveBoard, nextPlan);
          const existingReward = parseArenaReward(
            rewardSnaps[index].data() as Record<string, unknown> | undefined,
            plan.rewardId
          );
          if (existingReward) {
            written.push(existingReward);
            return;
          }
          const blocked = allianceData?.banned === true || allianceData?.frozen === true;
          const record = buildArenaRewardRecord({
            plan: nextPlan,
            createdAt: now,
            blocked,
            receiptExists: rewardSnaps[index].exists(),
          });
          if (!record) return;
          tx.set(arenaRewardRef(record.rewardId), arenaRewardLedgerWrite(record));
          writeRewardEvents(tx, record, now);
          written.push(record);
        });
        const receipt: ArenaRewardSettlementReceipt = {
          settlementId: arenaWeeklySettlementId(periodId, countryCode),
          periodId,
          countryCode,
          status: 'completed',
          allocatedCount: written.length,
          createdAt: now,
        };
        tx.set(arenaWeeklySettlementRef(periodId, countryCode), {
          settlementId: receipt.settlementId,
          periodId: receipt.periodId,
          countryCode: receipt.countryCode,
          status: receipt.status,
          allocatedCount: receipt.allocatedCount,
          createdAt: receipt.createdAt,
          sourceType: 'WEEKLY_RANKING',
          schemaVersion: 1,
          walletCredited: false,
        });
        writeSettlementEvents(tx, receipt, now, true);
        return receipt;
      }),
      TX_MS,
      'Həftəlik mükafat yazılmadı'
    )
  );
}
