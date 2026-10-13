"use client";

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import AppBottomNav from '@/app/components/AppBottomNav';
import { listenUserPosts, listenUserLikesReceived, readCachedLikesReceived, writeCachedLikesReceived, ensureMinLikesReceived } from '@/app/lib/postsService';
import {
  getUserProfile,
  followUser,
  unfollowUser,
  listenIsFollowing,
  listenFollowCounts,
  reportContent,
} from '@/app/lib/socialService';
import { getPlayerCosmetics } from '@/app/components/shop/cosmeticsService';
import { PlayerCosmetics } from '@/app/components/alliance/types';
import ProfileHeroDisplay from '@/app/components/profile/ProfileHeroDisplay';
import { DEFAULT_BANNER } from '@/app/components/shop/cosmeticsConfig';
import FollowListSheet from '@/app/components/social/FollowListSheet';
import { SocialPost } from '@/app/lib/socialTypes';
import styles from './social.module.css';

const DEFAULT_AVATAR =
  'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=300&q=80';

interface OtherUserProfileProps {
  targetUserId: string;
  myId: string;
}

export default function OtherUserProfile({ targetUserId, myId }: OtherUserProfileProps) {
  const [profile, setProfile] = useState<{
    name: string;
    surname: string;
    handle: string;
    gender: string;
    avatar: string;
    bannerGradient: string;
    bannerImage: string;
    bio: string;
    frozen?: boolean;
    banned?: boolean;
  } | null>(null);
  const [cosmetics, setCosmetics] = useState<PlayerCosmetics | null>(null);
  const [posts, setPosts] = useState<SocialPost[]>([]);
  const [followers, setFollowers] = useState(0);
  const [following, setFollowing] = useState(0);
  const [likesReceived, setLikesReceived] = useState(0);
  const [isFollowing, setIsFollowing] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [reportReason, setReportReason] = useState('');
  const [loading, setLoading] = useState(true);
  const [followListMode, setFollowListMode] = useState<'followers' | 'following' | null>(null);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      const u = await getUserProfile(targetUserId);
      const playerCosmetics = await getPlayerCosmetics(targetUserId);
      setCosmetics(playerCosmetics);
      if (u) {
        setProfile({
          name: u.name,
          surname: u.surname || '',
          handle: u.handle,
          gender: u.gender || '',
          avatar: u.avatar || DEFAULT_AVATAR,
          bannerGradient: u.bannerGradient || DEFAULT_BANNER,
          bannerImage: u.bannerImage || '',
          bio: u.bio || '',
          frozen: u.frozen,
          banned: u.banned,
        });
        const initialLikes = Math.max(
          Number(u.likesReceived) || 0,
          readCachedLikesReceived(targetUserId)
        );
        setLikesReceived(initialLikes);
      }
      setLoading(false);
    })();
  }, [targetUserId]);

  useEffect(() => {
    return listenUserPosts(targetUserId, setPosts);
  }, [targetUserId]);

  useEffect(() => {
    const cached = readCachedLikesReceived(targetUserId);
    if (cached > 0) {
      setLikesReceived((prev) => Math.max(prev, cached));
    }
    return listenUserLikesReceived(targetUserId, (likes) => {
      writeCachedLikesReceived(targetUserId, likes);
      setLikesReceived((prev) => Math.max(prev, likes));
    });
  }, [targetUserId]);

  useEffect(() => {
    const live = posts.reduce((sum, post) => sum + (Number(post.likes) || 0), 0);
    if (live <= 0) return;
    setLikesReceived((prev) => Math.max(prev, live));
    if (live > readCachedLikesReceived(targetUserId)) {
      writeCachedLikesReceived(targetUserId, live);
      void ensureMinLikesReceived(targetUserId, live);
    }
  }, [posts, targetUserId]);

  useEffect(() => {
    return listenFollowCounts(targetUserId, (f1, f2) => {
      setFollowers(f1);
      setFollowing(f2);
    });
  }, [targetUserId]);

  useEffect(() => {
    if (!myId || myId === targetUserId) return;
    return listenIsFollowing(myId, targetUserId, setIsFollowing);
  }, [myId, targetUserId]);

  const handleFollow = async () => {
    if (isFollowing) {
      await unfollowUser(myId, targetUserId);
    } else {
      await followUser(myId, targetUserId);
    }
  };

  const handleReport = async () => {
    if (!reportReason.trim()) return;
    try {
      await reportContent({
        reporterId: myId,
        targetUserId,
        reason: reportReason.trim(),
        type: 'user',
      });
      alert('Şikayət admin panelə göndərildi.');
      setReportReason('');
      setShowReport(false);
    } catch (err) {
      console.error(err);
      alert('Şikayət göndərilmədi.');
    }
  };

  if (loading) {
    return (
      <div className={styles.socialPage} style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ color: '#94a3b8' }}>Yüklənir...</span>
      </div>
    );
  }

  if (!profile || profile.frozen || profile.banned) {
    return (
      <div className={styles.socialPage} style={{ minHeight: '100vh', padding: 40, textAlign: 'center' }}>
        <p style={{ color: '#94a3b8' }}>
          {!profile
            ? 'Profil tapılmadı.'
            : profile.banned
              ? 'Bu hesab bağlanıb.'
              : 'Bu hesab dondurulub.'}
        </p>
        <Link href="/explore" className={styles.primaryBtn} style={{ display: 'inline-block', marginTop: 16, textDecoration: 'none', width: 'auto', padding: '12px 24px' }}>
          Kəşf et-ə qayıt
        </Link>
        <AppBottomNav activeTab="profile" />
      </div>
    );
  }

  return (
    <div className={styles.socialPage}>
      <header className={styles.glassHeader}>
        <Link href="/explore" className={styles.iconBtn} style={{ textDecoration: 'none' }}>←</Link>
        <h1 className={styles.glassTitle}>👤 Profil</h1>
        <div style={{ width: 36 }} />
      </header>

      <ProfileHeroDisplay
        name={profile.name}
        surname={profile.surname}
        avatar={profile.avatar}
        handle={profile.handle}
        metaExtra={`${profile.gender} · ID ${targetUserId}`}
        cosmetics={cosmetics}
        bannerFallback={profile.bannerGradient}
        bannerImage={profile.bannerImage || undefined}
      >
        <div className={styles.statRow}>
          <button type="button" className={styles.statChipBtn} onClick={() => setFollowListMode('followers')}>
            İzləyici: <strong>{followers}</strong>
          </button>
          <button type="button" className={styles.statChipBtn} onClick={() => setFollowListMode('following')}>
            İzlənən: <strong>{following}</strong>
          </button>
          <span>Bəyənmə: <strong>{likesReceived}</strong></span>
          <span>Paylaşım: <strong>{posts.length}</strong></span>
        </div>

        <div className={styles.profileActionRow}>
          <Link href={`/messages?user=${targetUserId}`} className={styles.profileActionBtn}>
            💬 Mesaj yaz
          </Link>
          <button type="button" className={styles.profileActionBtn} onClick={handleFollow}>
            {isFollowing ? '✓ Takib edilir' : '➕ Takip et'}
          </button>
          <button type="button" className={`${styles.profileActionBtn} ${styles.profileActionDanger}`} onClick={() => setShowReport(true)}>
            ⚠️ Şikayət
          </button>
        </div>
      </ProfileHeroDisplay>

      <div style={{ padding: '0 20px 100px' }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: '#e2e8f0', marginBottom: 8 }}>
          Paylaşımlar · {posts.length}
        </div>
        {posts.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 24, color: '#64748b', fontSize: 13 }}>Paylaşım yoxdur</div>
        ) : (
          <div className={styles.postGrid} style={{ padding: 0 }}>
            {posts.map((post) => (
              <div key={post.id} className={styles.postThumb}>
                {post.mediaType === 'video' ? (
                  <video src={post.mediaUrl} muted />
                ) : (
                  <img src={post.mediaUrl} alt={post.title} />
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {showReport && (
        <div className={styles.modalOverlay} onClick={() => setShowReport(false)}>
          <div className={styles.modalSheet} onClick={(e) => e.stopPropagation()}>
            <h2 className={styles.modalTitle}>⚠️ Şikayət et</h2>
            <textarea
              className={styles.input}
              rows={4}
              placeholder="Səbəb..."
              value={reportReason}
              onChange={(e) => setReportReason(e.target.value)}
            />
            <button type="button" className={styles.dangerBtn} onClick={handleReport}>Göndər</button>
          </div>
        </div>
      )}

      <FollowListSheet
        open={followListMode !== null}
        onClose={() => setFollowListMode(null)}
        userId={targetUserId}
        mode={followListMode ?? 'followers'}
        title={followListMode === 'following' ? 'İzlənənlər' : 'İzləyicilər'}
        emptyText={followListMode === 'following' ? 'Heç kimi izləmir.' : 'Hələ izləyici yoxdur.'}
      />

      <AppBottomNav activeTab="profile" />
    </div>
  );
}
