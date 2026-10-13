import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { REEL_SKIP_WATCH_SECONDS, REEL_SIGNAL_WEIGHTS } from './config';
import { handleReelSignal } from './handleReelSignal';
import { officialReelEventType, officialWatchPercentage, sanitizeReelHashtags } from './policy';
import { applyReelSignalToProfileScores, officialScoreDelta } from './profileScores';
import type { ReelSignalEvent, ReelVideoMeta } from './types';

const video: ReelVideoMeta = {
  videoId: 'vid_1',
  durationSeconds: 20,
  categoryId: 'music',
  hashtags: ['#Baku', 'travel', 'travel'],
};

function signal(overrides: Partial<Parameters<typeof handleReelSignal>[0]> = {}) {
  return handleReelSignal({
    authUserId: 'user_a',
    serverNow: 1_700_000_000_000,
    video,
    profile: null,
    alreadyTracked: false,
    body: {
      videoId: 'vid_1',
      eventType: 'watch',
      watchDurationSeconds: 10,
    },
    ...overrides,
  });
}

describe('reels For You signals', () => {
  it('marks watch under 3 seconds as skip even if client sent watch', () => {
    assert.equal(officialReelEventType('watch', 2.9), 'skip');
    assert.equal(officialReelEventType('skip', 8), 'watch');
    const res = signal({
      body: { videoId: 'vid_1', eventType: 'watch', watchDurationSeconds: 2 },
    });
    assert.equal(res.ok, true);
    if (!res.ok) return;
    assert.equal(res.event.eventType, 'skip');
    assert.ok(res.event.watchDurationSeconds < REEL_SKIP_WATCH_SECONDS);
    assert.equal(res.profile.totals.skipCount, 1);
    assert.equal(res.profile.categoryScores.music, REEL_SIGNAL_WEIGHTS.skipCategory);
  });

  it('computes watch_percentage from official duration, not client percent', () => {
    assert.equal(officialWatchPercentage(10, 20), 50);
    const res = signal({
      body: {
        videoId: 'vid_1',
        eventType: 'watch',
        watchDurationSeconds: 10,
        watchPercentage: 99,
        videoDurationSeconds: 1,
      },
    });
    assert.equal(res.ok, true);
    if (!res.ok) return;
    assert.equal(res.event.watchPercentage, 50);
    assert.equal(res.event.eventType, 'watch');
  });

  it('raises category and hashtag scores on like', () => {
    const res = signal({
      body: { videoId: 'vid_1', eventType: 'like', watchDurationSeconds: 12 },
    });
    assert.equal(res.ok, true);
    if (!res.ok) return;
    assert.equal(res.event.eventType, 'like');
    assert.equal(res.profile.totals.likeCount, 1);
    assert.equal(res.profile.categoryScores.music, REEL_SIGNAL_WEIGHTS.likeCategory);
    assert.equal(res.profile.hashtagScores.travel, REEL_SIGNAL_WEIGHTS.likeHashtag);
  });

  it('ignores client userId and forged score maps', () => {
    const res = signal({
      authUserId: 'real_user',
      body: {
        videoId: 'vid_1',
        eventType: 'share',
        watchDurationSeconds: 15,
      },
    });
    assert.equal(res.ok, true);
    if (!res.ok) return;
    assert.equal(res.event.userId, 'real_user');
    assert.equal(res.profile.userId, 'real_user');
    assert.equal(res.profile.totals.shareCount, 1);
    assert.deepEqual(Object.keys(res.profile.hashtagScores).sort(), ['baku', 'travel']);
  });

  it('does not apply scores twice when already tracked', () => {
    const first = signal({
      body: { videoId: 'vid_1', eventType: 'comment', watchDurationSeconds: 9 },
    });
    assert.equal(first.ok, true);
    if (!first.ok) return;
    const second = signal({
      alreadyTracked: true,
      profile: first.profile,
      body: { videoId: 'vid_1', eventType: 'comment', watchDurationSeconds: 9 },
    });
    assert.equal(second.ok, true);
    if (!second.ok) return;
    assert.equal(second.duplicate, true);
    assert.equal(second.profile.totals.commentCount, 1);
  });

  it('sanitizes hashtags and rejects empty video id', () => {
    assert.deepEqual(sanitizeReelHashtags(['#Baku!', 'x', '', 1, 'baku']), ['baku', 'x']);
    const bad = handleReelSignal({
      authUserId: 'u1',
      serverNow: 1,
      video: null,
      profile: null,
      alreadyTracked: false,
      body: { videoId: '  ' },
    });
    assert.equal(bad.ok, false);
  });

  it('adds +5 category for 100% watch or loopCount > 1', () => {
    const full = handleReelSignal({
      authUserId: 'user_a',
      serverNow: 1_700_000_000_000,
      video,
      profile: null,
      alreadyTracked: false,
      body: { videoId: 'vid_1', eventType: 'watch', watchDurationSeconds: 20 },
    });
    assert.equal(full.ok, true);
    if (!full.ok) return;
    assert.equal(full.event.watchPercentage, 100);
    assert.equal(full.event.loopCount, 1);
    assert.equal(full.profile.categoryScores.music, REEL_SIGNAL_WEIGHTS.completeWatchCategory);

    const looped = handleReelSignal({
      authUserId: 'user_a',
      serverNow: 1_700_000_000_000,
      video,
      profile: null,
      alreadyTracked: false,
      body: { videoId: 'vid_1', eventType: 'watch', watchDurationSeconds: 41 },
    });
    assert.equal(looped.ok, true);
    if (!looped.ok) return;
    assert.ok(looped.event.loopCount > 1);
    assert.equal(looped.profile.categoryScores.music, REEL_SIGNAL_WEIGHTS.completeWatchCategory);
  });

  it('uses official like delta only', () => {
    const event: Pick<ReelSignalEvent, 'eventType' | 'watchPercentage' | 'loopCount'> = {
      eventType: 'like',
      watchPercentage: 100,
      loopCount: 0,
    };
    assert.deepEqual(officialScoreDelta(event), {
      category: REEL_SIGNAL_WEIGHTS.likeCategory,
      hashtag: REEL_SIGNAL_WEIGHTS.likeHashtag,
    });
    const stacked = applyReelSignalToProfileScores(null, {
      id: 'e1',
      userId: 'u',
      videoId: 'v',
      eventType: 'like',
      watchDurationSeconds: 5,
      watchPercentage: 25,
      loopCount: 0,
      categoryId: 'food',
      hashtags: ['doner'],
      requestId: 'r',
      createdAt: 10,
      schemaVersion: 1,
    }, 'u');
    assert.equal(stacked.categoryScores.food, 8);
  });
});
