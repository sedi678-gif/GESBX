import { collection, doc, getDoc, getDocs, limit, query, runTransaction, where, type Transaction } from 'firebase/firestore';
import { db } from '@/firebase';
import { requireFirebaseAuth, withTimeout } from '@/app/lib/firebaseAuth';
import { replayBattleRequest } from '@/app/lib/battleReconnect/replayBattleRequest';
import { serverNowMs, syncServerClock } from '@/app/lib/battlePlay/battleServerClock';
import { assertRewardOnce } from '@/app/lib/battleSecurity/battleSecurityPolicy';
import {
  isPeriodKey,
  LEADERBOARD_RESETS_COLLECTION,
  type LeaderboardBoard,
} from '@/app/lib/leaderboard/leaderboardConfig';
import { viewLeaderboardBoard, weeklyBoardRef } from '@/app/lib/leaderboard/leaderboardService';
import {
  ARENA_REWARD_COLLECTION,
  ARENA_REWARD_COUNTRY_CODE,
  ARENA_REWARD_EVENTS_COLLECTION,
  ARENA_REWARD_PAYOUT_PAGE_SIZE,
  ARENA_WEEKLY_REWARD_SOURCE_TYPE,
  lookupArenaRewardAllocation,
} from './config';
import { arenaRewardRef, parseArenaReward } from './rewardService';
import type {
  ArenaRewardEventType,
  ArenaRewardPayoutCheckStatus,
  ArenaRewardRecord,
} from './types';

const TX_MS = 12_000;

export type ArenaRewardPayoutDecision =
  | { apply: false }
  | { apply: true; payoutCheckStatus: ArenaRewardPayoutCheckStatus; payoutReady: boolean };

export type ArenaRewardPayoutCheckInput = {
  record: ArenaRewardRecord;
  periodClosed: boolean;
  rankingRow: { id: string; rank: number } | null;
  recipientExists: boolean;
  recipientBanned: boolean;
  recipientFrozen: boolean;
  countryCode: string;
};

function weeklyResetRef(periodId: string) {
  return doc(db, LEADERBOARD_RESETS_COLLECTION, `weekly_${periodId}`);
}

async function requireServerNow(): Promise<number> {
  await syncServerClock().catch(() => {});
  const now = serverNowMs();
  if (now <= 0) throw new Error('Server saatı yoxdur');
  return now;
}

function recipientRef(record: ArenaRewardRecord) {
  return record.recipientType === 'ALLIANCE'
    ? doc(db, 'alliances', record.recipientId)
    : doc(db, 'players', record.recipientId);
}

function eventTypeFor(status: ArenaRewardPayoutCheckStatus): ArenaRewardEventType {
  if (status === 'BLOCKED') return 'PAYOUT_BLOCKED';
  if (status === 'REVIEW') return 'PAYOUT_REVIEW';
  return 'PAYOUT_APPROVED';
}

export function resolveArenaRewardPayoutCheck(input: ArenaRewardPayoutCheckInput): ArenaRewardPayoutDecision {
  const once = assertRewardOnce(input.record.payoutCheckStatus != null);
  if (!once.apply) return { apply: false };
  if (!input.periodClosed) return { apply: false };
  if (input.record.countryCode !== input.countryCode) {
    return { apply: true, payoutCheckStatus: 'BLOCKED', payoutReady: false };
  }
  if (input.record.securityStatus === 'BLOCKED' || input.record.status === 'REJECTED' || input.record.status === 'CANCELLED') {
    return { apply: true, payoutCheckStatus: 'BLOCKED', payoutReady: false };
  }
  if (!input.recipientExists) {
    return { apply: true, payoutCheckStatus: 'BLOCKED', payoutReady: false };
  }
  if (input.recipientBanned) {
    return { apply: true, payoutCheckStatus: 'BLOCKED', payoutReady: false };
  }
  if (input.record.sourceType === ARENA_WEEKLY_REWARD_SOURCE_TYPE) {
    if (!input.rankingRow || input.rankingRow.id !== input.record.recipientId) {
      return { apply: true, payoutCheckStatus: 'BLOCKED', payoutReady: false };
    }
    if (input.record.rank == null || Math.trunc(input.rankingRow.rank) !== Math.trunc(input.record.rank)) {
      return { apply: true, payoutCheckStatus: 'BLOCKED', payoutReady: false };
    }
    const hit = lookupArenaRewardAllocation({
      countryCode: input.record.countryCode,
      recipientType: input.record.recipientType,
      rank: input.record.rank,
    });
    if (!hit || input.record.amount !== hit.amount) {
      return { apply: true, payoutCheckStatus: 'BLOCKED', payoutReady: false };
    }
  } else if (input.record.rank != null || input.record.amount != null) {
    return { apply: true, payoutCheckStatus: 'BLOCKED', payoutReady: false };
  }
  if (input.recipientFrozen) {
    return { apply: true, payoutCheckStatus: 'REVIEW', payoutReady: false };
  }
  return { apply: true, payoutCheckStatus: 'APPROVED', payoutReady: true };
}

