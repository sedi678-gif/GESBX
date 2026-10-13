import { doc, getDoc, runTransaction } from 'firebase/firestore';
import { db } from '@/firebase';
import { ensureFirebaseAuth } from '@/app/lib/firebaseAuth';
import {
  REEL_SIGNAL_EVENTS_COLLECTION,
  USER_PROFILE_SCORES_COLLECTION,
} from './config';
import { handleReelSignal } from './handleReelSignal';
import type {
  ReelSignalEvent,
  ReelSignalHandlerOk,
  ReelSignalRequestBody,
  ReelVideoMeta,
  UserProfileScores,
} from './types';

function mapVideoMeta(videoId: string, raw: Record<string, unknown> | undefined): ReelVideoMeta | null {
  if (!raw) return null;
  const duration = Number(raw.durationSeconds ?? raw.videoDurationSeconds);
  const categoryId = typeof raw.categoryId === 'string' ? raw.categoryId : typeof raw.category === 'string' ? raw.category : '';
  const hashtags = Array.isArray(raw.hashtags) ? raw.hashtags.filter((t): t is string => typeof t === 'string') : [];
  return {
    videoId,
    durationSeconds: Number.isFinite(duration) && duration > 0 ? duration : 0,
    categoryId,
    hashtags,
  };
}

function mapProfile(userId: string, raw: Record<string, unknown> | undefined): UserProfileScores | null {
  if (!raw) return null;
  return {
    userId,
    schemaVersion: 1,
    categoryScores: (raw.categoryScores as Record<string, number>) ?? {},
    hashtagScores: (raw.hashtagScores as Record<string, number>) ?? {},
    totals: {
      watchCount: Number(raw.totals && (raw.totals as UserProfileScores['totals']).watchCount) || 0,
      likeCount: Number(raw.totals && (raw.totals as UserProfileScores['totals']).likeCount) || 0,
      commentCount: Number(raw.totals && (raw.totals as UserProfileScores['totals']).commentCount) || 0,
      shareCount: Number(raw.totals && (raw.totals as UserProfileScores['totals']).shareCount) || 0,
      skipCount: Number(raw.totals && (raw.totals as UserProfileScores['totals']).skipCount) || 0,
      watchDurationSeconds: Number(raw.totals && (raw.totals as UserProfileScores['totals']).watchDurationSeconds) || 0,
    },
    updatedAt: Number(raw.updatedAt) || 0,
  };
}

export async function loadReelVideoMeta(videoId: string): Promise<ReelVideoMeta | null> {
  const snap = await getDoc(doc(db, 'posts', videoId));
  if (!snap.exists()) return null;
  return mapVideoMeta(videoId, snap.data() as Record<string, unknown>);
}

/** Event-tracking API: siqnalı yazır və user_profile_scores yeniləyir. */
export async function trackReelSignal(
  authUserId: string,
  body: ReelSignalRequestBody,
  serverNow = Date.now()
): Promise<ReelSignalHandlerOk> {
  await ensureFirebaseAuth();
  const video = body.videoId ? await loadReelVideoMeta(String(body.videoId)) : null;

  const result = await runTransaction(db, async (tx) => {
    const preview = handleReelSignal({
      authUserId,
      body,
      serverNow,
      video,
      profile: null,
      alreadyTracked: false,
    });
    if (!preview.ok) throw new Error(preview.error);

    const eventRef = doc(db, REEL_SIGNAL_EVENTS_COLLECTION, preview.event.id);
    const scoreRef = doc(db, USER_PROFILE_SCORES_COLLECTION, authUserId);
    const [eventSnap, scoreSnap] = await Promise.all([tx.get(eventRef), tx.get(scoreRef)]);
    const alreadyTracked = eventSnap.exists();

    const handled = handleReelSignal({
      authUserId,
      body,
      serverNow,
      video,
      profile: mapProfile(authUserId, scoreSnap.data() as Record<string, unknown> | undefined),
      alreadyTracked,
    });
    if (!handled.ok) throw new Error(handled.error);

    if (!alreadyTracked) {
      const eventDoc: Omit<ReelSignalEvent, 'id'> & { id: string } = handled.event;
      tx.set(eventRef, eventDoc);
      tx.set(scoreRef, handled.profile);
    }

    return handled;
  });

  return result;
}
