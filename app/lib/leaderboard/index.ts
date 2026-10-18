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
import { runArenaRewardPayoutChecks } from '@/app/game/arena/match/reward/payoutCheck';

export type { BattleLeaderboardAward } from './leaderboardService';

/**
 * Həftəlik mükafat paylanması və payout yoxlaması.
 *
 * ƏVVƏL: `await ... .catch((error) => { console.warn('Background task failed', error); })` — xəta tamamilə udulurdu, istifadəçi pulunu
 * almırdı və heç bir iz qalmırdı. İndi xəta loglanır və nəticə qaytarılır ki, çağıran
 * tərəf (məs. UI) istifadəçiyə məlumat verə bilsin.
 */
export type WeeklySettlementReport = {
  periodId: string;
  settlementOk: boolean;
  payoutOk: boolean;
  errors: string[];
};

async function settleClosedWeeklyPeriod(weekKey: string): Promise<WeeklySettlementReport> {
  const periodId = previousWeekFromKey(weekKey);
  const report: WeeklySettlementReport = {
    periodId,
    settlementOk: true,
    payoutOk: true,
    errors: [],
  };

  try {
    // Client calls are not allowed to run the admin-only settlement.
    throw new Error('Weekly settlement is admin-only and is not configured for client execution.');
  } catch (err) {
    report.settlementOk = false;
    const message = err instanceof Error ? err.message : String(err);
    report.errors.push(`settlement: ${message}`);
    console.error(`[Leaderboard] Həftəlik mükafat paylanmadı (${periodId}):`, err);
  }

  try {
    await runArenaRewardPayoutChecks({ periodId });
  } catch (err) {
    report.payoutOk = false;
    const message = err instanceof Error ? err.message : String(err);
    report.errors.push(`payout: ${message}`);
    console.error(`[Leaderboard] Payout yoxlaması alınmadı (${periodId}):`, err);
  }

  return report;
}

/** Son həftəlik hesablaşmanın nəticəsi — UI xəbərdarlıq göstərə bilsin. */
let lastWeeklySettlement: WeeklySettlementReport | null = null;

export function getLastWeeklySettlement(): WeeklySettlementReport | null {
  return lastWeeklySettlement;
}

export async function requireLeaderboardPeriod() {
  const period = await requireLeaderboardPeriodWork();
  lastWeeklySettlement = await settleClosedWeeklyPeriod(period.weekKey);
  return period;
}

export async function rollLeaderboardIfNeeded() {
  const period = await rollLeaderboardIfNeededWork();
  lastWeeklySettlement = await settleClosedWeeklyPeriod(period.weekKey);
  return period;
}
