'use client';

import { useEffect, useMemo, useState } from 'react';
import { listenFollowCounts } from '@/app/lib/socialService';
import {
  listenPostComments,
  listenUserLikesReceived,
  listenUserPosts,
  readCachedLikesReceived,
} from '@/app/lib/postsService';
import type { PostComment, SocialPost } from '@/app/lib/socialTypes';
import { getAppUserId, getLocalProfileDisplayName } from '@/app/lib/userId';

export type StudioDayPoint = { day: string; value: number };

export type ChannelStudioData = {
  userId: string;
  name: string;
  handle: string;
  avatar: string;
  followers: number;
  following: number;
  likesReceived: number;
  posts: SocialPost[];
  latest: SocialPost | null;
  comments: PostComment[];
  engagement28d: number;
  series: StudioDayPoint[];
  ready: boolean;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const WINDOW_DAYS = 28;

function readLocalChannel(): { name: string; handle: string; avatar: string } {
  if (typeof window === 'undefined') {
    return { name: 'Kanal', handle: '', avatar: '' };
  }
  try {
    const raw = localStorage.getItem('app_current_user_v6');
    if (!raw) {
      return { name: getLocalProfileDisplayName(), handle: '', avatar: '' };
    }
    const parsed = JSON.parse(raw) as {
      name?: string;
      surname?: string;
      handle?: string;
      avatar?: string;
    };
    const name = [parsed.name, parsed.surname].filter(Boolean).join(' ').trim() || getLocalProfileDisplayName();
    return {
      name,
      handle: String(parsed.handle || ''),
      avatar: String(parsed.avatar || ''),
    };
  } catch {
    return { name: getLocalProfileDisplayName(), handle: '', avatar: '' };
  }
}

function buildSeries(posts: SocialPost[], now: number): { series: StudioDayPoint[]; engagement28d: number } {
  const start = now - WINDOW_DAYS * DAY_MS;
  const buckets = Array.from({ length: WINDOW_DAYS }, () => 0);
  let engagement28d = 0;
  for (const post of posts) {
    if (post.createdAt < start) continue;
    const idx = Math.min(WINDOW_DAYS - 1, Math.max(0, Math.floor((post.createdAt - start) / DAY_MS)));
    const value = (Number(post.likes) || 0) + (Number(post.commentsCount) || 0);
    buckets[idx] += value;
    engagement28d += value;
  }
  const series = buckets.map((value, i) => {
    const at = new Date(start + i * DAY_MS);
    return {
      day: `${at.getDate()}.${at.getMonth() + 1}`,
      value,
    };
  });
  return { series, engagement28d };
}

export function useChannelStudio(contextUserId?: string | null): ChannelStudioData {
  const userId = getAppUserId(contextUserId);
  const local = useMemo(() => readLocalChannel(), [userId]);
  const [followers, setFollowers] = useState(0);
  const [following, setFollowing] = useState(0);
  const [likesReceived, setLikesReceived] = useState(() => readCachedLikesReceived(userId));
  const [posts, setPosts] = useState<SocialPost[]>([]);
  const [comments, setComments] = useState<PostComment[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!userId) return undefined;
    return listenFollowCounts(userId, (a, b) => {
      setFollowers(a);
      setFollowing(b);
    });
  }, [userId]);

  useEffect(() => {
    if (!userId) {
      setLikesReceived(0);
      return undefined;
    }
    return listenUserLikesReceived(userId, setLikesReceived);
  }, [userId]);

  useEffect(() => {
    setReady(false);
    if (!userId) {
      setPosts([]);
      setReady(true);
      return undefined;
    }
    return listenUserPosts(userId, (next) => {
      setPosts(next);
      setReady(true);
    });
  }, [userId]);

  const latest = posts[0] ?? null;

  useEffect(() => {
    if (!latest?.id) {
      setComments([]);
      return undefined;
    }
    return listenPostComments(latest.id, setComments);
  }, [latest?.id]);

  const { series, engagement28d } = useMemo(
    () => buildSeries(posts, Date.now()),
    [posts]
  );

  return {
    userId,
    name: local.name,
    handle: local.handle,
    avatar: local.avatar,
    followers,
    following,
    likesReceived,
    posts,
    latest,
    comments: comments.slice(-8).reverse(),
    engagement28d,
    series,
    ready,
  };
}

export function formatStudioCount(value: number): string {
  const n = Math.max(0, Math.floor(Number(value) || 0));
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0).replace(/\.0$/, '')} min`;
  return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')} mln`;
}

export function formatStudioAge(timestamp: number, now = Date.now()): string {
  const diff = Math.max(0, now - timestamp);
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'indi';
  if (mins < 60) return `${mins} dəq əvvəl`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} saat əvvəl`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} gün əvvəl`;
  return new Date(timestamp).toLocaleDateString('az-AZ');
}
