"use client";

import React, { useEffect, useRef, useState } from 'react';
import AppLink from '@/app/components/AppLink';
import AppBottomNav from '@/app/components/AppBottomNav';
import { listenExploreFeed, toggleLikePost, listenUserLikedPostIds } from '@/app/lib/postsService';
import { reportContent, searchUsers, listenBlockedUsers } from '@/app/lib/socialService';
import { UserFeedItem, AppUserProfile } from '@/app/lib/socialTypes';
import { useUser } from '@/context/UserContext';
import { getLocalProfileUserId, getLocalProfileDisplayName } from '@/app/lib/userId';
import { useAppStrings } from '@/app/lib/useAppStrings';
import PostCommentsSheet from './PostCommentsSheet';
import PostActionIcon from './PostActionIcon';
import styles from './social.module.css';

const AZ_REGIONS = [
  'Bakı', 'Gəncə', 'Sumqayıt', 'Abşeron', 'Lənkəran', 'Şəki', 'Mingəçevir', 'Beynəlxalq',
];

export default function ExplorePageClient() {
  const { userId } = useUser();
  const t = useAppStrings();
  const myId = userId !== 'anonim_user_id' ? userId : getLocalProfileUserId() || userId;

  const [feed, setFeed] = useState<UserFeedItem[]>([]);
  const [filtered, setFiltered] = useState<UserFeedItem[]>([]);
  const [feedError, setFeedError] = useState('');
  const [blockedIds, setBlockedIds] = useState<string[]>([]);
  const [userIndex, setUserIndex] = useState(0);
  const [mediaIndex, setMediaIndex] = useState(0);

  const [showSearch, setShowSearch] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<AppUserProfile[]>([]);
  const [region, setRegion] = useState('all');
  const [gender, setGender] = useState('all');
  const [reportReason, setReportReason] = useState('');
  const [likedPostIds, setLikedPostIds] = useState<Set<string>>(new Set());
  const [likeBusy, setLikeBusy] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [commentPostId, setCommentPostId] = useState<string | null>(null);
  const [commentPostTitle, setCommentPostTitle] = useState('');

  const touchStart = useRef({ x: 0, y: 0 });

  useEffect(() => {
    if (!myId) return;
    return listenBlockedUsers(myId, setBlockedIds);
  }, [myId]);

  useEffect(() => {
    if (!myId || myId === 'anonim_user_id') return;
    return listenUserLikedPostIds(myId, setLikedPostIds);
  }, [myId]);

  useEffect(() => {
    setFeedError('');
    return listenExploreFeed(
      (items) => {
        setFeed(items);
        setFiltered(items);
      },
      blockedIds,
      setFeedError
    );
  }, [blockedIds]);

  useEffect(() => {
    setMediaIndex(0);
  }, [userIndex]);

  const current = filtered[userIndex];
  const media = current?.mediaList[mediaIndex];

  const applyFilters = () => {
    const q = searchQuery.trim().toLowerCase();
    const next = feed.filter((item) => {
      const nameOk =
        !q ||
        item.userName.toLowerCase().includes(q) ||
        item.userHandle.toLowerCase().includes(q);
      const regionOk = region === 'all' || item.userRegion === region;
      const genderOk = gender === 'all' || item.userGender === gender;
      return nameOk && regionOk && genderOk;
    });
    setFiltered(next);
    setUserIndex(0);
    setShowSearch(false);
  };

  const runUserSearch = async () => {
    const results = await searchUsers(searchQuery, myId);
    setSearchResults(results);
  };

  const onTouchStart = (e: React.TouchEvent) => {
    touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };

  const onTouchEnd = (e: React.TouchEvent) => {
    const dx = touchStart.current.x - e.changedTouches[0].clientX;
    const dy = touchStart.current.y - e.changedTouches[0].clientY;
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 50) {
      if (dx > 0 && current && mediaIndex < current.mediaList.length - 1) setMediaIndex((i) => i + 1);
      if (dx < 0 && mediaIndex > 0) setMediaIndex((i) => i - 1);
    } else if (Math.abs(dy) > 50) {
      if (dy > 0 && userIndex < filtered.length - 1) setUserIndex((i) => i + 1);
      if (dy < 0 && userIndex > 0) setUserIndex((i) => i - 1);
    }
  };

  const handleLike = async () => {
    if (!media || likeBusy) return;
    if (myId === 'anonim_user_id' || !myId) {
      alert('Bəyənmək üçün profil qeydiyyatı tələb olunur.');
      return;
    }
    if (likedPostIds.has(media.id)) {
      alert('Bu paylaşımı artıq bəyənmisiniz.');
      return;
    }
    setLikeBusy(true);
    try {
      const result = await toggleLikePost(media.id, myId);
      if (result.alreadyLiked) {
        alert('Bu paylaşımı artıq bəyənmisiniz.');
      }
      setLikedPostIds((prev) => new Set(prev).add(media.id));
    } catch (err) {
      console.error(err);
      alert('Bəyənmə qeydə alınmadı.');
    } finally {
      setLikeBusy(false);
    }
  };

  const handleReport = async () => {
    if (!current || !reportReason.trim()) return;
    if (myId === 'anonim_user_id' || !myId) {
      alert('Şikayət üçün profil qeydiyyatı tələb olunur.');
      return;
    }
    try {
      await reportContent({
        reporterId: myId,
        targetUserId: current.userId,
        targetPostId: media?.id,
        reason: reportReason.trim(),
        type: 'post',
      });
      alert('Şikayətiniz admin panelə göndərildi.');
      setShowReport(false);
      setReportReason('');
    } catch (err) {
      console.error(err);
      alert('Şikayət göndərilmədi. Yenidən cəhd edin.');
    }
  };

  const openComments = () => {
    if (!media) return;
    setCommentPostId(media.id);
    setCommentPostTitle(media.title || current?.userName || '');
    setCommentsOpen(true);
  };

  const handleShare = async () => {
    if (!current || !media) return;
    const url = `${window.location.origin}/profile?user=${current.userId}`;
    const text = `${current.userName} — ${media.title}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: text, text, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      alert('Paylaşım linki kopyalandı.');
    } catch {
      /* istifadəçi ləğv etdi */
    }
  };

  const isMediaLiked = media ? likedPostIds.has(media.id) : false;

  const closeComments = () => {
    setCommentsOpen(false);
    setCommentPostId(null);
    setCommentPostTitle('');
  };

  const displayName = getLocalProfileDisplayName();

  return (
    <div className={`${styles.socialPage} ${styles.exploreWorld}`}>
      <div className={styles.exploreGlow} aria-hidden />
      <header className={styles.exploreHeader}>
        <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
          <h1 className={styles.exploreTitle}>✨ {t.explore.title}</h1>
          <p className={styles.exploreSub}>{t.explore.emptyHint}</p>
        </div>
        <button type="button" className={styles.exploreSearchBtn} onClick={() => setShowSearch(true)} aria-label={t.explore.searchTitle}>
          🔍
        </button>
      </header>

      <div className={styles.feedStagePremium} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        {!current || !media ? (
          <div className={styles.emptyFeed}>
            <div className={styles.emptyFeedTitle}>{feedError || t.explore.empty}</div>
            <p>{feedError ? 'İnternet bağlantısını yoxlayın və yenidən cəhd edin.' : t.explore.emptyHint}</p>
            <AppLink href="/profile" className={styles.primaryBtn} style={{ display: 'inline-block', marginTop: 16, textDecoration: 'none', width: 'auto', padding: '12px 24px' }}>
              {t.explore.goProfile}
            </AppLink>
          </div>
        ) : (
          <div className={styles.mediaFramePremium}>
            <div className={styles.storyDotsPremium}>
              {current.mediaList.map((_, i) => (
                <div key={i} className={`${styles.storyDotPremium} ${i === mediaIndex ? styles.storyDotPremiumActive : ''}`} />
              ))}
            </div>
            {media.mediaType === 'video' ? (
              <video src={media.mediaUrl} className={styles.mediaFullPremium} autoPlay loop muted playsInline />
            ) : (
              <img src={media.mediaUrl} alt={media.title} className={styles.mediaFullPremium} />
            )}
            <div className={styles.mediaOverlayPremium} />
            <div className={styles.userChipPremium}>
              <AppLink href={`/profile?user=${current.userId}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                <p className={styles.userChipName}>
                  {current.boostedUntil ? '⚡ ' : ''}
                  {current.userName}
                </p>
                <p className={styles.userChipMeta}>
                  {current.userHandle} · {media.title}
                  {current.userRegion ? ` · ${current.userRegion}` : ''}
                </p>
              </AppLink>
            </div>
            <div className={styles.sideActionsPremium}>
              <button
                type="button"
                className={`${styles.actionBtnPremium} ${styles.actionBtnPremiumWithCount}`}
                onClick={handleLike}
                disabled={likeBusy || isMediaLiked}
                style={isMediaLiked ? { opacity: 0.7 } : undefined}
                aria-label="Bəyən"
              >
                <PostActionIcon kind={isMediaLiked ? 'like-active' : 'like'} alt="Bəyən" />
                <span className={styles.actionCountPremium}>{media.likes}</span>
              </button>
              <button
                type="button"
                className={`${styles.actionBtnPremium} ${styles.actionBtnPremiumWithCount}`}
                onClick={openComments}
                aria-label="Şərh"
              >
                <PostActionIcon kind="comment" alt="Şərh" />
                <span className={styles.actionCountPremium}>{media.commentsCount ?? 0}</span>
              </button>
              <button
                type="button"
                className={styles.actionBtnPremium}
                onClick={() => void handleShare()}
                aria-label="Paylaş"
              >
                <PostActionIcon kind="share" alt="Paylaş" />
              </button>
              <button
                type="button"
                className={styles.actionBtnPremium}
                onClick={() => setShowReport(true)}
                aria-label="Bildir"
              >
                <PostActionIcon kind="report" alt="Bildir" />
              </button>
            </div>
          </div>
        )}
      </div>

      {showSearch && (
        <div className={styles.modalOverlay} onClick={() => setShowSearch(false)}>
          <div className={styles.modalSheet} onClick={(e) => e.stopPropagation()}>
            <h2 className={styles.modalTitle}>🔍 {t.explore.searchTitle}</h2>
            <input
              className={styles.input}
              placeholder="Ad, nickname..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <button type="button" className={styles.secondaryBtn} onClick={runUserSearch}>
              Saytda axtar
            </button>
            {searchResults.map((u) => (
              <div key={u.id} className={styles.userResult}>
                <img src={u.avatar || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100'} alt="" className={styles.avatar} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 800 }}>{u.name} {u.surname}</div>
                  <div style={{ fontSize: 12, color: '#94a3b8' }}>{u.handle}</div>
                </div>
                <AppLink
                  href={`/profile?user=${u.id}`}
                  className={styles.secondaryBtn}
                  style={{ textDecoration: 'none', padding: '8px 12px', fontSize: 12, width: 'auto' }}
                  onClick={() => setShowSearch(false)}
                >
                  {t.explore.viewProfile}
                </AppLink>
              </div>
            ))}
            <select className={styles.input} value={region} onChange={(e) => setRegion(e.target.value)}>
              <option value="all">Bütün regionlar</option>
              {AZ_REGIONS.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
            <select className={styles.input} value={gender} onChange={(e) => setGender(e.target.value)}>
              <option value="all">Hamısı</option>
              <option value="Kişi">Kişi</option>
              <option value="Qadın">Qadın</option>
            </select>
            <button type="button" className={styles.primaryBtn} onClick={applyFilters}>{t.explore.filter}</button>
          </div>
        </div>
      )}

      {showReport && (
        <div className={styles.modalOverlay} onClick={() => setShowReport(false)}>
          <div className={styles.modalSheet} onClick={(e) => e.stopPropagation()}>
            <h2 className={styles.modalTitle}>⚠️ {t.explore.report}</h2>
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

      <PostCommentsSheet
        open={commentsOpen}
        postId={commentPostId}
        postTitle={commentPostTitle}
        onClose={closeComments}
        currentUserId={myId}
        currentUserName={displayName}
      />

      <AppBottomNav activeTab="explore" />
    </div>
  );
}
