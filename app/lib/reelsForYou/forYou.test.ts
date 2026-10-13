import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { FOR_YOU_SHOWN_WINDOW_MS } from './config';
import { encodeForYouCursor } from './forYouCursor';
import { buildUserInterests, handleForYouFeed, officialForYouScore } from './forYou';
import { emptyUserProfileScores } from './profileScores';
import type { ForYouVideoCandidate, ReelSignalEvent } from './types';

const now = 1_800_000_000_000;

function video(partial: Partial<ForYouVideoCandidate> & { videoId: string }): ForYouVideoCandidate {
  return {
    authorId: 'creator',
    title: 'clip',
    mediaUrl: 'https://cdn/v.mp4',
    createdAt: now - 60_000,
    likes: 0,
    commentsCount: 0,
    views: 0,
    categoryId: 'music',
    hashtags: ['baku'],
    ...partial,
  };
}

function event(partial: Partial<ReelSignalEvent> & { videoId: string; eventType: ReelSignalEvent['eventType'] }): ReelSignalEvent {
  return {
    id: `${partial.videoId}_${partial.eventType}`,
    userId: 'viewer',
    watchDurationSeconds: 8,
    watchPercentage: 40,
    loopCount: 0,
    categoryId: 'music',
    hashtags: ['baku'],
    requestId: 'r',
    createdAt: now - 1_000,
    schemaVersion: 1,
    ...partial,
  };
}

describe('reels For You ranking', () => {
  it('builds interests from watch history and scores', () => {
    const profile = emptyUserProfileScores('viewer', now);
    profile.categoryScores.food = 12;
    const interests = buildUserInterests(profile, [
      event({ videoId: 'a', eventType: 'watch', categoryId: 'music', hashtags: ['baku'] }),
      event({ videoId: 'b', eventType: 'skip', categoryId: 'sports', hashtags: ['game'] }),
    ]);
    assert.equal(interests.coldStart, false);
    assert.ok(interests.categoryIds.includes('food'));
    assert.ok(interests.hashtags.includes('baku'));
    assert.equal(interests.hashtagWeights.game, undefined);
  });

  it('hides videos shown in the last 24 hours', () => {
    const res = handleForYouFeed({
      authUserId: 'viewer',
      serverNow: now,
      query: {},
      profile: null,
      recentEvents: [event({ videoId: 'seen', eventType: 'watch', createdAt: now - 1000 })],
      candidates: [
        video({ videoId: 'seen' }),
        video({ videoId: 'fresh', createdAt: now - FOR_YOU_SHOWN_WINDOW_MS - 10 }),
      ],
    });
    assert.equal(res.ok, true);
    if (!res.ok) return;
    assert.deepEqual(res.items.map((i) => i.videoId), ['fresh']);
  });

  it('boosts matching category affinity over a random clip', () => {
    const profile = emptyUserProfileScores('viewer', now);
    profile.categoryScores.music = 20;
    const liked = officialForYouScore(video({ videoId: 'm', categoryId: 'music', likes: 1, views: 10 }), buildUserInterests(profile, []), now);
    const other = officialForYouScore(video({ videoId: 's', categoryId: 'sports', likes: 1, views: 10 }), buildUserInterests(profile, []), now);
    assert.ok(liked.affinity > other.affinity);
    assert.ok(liked.score > other.score);
  });

  it('uses Score = W_match*affinity + W_eng*rate + W_fresh/(hours+2)', () => {
    const interests = buildUserInterests(null, []);
    const newer = officialForYouScore(video({ videoId: 'n', createdAt: now, likes: 0, views: 0 }), interests, now);
    const older = officialForYouScore(
      video({ videoId: 'o', createdAt: now - 5 * 24 * 60 * 60 * 1000, likes: 0, views: 0 }),
      interests,
      now
    );
    assert.ok(newer.freshness > older.freshness);
    const hot = officialForYouScore(video({ videoId: 'h', likes: 40, commentsCount: 8, views: 50 }), interests, now);
    const cold = officialForYouScore(video({ videoId: 'c', likes: 0, commentsCount: 0, views: 50 }), interests, now);
    assert.ok(hot.engagement > cold.engagement);
    assert.equal(newer.freshness, Math.round((24 / 2) * 100) / 100);
  });

  it('cold-starts by mixing categories from trending clips', () => {
    const res = handleForYouFeed({
      authUserId: 'newbie',
      serverNow: now,
      query: { limit: 4 },
      profile: null,
      recentEvents: [],
      candidates: [
        video({ videoId: 'm1', categoryId: 'music', likes: 50, views: 80 }),
        video({ videoId: 'm2', categoryId: 'music', likes: 40, views: 80 }),
        video({ videoId: 's1', categoryId: 'sports', likes: 45, views: 80 }),
        video({ videoId: 'f1', categoryId: 'food', likes: 42, views: 80 }),
      ],
    });
    assert.equal(res.ok, true);
    if (!res.ok) return;
    assert.equal(res.coldStart, true);
    const cats = res.items.map((i) => i.categoryId);
    assert.ok(new Set(cats).size >= 3);
  });

  it('paginates with a cursor', () => {
    const candidates = [
      video({ videoId: 'a', likes: 30, views: 40 }),
      video({ videoId: 'b', likes: 10, views: 40 }),
      video({ videoId: 'c', likes: 20, views: 40 }),
    ];
    const first = handleForYouFeed({
      authUserId: 'viewer',
      serverNow: now,
      query: { limit: 2 },
      profile: null,
      recentEvents: [],
      candidates,
    });
    assert.equal(first.ok, true);
    if (!first.ok) return;
    assert.equal(first.items.length, 2);
    assert.ok(first.nextCursor);
    const second = handleForYouFeed({
      authUserId: 'viewer',
      serverNow: now,
      query: { limit: 2, cursor: first.nextCursor },
      profile: null,
      recentEvents: [],
      candidates,
    });
    assert.equal(second.ok, true);
    if (!second.ok) return;
    assert.equal(second.items.length, 1);
    assert.equal(first.items.some((i) => i.videoId === second.items[0].videoId), false);
    assert.equal(second.nextCursor, null);
    encodeForYouCursor({ score: 1, createdAt: now, videoId: 'z' });
  });

  it('skips the viewer own videos', () => {
    const res = handleForYouFeed({
      authUserId: 'viewer',
      serverNow: now,
      query: {},
      profile: null,
      recentEvents: [],
      candidates: [video({ videoId: 'mine', authorId: 'viewer' }), video({ videoId: 'other' })],
    });
    assert.equal(res.ok, true);
    if (!res.ok) return;
    assert.deepEqual(res.items.map((i) => i.videoId), ['other']);
  });
});
