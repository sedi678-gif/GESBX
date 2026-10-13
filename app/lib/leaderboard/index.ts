export {
  LEADERBOARD_ACTIVE_NORM_BASE,
  LEADERBOARD_ACTIVE_USERS_MAX,
  LEADERBOARD_ARCHIVES_COLLECTION,
  LEADERBOARD_AWARDS_COLLECTION,
  LEADERBOARD_AWARD_MAX,
  LEADERBOARD_BOARD_MAX,
  LEADERBOARD_DAILY_COLLECTION,
  LEADERBOARD_ENTRIES,
  LEADERBOARD_RESETS_COLLECTION,
  LEADERBOARD_SCHEMA,
  LEADERBOARD_SCORE_MAX,
  LEADERBOARD_STATE_COLLECTION,
  LEADERBOARD_STATE_ID,
  LEADERBOARD_TIMEZONE,
  LEADERBOARD_TZ_OFFSET_MS,
  LEADERBOARD_WEEKLY_COLLECTION,
  LEADERBOARD_WEEKLY_SCORE_BASE,
  addLeaderboardScore,
  bakuCivilDate,
  clampLeaderboardScore,
  isPeriodKey,
  officialActiveUserCount,
  officialDayKey,
  officialNormalizedAllianceScore,
  officialPeriod,
  officialPeriodFromClock,
  officialWeekKey,
  previousOfficialWeekKey,
  rankLeaderboardRows,
  upsertLeaderboardRow,
} from './leaderboardConfig';

export type { LeaderboardBoard, LeaderboardPeriod, LeaderboardRow } from './leaderboardConfig';

export {
  applyBattleLeaderboardAwards,
  dailyBoardRef,
  dailyEntryRef,
  leaderboardStateRef,
  listenLeaderboardBoard,
  listenLeaderboardState,
  viewLeaderboardBoard,
  weeklyBoardRef,
  weeklyEntryRef,
} from './leaderboardService';
import {
  requireLeaderboardPeriod as requireLeaderboardPeriodWork,
  rollLeaderboardIfNeeded as rollLeaderboardIfNeededWork,
} from './leaderboardService';
import { previousOfficialWeekKey as previousWeekFromKey } from './leaderboardConfig';
import { settleWeeklyRankingRewards } from '@/app/game/arena/match/reward/settlement';
import { runArenaRewardPayoutChecks } from '@/app/game/arena/match/reward/payoutCheck';

export type { BattleLeaderboardAward } from './leaderboardService';

async function settleClosedWeeklyPeriod(weekKey: string): Promise<void> {
  const periodId = previousWeekFromKey(weekKey);
  await settleWeeklyRankingRewards({ periodId }).catch(() => {});
  await runArenaRewardPayoutChecks({ periodId }).catch(() => {});
}

export async function requireLeaderboardPeriod() {
  const period = await requireLeaderboardPeriodWork();
  await settleClosedWeeklyPeriod(period.weekKey);
  return period;
}

export async function rollLeaderboardIfNeeded() {
  const period = await rollLeaderboardIfNeededWork();
  await settleClosedWeeklyPeriod(period.weekKey);
  return period;
}
