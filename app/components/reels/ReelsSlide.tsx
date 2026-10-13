"use client";

import React, { useCallback, useEffect, useRef } from 'react';
import PostActionIcon from '@/app/components/social/PostActionIcon';
import type { ForYouFeedItem } from '@/app/lib/reelsForYou';

export type ReelsWatchFlush = {
  videoId: string;
  watchDurationSeconds: number;
  categoryId: string;
  hashtags: string[];
};

type ReelsSlideProps = {
  item: ForYouFeedItem;
  active: boolean;
  liked: boolean;
  likeBusy: boolean;
  onLike: () => void;
  onComment: () => void;
  onShare: () => void;
  onWatchFlush: (payload: ReelsWatchFlush) => void;
};

export default function ReelsSlide({
  item,
  active,
  liked,
  likeBusy,
  onLike,
  onComment,
  onShare,
  onWatchFlush,
}: ReelsSlideProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const accumulatedMs = useRef(0);
  const playingSince = useRef<number | null>(null);
  const flushed = useRef(false);
  const wasActive = useRef(false);
  const soundOn = useRef(false);

  const markPlaying = useCallback((playing: boolean) => {
    const now = Date.now();
    if (playing) {
      if (playingSince.current == null) playingSince.current = now;
      return;
    }
    if (playingSince.current != null) {
      accumulatedMs.current += now - playingSince.current;
      playingSince.current = null;
    }
  }, []);

  const flushWatch = useCallback(() => {
    markPlaying(false);
    if (flushed.current) return;
    flushed.current = true;
    const seconds = Math.round((accumulatedMs.current / 1000) * 1000) / 1000;
    onWatchFlush({
      videoId: item.videoId,
      watchDurationSeconds: seconds,
      categoryId: item.categoryId,
      hashtags: item.hashtags,
    });
  }, [item.categoryId, item.hashtags, item.videoId, markPlaying, onWatchFlush]);

  useEffect(() => {
    flushed.current = false;
    accumulatedMs.current = 0;
    playingSince.current = null;
    wasActive.current = false;
    return () => {
      if (wasActive.current || accumulatedMs.current > 0) flushWatch();
    };
  }, [flushWatch, item.videoId]);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    if (active) {
      wasActive.current = true;
      flushed.current = false;
      el.muted = !soundOn.current;
      const play = el.play();
      if (play) {
        void play
          .then(() => markPlaying(true))
          .catch(() => {
            el.muted = true;
            soundOn.current = false;
            void el.play().then(() => markPlaying(true)).catch(() => undefined);
          });
      }
      return;
    }
    markPlaying(false);
    el.pause();
    el.muted = true;
    if (wasActive.current) {
      wasActive.current = false;
      flushWatch();
    }
  }, [active, flushWatch, markPlaying]);

  const toggleSound = () => {
    const el = videoRef.current;
    if (!el || !active) return;
    soundOn.current = !soundOn.current;
    el.muted = !soundOn.current;
    void el.play().catch(() => undefined);
  };

  return (
    <article className="relative h-full w-full overflow-hidden bg-black">
      <video
        ref={videoRef}
        src={item.mediaUrl}
        className="h-full w-full object-cover"
        playsInline
        loop
        muted
        preload="metadata"
        onPlaying={() => markPlaying(true)}
        onPause={() => markPlaying(false)}
        onClick={toggleSound}
      />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/20" />

      <div className="absolute bottom-6 left-4 right-20 z-10 text-white">
        <p className="text-sm font-extrabold leading-tight">{item.title || 'Reels'}</p>
        {item.hashtags.length ? (
          <p className="mt-1 text-xs text-white/80">
            {item.hashtags.slice(0, 4).map((tag) => `#${tag}`).join(' ')}
          </p>
        ) : null}
      </div>

      <div className="absolute right-3 bottom-24 z-10 flex flex-col items-center gap-4">
        <button
          type="button"
          className="flex flex-col items-center gap-1 text-white disabled:opacity-60"
          onClick={onLike}
          disabled={likeBusy || liked}
          aria-label="Bəyən"
        >
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-black/35 backdrop-blur-sm">
            <PostActionIcon kind={liked ? 'like-active' : 'like'} alt="Bəyən" />
          </span>
          <span className="text-xs font-bold">{item.likes}</span>
        </button>
        <button
          type="button"
          className="flex flex-col items-center gap-1 text-white"
          onClick={onComment}
          aria-label="Şərh yaz"
        >
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-black/35 backdrop-blur-sm">
            <PostActionIcon kind="comment" alt="Şərh yaz" />
          </span>
          <span className="text-xs font-bold">{item.commentsCount}</span>
        </button>
        <button
          type="button"
          className="flex flex-col items-center gap-1 text-white"
          onClick={onShare}
          aria-label="Paylaş"
        >
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-black/35 backdrop-blur-sm">
            <PostActionIcon kind="share" alt="Paylaş" />
          </span>
          <span className="text-xs font-bold">Paylaş</span>
        </button>
      </div>
    </article>
  );
}
