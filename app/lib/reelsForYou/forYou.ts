import {
  FOR_YOU_COLD_START_MIN_EVENTS,
  FOR_YOU_INTEREST_TOP_N,
  FOR_YOU_SCORE_WEIGHTS,
  FOR_YOU_SHOWN_WINDOW_MS,
} from './config';
import { isAfterForYouCursor, parseForYouQuery, encodeForYouCursor } from './forYouCursor';
import { sanitizeReelCategoryId, sanitizeReelHashtags } from './policy';
import type {
  ForYouFeedItem,
  ForYouHandlerInput,
  ForYouHandlerResult,
  ForYouVideoCandidate,
  ReelSignalEvent,
  UserInterests,
  UserProfileScores,
} from './types';

const POSITIVE_EVENTS = new Set(['watch', 'like', 'comment', 'share']);

function topKeys(weights: Record<string, number>, n: number): string[] {
  return Object.entries(weights)
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, n)
    .map(([k]) => k);
}

export function buildUserInterests(
  profile: UserProfileScores | null,
  recentEvents: ReelSignalEvent[]
): UserInterests {
  const categoryWeights: Record<string, number> = { ...(profile?.categoryScores ?? {}) };
  const hashtagWeights: Record<string, number> = { ...(profile?.hashtagScores ?? {}) };

  for (const event of recentEvents) {
    if (!POSITIVE_EVENTS.has(event.eventType)) continue;
    const cat = sanitizeReelCategoryId(event.categoryId);
    if (cat) categoryWeights[cat] = (categoryWeights[cat] ?? 0) + 1;
    for (const tag of sanitizeReelHashtags(event.hashtags)) {
      hashtagWeights[tag] = (hashtagWeights[tag] ?? 0) + 1;
    }
  }

  const categoryIds = topKeys(categoryWeights, FOR_YOU_INTEREST_TOP_N);
  const hashtags = topKeys(hashtagWeights, FOR_YOU_INTEREST_TOP_N);
  const positiveEvents = recentEvents.filter((e) => POSITIVE_EVENTS.has(e.eventType)).length;
  const coldStart =
    categoryIds.length === 0 &&
    hashtags.length === 0 &&
    positiveEvents < FOR_YOU_COLD_START_MIN_EVENTS;

  return { categoryIds, hashtags, categoryWeights, hashtagWeights, coldStart };
}

export function recentlyShownVideoIds(
  events: ReelSignalEvent[],
  serverNow: number
): Set<string> {
  const cutoff = serverNow - FOR_YOU_SHOWN_WINDOW_MS;
  const ids = new Set<string>();
  for (const event of events) {
    if (event.createdAt >= cutoff) ids.add(event.videoId);
  }
  return ids;
}

export function officialHoursOld(createdAt: number, serverNow: number): number {
  return Math.max(0, (serverNow - createdAt) / (60 * 60 * 1000));
}

export function officialCategoryAffinity(video: ForYouVideoCandidate, interests: UserInterests): number {
  if (interests.coldStart) return 0;
  const cat = sanitizeReelCategoryId(video.categoryId);
  if (!cat) return 0;
  const peak = Math.max(0, ...Object.values(interests.categoryWeights));
  if (peak <= 0) return 0;
  const own = Math.max(0, interests.categoryWeights[cat] ?? 0);
  return Math.min(1, own / peak);
}

export function officialEngagementRate(video: ForYouVideoCandidate): number {
  const views = Math.max(0, video.views);
  const likes = Math.max(0, video.likes);
  if (views <= 0) return likes > 0 ? 1 : 0;
  return Math.min(1, likes / views);
}

/** Score = (W_user_match × CategoryAffinity) + (W_engagement × EngagementRate) + W_freshness / (HoursOld + 2) */
export function officialForYouScore(
  video: ForYouVideoCandidate,
  interests: UserInterests,
  serverNow: number
): { score: number; freshness: number; engagement: number; affinity: number } {
  const w = FOR_YOU_SCORE_WEIGHTS;
  const affinity = officialCategoryAffinity(video, interests);
  const engagementRate = officialEngagementRate(video);
  const hoursOld = officialHoursOld(video.createdAt, serverNow);
  const freshness = w.freshness / (hoursOld + 2);
  const score =
    w.userMatch * affinity + w.engagement * engagementRate + freshness;
  return {
    score: Math.round(score * 100) / 100,
    freshness: Math.round(freshness * 100) / 100,
    engagement: Math.round(w.engagement * engagementRate * 100) / 100,
    affinity: Math.round(w.userMatch * affinity * 100) / 100,
  };
}

function compareRanked(a: ForYouFeedItem, b: ForYouFeedItem): number {
  if (b.score !== a.score) return b.score - a.score;
  if (b.createdAt !== a.createdAt) return b.createdAt - a.createdAt;
  return b.videoId.localeCompare(a.videoId);
}

function interleaveByCategory(items: ForYouFeedItem[]): ForYouFeedItem[] {
  const buckets = new Map<string, ForYouFeedItem[]>();
  for (const item of items) {
    const key = item.categoryId || '_';
    const list = buckets.get(key) ?? [];
    list.push(item);
    buckets.set(key, list);
  }
  const queues = [...buckets.values()];
  const mixed: ForYouFeedItem[] = [];
  let added = true;
  while (added) {
    added = false;
    for (const queue of queues) {
      const next = queue.shift();
      if (!next) continue;
      mixed.push(next);
      added = true;
    }
  }
  return mixed;
}

export function handleForYouFeed(input: ForYouHandlerInput): ForYouHandlerResult {
  const userId = String(input.authUserId ?? '').trim();
  if (!userId || userId === 'guest' || userId === 'anonim_user_id') {
    return { ok: false, error: 'For You üçün profil tələb olunur.' };
  }
  if (!Number.isFinite(input.serverNow) || input.serverNow <= 0) {
    return { ok: false, error: 'Server saatı yoxdur.' };
  }

  const { cursor, limit } = parseForYouQuery(input.query);
  const interests = buildUserInterests(input.profile, input.recentEvents);
  const shown = recentlyShownVideoIds(input.recentEvents, input.serverNow);

  const ranked: ForYouFeedItem[] = [];
  for (const video of input.candidates) {
    if (!video.videoId || video.authorId === userId) continue;
    if (shown.has(video.videoId)) continue;
    const marks = officialForYouScore(video, interests, input.serverNow);
    ranked.push({
      videoId: video.videoId,
      authorId: video.authorId,
      title: video.title,
      mediaUrl: video.mediaUrl,
      createdAt: video.createdAt,
      likes: Math.max(0, video.likes),
      commentsCount: Math.max(0, video.commentsCount),
      categoryId: sanitizeReelCategoryId(video.categoryId),
      hashtags: sanitizeReelHashtags(video.hashtags),
      score: marks.score,
    });
  }

  ranked.sort(compareRanked);
  const ordered = interests.coldStart ? interleaveByCategory(ranked) : ranked;
  const page = ordered.filter((item) =>
    isAfterForYouCursor({ score: item.score, createdAt: item.createdAt, videoId: item.videoId }, cursor)
  );
  const items = page.slice(0, limit);
  const last = items[items.length - 1];
  const nextCursor =
    last && page.length > items.length
      ? encodeForYouCursor({ score: last.score, createdAt: last.createdAt, videoId: last.videoId })
      : null;

  return { ok: true, coldStart: interests.coldStart, items, nextCursor };
}
