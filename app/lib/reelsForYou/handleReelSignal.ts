import { REEL_SIGNAL_SCHEMA_VERSION } from './config';
import { applyReelSignalToProfileScores, emptyUserProfileScores } from './profileScores';
import {
  clampWatchDurationSeconds,
  officialLoopCount,
  officialReelEventType,
  officialWatchPercentage,
  reelEventDocId,
  resolveReelVideoMeta,
  sanitizeReelRequestId,
  sanitizeReelVideoId,
} from './policy';
import type { ReelSignalEvent, ReelSignalHandlerInput, ReelSignalHandlerResult } from './types';

/**
 * For You siqnal handler-i.
 * authUserId məcburidir; body.userId, skip, watch_percentage və skorlar etibar edilmir.
 */
export function handleReelSignal(input: ReelSignalHandlerInput): ReelSignalHandlerResult {
  const userId = String(input.authUserId ?? '').trim();
  if (!userId || userId === 'guest' || userId === 'anonim_user_id') {
    return { ok: false, error: 'Siqnal üçün profil tələb olunur.' };
  }
  if (!Number.isFinite(input.serverNow) || input.serverNow <= 0) {
    return { ok: false, error: 'Server saatı yoxdur.' };
  }

  let videoId: string;
  try {
    videoId = sanitizeReelVideoId(input.body.videoId);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Video ID etibarsızdır.' };
  }

  const watchDurationSeconds = clampWatchDurationSeconds(input.body.watchDurationSeconds);
  const eventType = officialReelEventType(input.body.eventType, watchDurationSeconds);
  const meta = resolveReelVideoMeta(videoId, input.video, input.body);
  const watchPercentage = officialWatchPercentage(watchDurationSeconds, meta.durationSeconds);
  const loopCount = officialLoopCount(watchDurationSeconds, meta.durationSeconds);
  const requestId = sanitizeReelRequestId(
    input.body.requestId,
    `${eventType}_${input.serverNow}`
  );
  const eventId = reelEventDocId({ userId, videoId, eventType, requestId });

  const event: ReelSignalEvent = {
    id: eventId,
    userId,
    videoId,
    eventType,
    watchDurationSeconds,
    watchPercentage,
    loopCount,
    categoryId: meta.categoryId,
    hashtags: meta.hashtags,
    requestId,
    createdAt: input.serverNow,
    schemaVersion: REEL_SIGNAL_SCHEMA_VERSION,
  };

  if (input.alreadyTracked) {
    return {
      ok: true,
      duplicate: true,
      event,
      profile: input.profile ?? emptyUserProfileScores(userId, input.serverNow),
    };
  }

  const profile = applyReelSignalToProfileScores(input.profile, event, userId);
  return { ok: true, duplicate: false, event, profile };
}
