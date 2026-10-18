import { doc, getDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '@/firebase';
import { requireFirebaseAuth } from '@/app/lib/firebaseAuth';
import { isPeriodKey, LEADERBOARD_RESETS_COLLECTION } from '@/app/lib/leaderboard/leaderboardConfig';
import { viewLeaderboardBoard, weeklyBoardRef } from '@/app/lib/leaderboard/leaderboardService';
import { ARENA_REWARD_COUNTRY_CODE, ARENA_REWARD_SETTLEMENT_COLLECTION } from './config';
import type { ArenaRewardSettlementReceipt } from './types';

export function arenaWeeklySettlementId(periodId: string, countryCode = ARENA_REWARD_COUNTRY_CODE): string {
  return `${periodId}_${countryCode}`.slice(0, 80);
}

export function arenaWeeklySettlementRef(periodId: string, countryCode = ARENA_REWARD_COUNTRY_CODE) {
  return doc(db, ARENA_REWARD_SETTLEMENT_COLLECTION, arenaWeeklySettlementId(periodId, countryCode));
}

function weeklyResetRef(periodId: string) {
  return doc(db, LEADERBOARD_RESETS_COLLECTION, `weekly_${periodId}`);
}

export async function settleWeeklyRankingRewards(input: {
  periodId: string;
}): Promise<ArenaRewardSettlementReceipt | null> {
  const periodId = input.periodId.trim();
  if (!isPeriodKey(periodId)) return null;
  await requireFirebaseAuth();

  // Avoid a callable for periods that have not passed the authoritative close/reset checks.
  const [boardSnap, resetSnap] = await Promise.all([
    getDoc(weeklyBoardRef(periodId)),
    getDoc(weeklyResetRef(periodId)),
  ]);
  const board = viewLeaderboardBoard(
    'weekly',
    periodId,
    boardSnap.exists() ? (boardSnap.data() as Record<string, unknown>) : null,
  );
  if (
    !boardSnap.exists() ||
    board.status !== 'closed' ||
    !resetSnap.exists() ||
    resetSnap.data()?.status !== 'done' ||
    resetSnap.data()?.kind !== 'weekly'
  ) {
    return null;
  }

  const settle = httpsCallable<{ periodId: string }, ArenaRewardSettlementReceipt | null>(
    functions,
    'settleArenaWeeklyRewards',
    { timeout: 300_000 },
  );
  return (await settle({ periodId })).data;
}
