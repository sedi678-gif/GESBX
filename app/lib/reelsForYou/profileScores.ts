import {
  REEL_COMPLETE_WATCH_PERCENT,
  REEL_SCORE_MAX,
  REEL_SCORE_MIN,
  REEL_SIGNAL_SCHEMA_VERSION,
  REEL_SIGNAL_WEIGHTS,
} from './config';
import type {
  ReelSignalEvent,
  ReelSignalEventType,
  UserProfileScoreTotals,
  UserProfileScores,
} from './types';

function emptyTotals(): UserProfileScoreTotals {
  return {
    watchCount: 0,
    likeCount: 0,
    commentCount: 0,
    shareCount: 0,
    skipCount: 0,
    watchDurationSeconds: 0,
  };
}

export function emptyUserProfileScores(userId: string, now: number): UserProfileScores {
  return {
    userId,
    schemaVersion: REEL_SIGNAL_SCHEMA_VERSION,
    categoryScores: {},
    hashtagScores: {},
    totals: emptyTotals(),
    updatedAt: now,
  };
}

function clampScore(value: number): number {
  const n = Math.round(value * 100) / 100;
  return Math.min(REEL_SCORE_MAX, Math.max(REEL_SCORE_MIN, n));
}

function addScore(map: Record<string, number>, key: string, delta: number): void {
  if (!key || delta === 0) return;
  map[key] = clampScore((map[key] ?? 0) + delta);
}

function bumpTotal(totals: UserProfileScoreTotals, eventType: ReelSignalEventType): void {
  if (eventType === 'watch') totals.watchCount += 1;
  else if (eventType === 'like') totals.likeCount += 1;
  else if (eventType === 'comment') totals.commentCount += 1;
  else if (eventType === 'share') totals.shareCount += 1;
  else totals.skipCount += 1;
}

export function isCompleteWatch(
  event: Pick<ReelSignalEvent, 'watchPercentage' | 'loopCount'>
): boolean {
  return event.watchPercentage >= REEL_COMPLETE_WATCH_PERCENT || event.loopCount > 1;
}

export function officialScoreDelta(
  event: Pick<ReelSignalEvent, 'eventType' | 'watchPercentage' | 'loopCount'>
): {
  category: number;
  hashtag: number;
} {
  const w = REEL_SIGNAL_WEIGHTS;
  switch (event.eventType) {
    case 'skip':
      return { category: w.skipCategory, hashtag: w.skipHashtag };
    case 'like':
      return { category: w.likeCategory, hashtag: w.likeHashtag };
    case 'comment':
      return { category: w.commentCategory, hashtag: w.commentHashtag };
    case 'share':
      return { category: w.shareCategory, hashtag: w.shareHashtag };
    case 'watch': {
      if (!isCompleteWatch(event)) return { category: 0, hashtag: 0 };
      return { category: w.completeWatchCategory, hashtag: w.completeWatchHashtag };
    }
    default:
      return { category: 0, hashtag: 0 };
  }
}

/** Bəyənilən kateqoriya və həştəq skorlarını rəsmi çəki ilə yeniləyir. */
export function applyReelSignalToProfileScores(
  profile: UserProfileScores | null,
  event: ReelSignalEvent,
  userId: string
): UserProfileScores {
  const next: UserProfileScores = profile
    ? {
        userId,
        schemaVersion: REEL_SIGNAL_SCHEMA_VERSION,
        categoryScores: { ...profile.categoryScores },
        hashtagScores: { ...profile.hashtagScores },
        totals: { ...profile.totals },
        updatedAt: event.createdAt,
      }
    : emptyUserProfileScores(userId, event.createdAt);

  next.userId = userId;
  next.updatedAt = event.createdAt;
  bumpTotal(next.totals, event.eventType);
  next.totals.watchDurationSeconds =
    Math.round((next.totals.watchDurationSeconds + event.watchDurationSeconds) * 1000) / 1000;

  const delta = officialScoreDelta(event);
  addScore(next.categoryScores, event.categoryId, delta.category);
  for (const tag of event.hashtags) {
    addScore(next.hashtagScores, tag, delta.hashtag);
  }
  return next;
}