function writePayoutEvents(
  tx: Transaction,
  record: ArenaRewardRecord,
  status: ArenaRewardPayoutCheckStatus,
  timestamp: number
) {
  const types: ArenaRewardEventType[] = ['PAYOUT_CHECKED', eventTypeFor(status)];
  types.forEach((type) => {
    tx.set(doc(db, ARENA_REWARD_COLLECTION, record.rewardId, ARENA_REWARD_EVENTS_COLLECTION, type), {
      type,
      rewardId: record.rewardId,
      matchId: record.matchId,
      sourceId: record.sourceId,
      periodId: record.periodId,
      status,
      timestamp,
    });
  });
}

function rankingRowFor(board: LeaderboardBoard, record: ArenaRewardRecord): { id: string; rank: number } | null {
  if (record.sourceType !== ARENA_WEEKLY_REWARD_SOURCE_TYPE) return null;
  const row = board.rows.find((item) => item.id === record.recipientId);
  if (!row) return null;
  return { id: row.id, rank: row.rank };
}

async function persistArenaRewardPayoutCheck(input: {
  rewardId: string;
  board: LeaderboardBoard;
  periodClosed: boolean;
  now: number;
}): Promise<ArenaRewardRecord | null> {
  return replayBattleRequest(`arena-payout:${input.rewardId}`, async () =>
    withTimeout(
      runTransaction(db, async (tx) => {
        const rewardSnap = await tx.get(arenaRewardRef(input.rewardId));
        const record = parseArenaReward(
          rewardSnap.data() as Record<string, unknown> | undefined,
          input.rewardId
        );
        if (!record) return null;
        const resetSnap = await tx.get(weeklyResetRef(record.periodId));
        const boardSnap = await tx.get(weeklyBoardRef(record.periodId));
        const periodClosed =
          input.periodClosed &&
          boardSnap.exists() &&
          viewLeaderboardBoard('weekly', record.periodId, boardSnap.data() as Record<string, unknown>).status ===
            'closed' &&
          resetSnap.exists() &&
          resetSnap.data()?.status === 'done' &&
          resetSnap.data()?.kind === 'weekly';
        const liveBoard = boardSnap.exists()
          ? viewLeaderboardBoard('weekly', record.periodId, boardSnap.data() as Record<string, unknown>)
          : input.board;
        const recipientSnap = await tx.get(recipientRef(record));
        const recipientData = recipientSnap.data() as Record<string, unknown> | undefined;
        const decision = resolveArenaRewardPayoutCheck({
          record,
          periodClosed,
          rankingRow: rankingRowFor(liveBoard, record),
          recipientExists: recipientSnap.exists(),
          recipientBanned: recipientData?.banned === true,
          recipientFrozen: recipientData?.frozen === true,
          countryCode: ARENA_REWARD_COUNTRY_CODE,
        });
        if (!decision.apply) return record;
        const next: ArenaRewardRecord = {
          ...record,
          payoutCheckStatus: decision.payoutCheckStatus,
          payoutCheckedAt: input.now,
          payoutReady: decision.payoutReady,
        };
        tx.update(arenaRewardRef(record.rewardId), {
          payoutCheckStatus: decision.payoutCheckStatus,
          payoutCheckedAt: input.now,
          payoutReady: decision.payoutReady,
        });
        writePayoutEvents(tx, next, decision.payoutCheckStatus, input.now);
        return next;
      }),
      TX_MS,
      'Payout yoxlaması yazılmadı'
    )
  );
}

export async function runArenaRewardPayoutChecks(input: { periodId: string }): Promise<ArenaRewardRecord[]> {
  const periodId = input.periodId.trim();
  if (!isPeriodKey(periodId)) return [];
  await requireFirebaseAuth();
  const now = await requireServerNow();
  const boardSnap = await getDoc(weeklyBoardRef(periodId));
  const resetSnap = await getDoc(weeklyResetRef(periodId));
  if (!boardSnap.exists() || !resetSnap.exists()) return [];
  const board = viewLeaderboardBoard('weekly', periodId, boardSnap.data() as Record<string, unknown>);
  if (board.status !== 'closed' || resetSnap.data()?.status !== 'done' || resetSnap.data()?.kind !== 'weekly') {
    return [];
  }
  const snap = await getDocs(
    query(
      collection(db, ARENA_REWARD_COLLECTION),
      where('periodId', '==', periodId),
      limit(ARENA_REWARD_PAYOUT_PAGE_SIZE)
    )
  );
  const written: ArenaRewardRecord[] = [];
  for (const row of snap.docs) {
    const record = parseArenaReward(row.data() as Record<string, unknown>, row.id);
    if (!record || record.payoutCheckStatus != null) continue;
    const next = await persistArenaRewardPayoutCheck({
      rewardId: record.rewardId,
      board,
      periodClosed: true,
      now,
    });
    if (next) written.push(next);
  }
  return written;
}
