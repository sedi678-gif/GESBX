"use client";

import React, { useEffect, useRef, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/firebase';
import Link from 'next/link';
import AppBottomNav from '@/app/components/AppBottomNav';
import {
  listenUserPosts,
  listenUserLikesReceived,
  listenUserViewsReceived,
  readCachedLikesReceived,
  readCachedViewsReceived,
  writeCachedLikesReceived,
  writeCachedViewsReceived,
  recordPostView,
} from '@/app/lib/postsService';
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
import profileStyles from '@/app/components/profile/profile.module.css';

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
  const [publicPlayer, setPublicPlayer] = useState<{ allianceName?: string | null; score?: number } | null>(null);
  const [posts, setPosts] = useState<SocialPost[]>([]);
  const [followers, setFollowers] = useState(0);
  const [following, setFollowing] = useState(0);
  const [likesReceived, setLikesReceived] = useState(0);
  const [viewsReceived, setViewsReceived] = useState(0);
  const [isFollowing, setIsFollowing] = useState(false);
  const [followBusy, setFollowBusy] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [reportReason, setReportReason] = useState('');
  const [loading, setLoading] = useState(true);
  const [followListMode, setFollowListMode] = useState<'followers' | 'following' | null>(null);
  const postGridRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      setProfile(null);
      setPublicPlayer(null);
      try {
        const u = await getUserProfile(targetUserId);
        if (!u) return;
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
        try {
          const publicPlayerSnap = await getDoc(doc(db, 'public_players', targetUserId));
          if (publicPlayerSnap.exists()) {
            const publicData = publicPlayerSnap.data();
            setPublicPlayer({ allianceName: typeof publicData.allianceName === 'string' ? publicData.allianceName : null, score: Number(publicData.score) || 0 });
          }
        } catch (publicPlayerError) {
          console.warn('[OtherUserProfile] public player data unavailable:', publicPlayerError);
        }
        const initialLikes = Math.max(Number(u.likesReceived) || 0, readCachedLikesReceived(targetUserId));
        setLikesReceived(initialLikes);
        setViewsReceived(Math.max(Number(u.viewsReceived) || 0, readCachedViewsReceived(targetUserId)));
        try {
          setCosmetics(await getPlayerCosmetics(targetUserId));
        } catch (cosmeticsError) {
          console.warn('[OtherUserProfile] cosmetics unavailable:', cosmeticsError);
          setCosmetics(null);
        }
      } catch (error) {
        console.error('[OtherUserProfile] profile load failed:', error);
        setProfile(null);
      } finally {
        setLoading(false);
      }
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
    const cached = readCachedViewsReceived(targetUserId);
    if (cached > 0) setViewsReceived(cached);
    return listenUserViewsReceived(targetUserId, (views) => {
      writeCachedViewsReceived(targetUserId, views);
      setViewsReceived(views);
    });
  }, [targetUserId]);

  useEffect(() => {
    const grid = postGridRef.current;
    if (
      !grid || !myId || myId === targetUserId || myId === 'anonim_user_id' ||
      myId === 'guest' || posts.length === 0
    ) return;

    const nodes = grid.querySelectorAll<HTMLElement>('[data-post-view-id]');
    const trackVisiblePost = (postId: string) => {
      void recordPostView(postId, myId, targetUserId).catch((err) => console.warn('[Feed] view event failed:', err));
    };

    if (typeof IntersectionObserver === 'undefined') {
      nodes.forEach((node) => {
        if (node.dataset.postViewId) trackVisiblePost(node.dataset.postViewId);
      });
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting || entry.intersectionRatio < 0.5) return;
          const postId = (entry.target as HTMLElement).dataset.postViewId;
          if (postId) trackVisiblePost(postId);
          observer.unobserve(entry.target);
        });
      },
      { threshold: [0.5] }
    );
    nodes.forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, [myId, posts, targetUserId]);

  useEffect(() => {
    const live = posts.reduce((sum, post) => sum + (Number(post.likes) || 0), 0);
    if (live <= 0) return;
    setLikesReceived((prev) => Math.max(prev, live));
    if (live > readCachedLikesReceived(targetUserId)) {
      writeCachedLikesReceived(targetUserId, live);
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
    if (!myId || myId === 'anonim_user_id' || myId === 'guest' || followBusy) {
      alert('Takib etmək üçün hesabınıza daxil olun.');
      return;
    }
    setFollowBusy(true);
    try {
      if (isFollowing) await unfollowUser(myId, targetUserId);
      else await followUser(myId, targetUserId);
    } catch (error) {
      console.error('[OtherUserProfile] follow action failed:', error);
      alert('Takib əməliyyatı alınmadı. Bir daha cəhd edin.');
    } finally {
      setFollowBusy(false);
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
      <div className={profileStyles.profileWorld} style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className={profileStyles.profileGlow} aria-hidden />
        <span style={{ position: 'relative', zIndex: 1, color: '#94a3b8' }}>Yüklənir...</span>
      </div>
    );
  }

  if (!profile || profile.frozen || profile.banned) {
    return (
      <div className={profileStyles.profileWorld} style={{ minHeight: '100vh', padding: 40, textAlign: 'center' }}>
        <div className={profileStyles.profileGlow} aria-hidden />
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
    <div className={profileStyles.profileWorld}>
      <div className={profileStyles.profileGlow} aria-hidden />
      <header className={profileStyles.profileTopBar}>
        <div className={profileStyles.profileTopLeft}>
          <Link href="/explore" className={profileStyles.settingsBtn} aria-label="Kəşf et-ə qayıt" style={{ color: '#e2e8f0', display: 'grid', placeItems: 'center' }}>←</Link>
          <div>
            <p className={profileStyles.profileEyebrow}>GESBX İSTİFADƏÇİ PROFİLİ</p>
            <h1 className={profileStyles.profileTopTitle}>👤 Profil</h1>
          </div>
        </div>
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
        <div className={profileStyles.statPills}>
          <button type="button" className={`${profileStyles.statPill} ${profileStyles.statPillBtn}`} onClick={() => setFollowListMode('followers')}>
            <span className={profileStyles.statPillValue}>{followers}</span><span className={profileStyles.statPillLabel}>İzləyici</span>
          </button>
          <button type="button" className={`${profileStyles.statPill} ${profileStyles.statPillBtn}`} onClick={() => setFollowListMode('following')}>
            <span className={profileStyles.statPillValue}>{following}</span><span className={profileStyles.statPillLabel}>İzlənən</span>
          </button>
          <div className={profileStyles.statPill}><span className={profileStyles.statPillValue}>{likesReceived}</span><span className={profileStyles.statPillLabel}>Bəyənmə</span></div>
          <div className={profileStyles.statPill}><span className={profileStyles.statPillValue}>{viewsReceived}</span><span className={profileStyles.statPillLabel}>İzlənmə</span></div>
        </div>

        <div className={styles.profileActionRow} style={{ position: 'relative', zIndex: 1, margin: '14px 16px 18px' }}>
          <Link href={`/messages?user=${targetUserId}`} className={styles.profileActionBtn}>
            💬 Mesaj yaz
          </Link>
          <button type="button" className={styles.profileActionBtn} onClick={handleFollow} disabled={followBusy || !myId || myId === "anonim_user_id" || myId === "guest"}>
            {followBusy ? 'Gözləyin…' : isFollowing ? '✓ Takib edilir' : '➕ Takip et'}
          </button>
          <button type="button" className={`${styles.profileActionBtn} ${styles.profileActionDanger}`} onClick={() => setShowReport(true)}>
            ⚠️ Şikayət
          </button>
        </div>
      </ProfileHeroDisplay>

      <div style={{ position: 'relative', zIndex: 1, padding: '0 20px 100px' }}>
        {profile.bio && <div style={{ margin: '0 0 18px', padding: '14px 16px', borderRadius: 18, background: 'rgba(8,12,28,.78)', border: '1px solid rgba(34,211,238,.18)', color: '#cbd5e1', fontSize: 13, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{profile.bio}</div>}
        <section aria-label="İttifaq və reytinq" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10, marginBottom: 18 }}>
          <div style={{ minWidth: 0, padding: '14px 12px', borderRadius: 16, background: 'rgba(8,12,28,.82)', border: '1px solid rgba(99,102,241,.28)' }}>
            <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 800, marginBottom: 6 }}>🛡️ İTTİFAQ</div>
            <div style={{ color: '#f8fafc', fontSize: 14, fontWeight: 800, overflowWrap: 'anywhere' }}>{publicPlayer?.allianceName || 'İttifaqa qoşulmayıb'}</div>
          </div>
          <div style={{ minWidth: 0, padding: '14px 12px', borderRadius: 16, background: 'rgba(8,12,28,.82)', border: '1px solid rgba(236,72,153,.28)' }}>
            <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 800, marginBottom: 6 }}>🏆 REYTİNQ</div>
            <div style={{ color: '#f8fafc', fontSize: 14, fontWeight: 800 }}>{Math.max(0, Math.floor(publicPlayer?.score || 0))} xal</div>
          </div>
        </section>
        <div style={{ fontSize: 13, fontWeight: 800, color: '#e2e8f0', marginBottom: 8 }}>
          Paylaşımlar · {posts.length}
        </div>
        {posts.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 24, color: '#64748b', fontSize: 13 }}>Paylaşım yoxdur</div>
        ) : (
          <div ref={postGridRef} className={styles.postGrid} style={{ padding: 0 }}>
            {posts.map((post) => (
              <div key={post.id} className={styles.postThumb} data-post-view-id={post.id}>
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
