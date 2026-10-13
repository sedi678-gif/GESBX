"use client";

import React, { useCallback, useEffect, useRef, useState } from 'react';
import PostCommentsSheet from '@/app/components/social/PostCommentsSheet';
import { listenUserLikedPostIds, toggleLikePost } from '@/app/lib/postsService';
import { getReelsForYou, trackReelSignal, type ForYouFeedItem } from '@/app/lib/reelsForYou';
import { getLocalProfileDisplayName } from '@/app/lib/userId';
import ReelsSlide, { type ReelsWatchFlush } from './ReelsSlide';

const VISIBLE_RATIO = 0.7;
const NEIGHBOR_COUNT = 2;

type ReelsVerticalFeedProps = {
  userId: string;
};

export default function ReelsVerticalFeed({ userId }: ReelsVerticalFeedProps) {
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const slotRefs = useRef<Map<number, HTMLElement>>(new Map());
  const [items, setItems] = useState<ForYouFeedItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set());
  const [likeBusy, setLikeBusy] = useState(false);
  const [commentItem, setCommentItem] = useState<ForYouFeedItem | null>(null);
  const loadingMore = useRef(false);

  const canTrack = Boolean(userId && userId !== 'anonim_user_id' && userId !== 'guest');

  const loadPage = useCallback(
    async (nextCursor: string | null, replace: boolean) => {
      if (!canTrack) {
        setLoading(false);
        setError('Reels üçün profil qeydiyyatı lazımdır.');
        return;
      }
      if (loadingMore.current) return;
      loadingMore.current = true;
      try {
        const page = await getReelsForYou(userId, { cursor: nextCursor, limit: 8 });
        setItems((prev) => (replace ? page.items : [...prev, ...page.items]));
        setCursor(page.nextCursor);
        setError('');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Reels yüklənmədi.');
      } finally {
        loadingMore.current = false;
        setLoading(false);
      }
    },
    [canTrack, userId]
  );

  useEffect(() => {
    setItems([]);
    setCursor(null);
    setActiveIndex(0);
    void loadPage(null, true);
  }, [loadPage]);

  useEffect(() => {
    if (!canTrack) return;
    return listenUserLikedPostIds(userId, setLikedIds);
  }, [canTrack, userId]);

  useEffect(() => {
    const root = scrollerRef.current;
    if (!root || items.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        let best: { index: number; ratio: number } | null = null;
        for (const entry of entries) {
          const index = Number((entry.target as HTMLElement).dataset.index);
          if (!Number.isFinite(index)) continue;
          if (entry.intersectionRatio < VISIBLE_RATIO) continue;
          if (!best || entry.intersectionRatio > best.ratio) {
            best = { index, ratio: entry.intersectionRatio };
          }
        }
        if (best) setActiveIndex(best.index);
      },
      { root, threshold: [0, VISIBLE_RATIO, 1] }
    );
    slotRefs.current.forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, [items.length]);

  useEffect(() => {
    if (cursor && activeIndex >= items.length - 3) {
      void loadPage(cursor, false);
    }
  }, [activeIndex, cursor, items.length, loadPage]);

  const sendWatch = useCallback(
    (payload: ReelsWatchFlush) => {
      if (!canTrack) return;
      void trackReelSignal(userId, {
        videoId: payload.videoId,
        eventType: 'watch',
        watchDurationSeconds: payload.watchDurationSeconds,
        categoryId: payload.categoryId,
        hashtags: payload.hashtags,
      }).catch(() => undefined);
    },
    [canTrack, userId]
  );

  const handleLike = async (item: ForYouFeedItem) => {
    if (!canTrack || likeBusy || likedIds.has(item.videoId)) return;
    setLikeBusy(true);
    try {
      const result = await toggleLikePost(item.videoId, userId);
      setLikedIds((prev) => new Set(prev).add(item.videoId));
      setItems((prev) =>
        prev.map((row) =>
          row.videoId === item.videoId ? { ...row, likes: result.likes } : row
        )
      );
      void trackReelSignal(userId, {
        videoId: item.videoId,
        eventType: 'like',
        watchDurationSeconds: 0,
        categoryId: item.categoryId,
        hashtags: item.hashtags,
      }).catch(() => undefined);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Bəyənmə alınmadı.');
    } finally {
      setLikeBusy(false);
    }
  };

  const handleShare = async (item: ForYouFeedItem) => {
    const text = item.title || 'Yolüstü Reels';
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Yolüstü', text, url: item.mediaUrl });
      } else {
        await navigator.clipboard?.writeText(item.mediaUrl);
      }
    } catch {
      /* ləğv */
    }
    if (!canTrack) return;
    void trackReelSignal(userId, {
      videoId: item.videoId,
      eventType: 'share',
      watchDurationSeconds: 0,
      categoryId: item.categoryId,
      hashtags: item.hashtags,
    }).catch(() => undefined);
  };

  const handleComment = (item: ForYouFeedItem) => {
    setCommentItem(item);
    if (!canTrack) return;
    void trackReelSignal(userId, {
      videoId: item.videoId,
      eventType: 'comment',
      watchDurationSeconds: 0,
      categoryId: item.categoryId,
      hashtags: item.hashtags,
    }).catch(() => undefined);
  };

  const setSlotRef = (index: number) => (node: HTMLDivElement | null) => {
    if (node) slotRefs.current.set(index, node);
    else slotRefs.current.delete(index);
  };

  if (loading && items.length === 0) {
    return (
      <div className="flex h-[calc(100dvh-var(--app-nav-total,68px))] items-center justify-center bg-black text-white">
        Yüklənir...
      </div>
    );
  }

  if (!items.length) {
    return (
      <div className="flex h-[calc(100dvh-var(--app-nav-total,68px))] flex-col items-center justify-center bg-black px-6 text-center text-white">
        <p className="text-lg font-extrabold">{error || 'Reels yoxdur'}</p>
        <p className="mt-2 text-sm text-white/70">Video paylaşın, For You lentini doldurun.</p>
      </div>
    );
  }

  return (
    <>
      <div
        ref={scrollerRef}
        className="h-[calc(100dvh-var(--app-nav-total,68px))] snap-y snap-mandatory overflow-y-scroll bg-black"
      >
        {items.map((item, index) => {
          const mounted = Math.abs(index - activeIndex) <= NEIGHBOR_COUNT;
          return (
            <div
              key={item.videoId}
              ref={setSlotRef(index)}
              data-index={index}
              className="h-[calc(100dvh-var(--app-nav-total,68px))] w-full snap-start snap-always"
            >
              {mounted ? (
                <ReelsSlide
                  item={item}
                  active={index === activeIndex}
                  liked={likedIds.has(item.videoId)}
                  likeBusy={likeBusy}
                  onLike={() => void handleLike(item)}
                  onComment={() => handleComment(item)}
                  onShare={() => void handleShare(item)}
                  onWatchFlush={sendWatch}
                />
              ) : null}
            </div>
          );
        })}
      </div>
      <PostCommentsSheet
        open={Boolean(commentItem)}
        postId={commentItem?.videoId ?? null}
        postTitle={commentItem?.title}
        onClose={() => setCommentItem(null)}
        currentUserId={userId}
        currentUserName={getLocalProfileDisplayName()}
      />
    </>
  );
}
