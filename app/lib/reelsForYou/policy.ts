import {
  REEL_CATEGORY_MAX_LEN,
  REEL_COMPLETE_WATCH_PERCENT,
  REEL_HASHTAG_MAX_LEN,
  REEL_MAX_HASHTAGS,
  REEL_MAX_WATCH_SECONDS,
  REEL_SIGNAL_SCHEMA_VERSION,
  REEL_SKIP_WATCH_SECONDS,
} from './config';
import type {
  ReelSignalEventType,
  ReelSignalRequestBody,
  ReelVideoMeta,
} from './types';
import { REEL_SIGNAL_EVENT_TYPES } from './types';

const HASHTAG_BODY = /^[a-z0-9_]{1,24}$/;
const CATEGORY_BODY = /^[a-z0-9_-]{1,32}$/;

export function sanitizeReelVideoId(raw: unknown): string {
  if (typeof raw !== 'string') throw new Error('Video ID tələb olunur');
  const id = raw.trim();
  if (!id || id.length > 128) throw new Error('Video ID etibarsızdır');
  return id;
}

export function sanitizeReelRequestId(raw: unknown, fallback: string): string {
  if (typeof raw !== 'string' || !raw.trim()) return fallback;
  return raw.trim().slice(0, 80);
}

export function sanitizeReelCategoryId(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  const id = raw.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, REEL_CATEGORY_MAX_LEN);
  if (!id || !CATEGORY_BODY.test(id)) return '';
  return id;
}

export function sanitizeReelHashtags(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (typeof item !== 'string') continue;
    const tag = item.trim().toLowerCase().replace(/^#/, '').replace(/[^a-z0-9_]/g, '').slice(0, REEL_HASHTAG_MAX_LEN);
    if (!tag || !HASHTAG_BODY.test(tag) || seen.has(tag)) continue;
    seen.add(tag);
    out.push(tag);
    if (out.length >= REEL_MAX_HASHTAGS) break;
  }
  return out;
}

export function clampWatchDurationSeconds(raw: unknown): number {
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(REEL_MAX_WATCH_SECONDS, Math.round(n * 1000) / 1000);
}

export function officialWatchPercentage(
  watchDurationSeconds: number,
  officialDurationSeconds: number
): number {
  if (!Number.isFinite(officialDurationSeconds) || officialDurationSeconds <= 0) return 0;
  const pct = (watchDurationSeconds / officialDurationSeconds) * 100;
  if (!Number.isFinite(pct) || pct < 0) return 0;
  return Math.min(100, Math.round(pct * 10) / 10);
}

/** Müştəri loop count-una etibar yoxdur — rəsmi müddətdən hesablanır. */
export function officialLoopCount(
  watchDurationSeconds: number,
  officialDurationSeconds: number
): number {
  if (!Number.isFinite(officialDurationSeconds) || officialDurationSeconds <= 0) return 0;
  if (!Number.isFinite(watchDurationSeconds) || watchDurationSeconds <= 0) return 0;
  return Math.floor(watchDurationSeconds / officialDurationSeconds);
}

export function isReelSkipWatch(watchDurationSeconds: number): boolean {
  return watchDurationSeconds < REEL_SKIP_WATCH_SECONDS;
}

export function officialReelEventType(
  requested: unknown,
  watchDurationSeconds: number
): ReelSignalEventType {
  const allowed = typeof requested === 'string' && REEL_SIGNAL_EVENT_TYPES.includes(requested as ReelSignalEventType)
    ? (requested as ReelSignalEventType)
    : 'watch';

  if (allowed === 'like' || allowed === 'comment' || allowed === 'share') return allowed;
  return isReelSkipWatch(watchDurationSeconds) ? 'skip' : 'watch';
}

export function resolveReelVideoMeta(
  videoId: string,
  video: ReelVideoMeta | null,
  body: ReelSignalRequestBody
): Pick<ReelVideoMeta, 'durationSeconds' | 'categoryId' | 'hashtags'> {
  const durationSeconds =
    video && Number.isFinite(video.durationSeconds) && video.durationSeconds > 0
      ? Math.min(REEL_MAX_WATCH_SECONDS, video.durationSeconds)
      : 0;
  const categoryId = video?.categoryId
    ? sanitizeReelCategoryId(video.categoryId)
    : sanitizeReelCategoryId(body.categoryId);
  const hashtags = video?.hashtags?.length
    ? sanitizeReelHashtags(video.hashtags)
    : sanitizeReelHashtags(body.hashtags);
  return { durationSeconds, categoryId, hashtags };
}

export function reelEventDocId(input: {
  userId: string;
  videoId: string;
  eventType: ReelSignalEventType;
  requestId: string;
}): string {
  if (input.eventType === 'like' || input.eventType === 'comment' || input.eventType === 'share') {
    return `${input.userId}_${input.videoId}_${input.eventType}`;
  }
  return `${input.userId}_${input.videoId}_${input.eventType}_${input.requestId}`;
}

export { REEL_SIGNAL_SCHEMA_VERSION };
