import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  where,
} from 'firebase/firestore';
import { db } from '@/firebase';
import { ensureFirebaseAuth } from '@/app/lib/firebaseAuth';
import {
  FOR_YOU_PAGE_SIZE_MAX,
  REEL_SIGNAL_EVENTS_COLLECTION,
  USER_PROFILE_SCORES_COLLECTION,
} from './config';
import { handleForYouFeed } from './forYou';
import { sanitizeReelCategoryId, sanitizeReelHashtags } from './policy';
import type {
  ForYouHandlerOk,
  ForYouQuery,
  ForYouVideoCandidate,
  ReelSignalEvent,
  ReelSignalEventType,
  UserProfileScores,
} from './types';

function mapProfile(userId: string, raw: Record<string, unknown> | undefined): UserProfileScores | null {
  if (!raw) return null;
  const totals = (raw.totals ?? {}) as Record<string, unknown>;
  return {
    userId,
    schemaVersion: 1,
    categoryScores: (raw.categoryScores as Record<string, number>) ?? {},
    hashtagScores: (raw.hashtagScores as Record<string, number>) ?? {},
    totals: {
      watchCount: Number(totals.watchCount) || 0,
      likeCount: Number(totals.likeCount) || 0,
      commentCount: Number(totals.commentCount) || 0,
      shareCount: Number(totals.shareCount) || 0,
      skipCount: Number(totals.skipCount) || 0,
      watchDurationSeconds: Number(totals.watchDurationSeconds) || 0,
    },
    updatedAt: Number(raw.updatedAt) || 0,
  };
}

function mapEvent(id: string, raw: Record<string, unknown>): ReelSignalEvent | null {
  const eventType = raw.eventType;
  if (
    eventType !== 'watch' &&
    eventType !== 'like' &&
    eventType !== 'comment' &&
    eventType !== 'share' &&
    eventType !== 'skip'
  ) {
    return null;
  }
  return {
    id,
    userId: String(raw.userId || ''),
    videoId: String(raw.videoId || ''),
    eventType: eventType as ReelSignalEventType,
    watchDurationSeconds: Number(raw.watchDurationSeconds) || 0,
    watchPercentage: Number(raw.watchPercentage) || 0,
    loopCount: Number(raw.loopCount) || 0,
    categoryId: sanitizeReelCategoryId(raw.categoryId),
    hashtags: sanitizeReelHashtags(raw.hashtags),
    requestId: String(raw.requestId || ''),
    createdAt: Number(raw.createdAt) || 0,
    schemaVersion: 1,
  };
}

function hashtagsFromTitle(title: string): string[] {
  const found = title.match(/#([a-zA-Z0-9_]+)/g) ?? [];
  return sanitizeReelHashtags(found);
}

function mapCandidate(id: string, raw: Record<string, unknown>): ForYouVideoCandidate | null {
  if (raw.mediaType && raw.mediaType !== 'video') return null;
  const mediaUrl = String(raw.mediaUrl || '');
  const createdAt = Number(raw.createdAt);
  if (!mediaUrl || !Number.isFinite(createdAt)) return null;
  const title = String(raw.title || '');
  const storedTags = Array.isArray(raw.hashtags) ? raw.hashtags : [];
  return {
    videoId: id,
    authorId: String(raw.userId || ''),
    title,
    mediaUrl,
    createdAt,
    likes: Number(raw.likes) || 0,
    commentsCount: Number(raw.commentsCount) || 0,
    views: Number(raw.views) || 0,
    categoryId: sanitizeReelCategoryId(raw.categoryId ?? raw.category),
    hashtags: sanitizeReelHashtags([...storedTags, ...hashtagsFromTitle(title)]),
  };
}

/** GET /api/reels/for-you ekvivalenti — cursor pagination. */
export async function getReelsForYou(
  authUserId: string,
  queryInput: ForYouQuery = {},
  serverNow = Date.now()
): Promise<ForYouHandlerOk> {
  await ensureFirebaseAuth();

  const scoreSnap = await getDoc(doc(db, USER_PROFILE_SCORES_COLLECTION, authUserId));
  const eventSnap = await getDocs(
    query(
      collection(db, REEL_SIGNAL_EVENTS_COLLECTION),
      where('userId', '==', authUserId),
      orderBy('createdAt', 'desc'),
      limit(400)
    )
  );
  const postSnap = await getDocs(
    query(collection(db, 'posts'), orderBy('createdAt', 'desc'), limit(FOR_YOU_PAGE_SIZE_MAX * 12))
  );

  const recentEvents = eventSnap.docs
    .map((d) => mapEvent(d.id, d.data() as Record<string, unknown>))
    .filter((e): e is ReelSignalEvent => Boolean(e));
  const candidates = postSnap.docs
    .map((d) => mapCandidate(d.id, d.data() as Record<string, unknown>))
    .filter((v): v is ForYouVideoCandidate => Boolean(v));

  const result = handleForYouFeed({
    authUserId,
    serverNow,
    query: queryInput,
    profile: mapProfile(authUserId, scoreSnap.data() as Record<string, unknown> | undefined),
    recentEvents,
    candidates,
  });
  if (!result.ok) throw new Error(result.error);
  return result;
}
