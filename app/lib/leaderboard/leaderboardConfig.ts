import { serverNowMs } from '@/app/lib/battlePlay/battleServerClock';

/** Vahid timezone — Bakı, DST yoxdur. Client Date istifadə olunmur. */
export const LEADERBOARD_TIMEZONE = 'Asia/Baku';
export const LEADERBOARD_TZ_OFFSET_MS = 4 * 60 * 60 * 1000;

export const LEADERBOARD_STATE_COLLECTION = 'leaderboard_state';
export const LEADERBOARD_STATE_ID = 'global';
export const LEADERBOARD_DAILY_COLLECTION = 'leaderboard_daily';
export const LEADERBOARD_WEEKLY_COLLECTION = 'leaderboard_weekly';
export const LEADERBOARD_ENTRIES = 'entries';
export const LEADERBOARD_RESETS_COLLECTION = 'leaderboard_resets';
export const LEADERBOARD_ARCHIVES_COLLECTION = 'leaderboard_archives';
export const LEADERBOARD_AWARDS_COLLECTION = 'leaderboard_awards';

export const LEADERBOARD_BOARD_MAX = 100;
export const LEADERBOARD_SCORE_MAX = 1_000_000;
export const LEADERBOARD_AWARD_MAX = 8;

/** İttifaq xalı aktiv oyunçu sayına görə: raw * 5 / active. */
export const LEADERBOARD_ACTIVE_NORM_BASE = 5;
export const LEADERBOARD_ACTIVE_USERS_MAX = 50;
export const LEADERBOARD_WEEKLY_SCORE_BASE = 50;

export const LEADERBOARD_SCHEMA = 1;

export interface LeaderboardPeriod {
  dayKey: string;
  weekKey: string;
  dayEndsAt: number;
  weekEndsAt: number;
  timezone: typeof LEADERBOARD_TIMEZONE;
}

export interface LeaderboardRow {
  id: string;
  rank: number;
  name: string;
  score: number;
  rawScore?: number;
  activeUsers?: number;
}

export interface LeaderboardBoard {
  kind: 'daily' | 'weekly';
  periodKey: string;
  timezone: string;
  status: 'open' | 'closed';
  rows: LeaderboardRow[];
  version: number;
  updatedAt: number;
}

function pad2(n: number) {
  return n < 10 ? `0${n}` : String(n);
}

/** Server millis → Bakı UTC hissələri. */
export function bakuCivilDate(serverMs: number): { y: number; m: number; d: number; dow: number } {
  const shifted = serverMs + LEADERBOARD_TZ_OFFSET_MS;
  const date = new Date(shifted);
  return {
    y: date.getUTCFullYear(),
    m: date.getUTCMonth() + 1,
    d: date.getUTCDate(),
    dow: date.getUTCDay(),
  };
}

export function officialDayKey(serverMs: number): string {
  if (!Number.isFinite(serverMs) || serverMs <= 0) throw new Error('Server saatı yoxdur');
  const { y, m, d } = bakuCivilDate(serverMs);
  return `${y}-${pad2(m)}-${pad2(d)}`;
}

/** Həftə bazar ertəsi ilə başlayır (Bakı). */
export function officialWeekKey(serverMs: number): string {
  if (!Number.isFinite(serverMs) || serverMs <= 0) throw new Error('Server saatı yoxdur');
  const { y, m, d, dow } = bakuCivilDate(serverMs);
  const mondayOffset = dow === 0 ? -6 : 1 - dow;
  const monday = new Date(Date.UTC(y, m - 1, d + mondayOffset));
  return `${monday.getUTCFullYear()}-${pad2(monday.getUTCMonth() + 1)}-${pad2(monday.getUTCDate())}`;
}

export function bakuMidnightUtcMs(y: number, m: number, d: number): number {
  return Date.UTC(y, m - 1, d) - LEADERBOARD_TZ_OFFSET_MS;
}

/** Mövcud həftə açarından əvvəlki rəsmi həftə — yeni period sistemi deyil. */
export function previousOfficialWeekKey(weekKey: string): string {
  if (!isPeriodKey(weekKey)) throw new Error('Period açarı yanlışdır');
  const [y, m, d] = weekKey.split('-').map(Number);
  return officialWeekKey(bakuMidnightUtcMs(y, m, d) - 1);
}

export function officialPeriod(serverMs: number): LeaderboardPeriod {
  const dayKey = officialDayKey(serverMs);
  const weekKey = officialWeekKey(serverMs);
  const { y, m, d } = bakuCivilDate(serverMs);
  const nextDay = new Date(Date.UTC(y, m - 1, d + 1));
  const { dow } = bakuCivilDate(serverMs);
  const daysToMonday = dow === 0 ? 1 : 8 - dow;
  const nextMonday = new Date(Date.UTC(y, m - 1, d + daysToMonday));
  return {
    dayKey,
    weekKey,
    dayEndsAt: bakuMidnightUtcMs(nextDay.getUTCFullYear(), nextDay.getUTCMonth() + 1, nextDay.getUTCDate()),
    weekEndsAt: bakuMidnightUtcMs(
      nextMonday.getUTCFullYear(),
      nextMonday.getUTCMonth() + 1,
      nextMonday.getUTCDate()
    ),
    timezone: LEADERBOARD_TIMEZONE,
  };
}

export function officialPeriodFromClock(): LeaderboardPeriod {
  return officialPeriod(serverNowMs());
}

export function isPeriodKey(value: unknown): boolean {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export function clampLeaderboardScore(value: unknown): number {
  const n = Math.trunc(Number(value) || 0);
  if (!Number.isInteger(n) || n < 0) return 0;
  return Math.min(LEADERBOARD_SCORE_MAX, n);
}

export function addLeaderboardScore(current: unknown, delta: number): number {
  if (!Number.isInteger(delta) || delta < 0 || delta > LEADERBOARD_AWARD_MAX) {
    throw new Error('Leaderboard dəyişməsi yanlışdır');
  }
  const now = clampLeaderboardScore(current);
  if (delta > LEADERBOARD_SCORE_MAX - now) return LEADERBOARD_SCORE_MAX;
  return now + delta;
}

export function officialActiveUserCount(ids: unknown): number {
  if (!Array.isArray(ids)) return 1;
  const unique = [...new Set(ids.map(String).filter(Boolean))];
  return Math.max(1, Math.min(LEADERBOARD_ACTIVE_USERS_MAX, unique.length));
}

export function officialNormalizedAllianceScore(rawScore: unknown, activeUserIds: unknown): number {
  const raw = clampLeaderboardScore(rawScore);
  const active = officialActiveUserCount(activeUserIds);
  return Math.min(
    LEADERBOARD_SCORE_MAX,
    Math.floor((raw * LEADERBOARD_ACTIVE_NORM_BASE) / active)
  );
}

export function rankLeaderboardRows(rows: LeaderboardRow[]): LeaderboardRow[] {
  return [...rows]
    .filter((row) => row.id && row.score > 0)
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
    .slice(0, LEADERBOARD_BOARD_MAX)
    .map((row, index) => ({ ...row, rank: index + 1 }));
}

export function upsertLeaderboardRow(rows: LeaderboardRow[], next: Omit<LeaderboardRow, 'rank'>): LeaderboardRow[] {
  const without = rows.filter((row) => row.id !== next.id);
  if (next.score <= 0) return rankLeaderboardRows(without);
  return rankLeaderboardRows([...without, { ...next, rank: 0 }]);
}
