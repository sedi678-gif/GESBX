"use client";

import React, { useEffect, useRef, useState } from 'react';
import { Capacitor, registerPlugin } from '@capacitor/core';
import AppLink from '@/app/components/AppLink';
import AppBottomNav from '@/app/components/AppBottomNav';
import {
  listenExploreFeed,
  listenPostCommentCount,
  toggleLikePost,
  listenUserLikedPostIds,
  recordPostView,
} from '@/app/lib/postsService';
import { reportContent, searchUsers, listenBlockedUsers } from '@/app/lib/socialService';
import { sendPrivateMessage } from '@/app/lib/messageService';
import { UserFeedItem, AppUserProfile } from '@/app/lib/socialTypes';
import { useUser } from '@/context/UserContext';
import { getLocalProfileDisplayName } from '@/app/lib/userId';
import { useAppStrings } from '@/app/lib/useAppStrings';
import PostCommentsSheet from './PostCommentsSheet';
import PostActionIcon from './PostActionIcon';
import styles from './social.module.css';

type NativeSharePlugin = { share(options: { title: string; text: string; url: string }): Promise<void> };
const NativeShare = registerPlugin<NativeSharePlugin>('NativeShare');

const AZ_REGIONS = [
  'Bakı',
  'Abşeron',
  'Ağcabədi',
  'Ağdam',
  'Ağdərə',
  'Ağdaş',
  'Ağstafa',
  'Ağsu',
  'Astara',
  'Babək',
  'Balakən',
  'Bərdə',
  'Beyləqan',
  'Biləsuvar',
  'Cəbrayıl',
  'Cəlilabad',
  'Culfa',
  'Daşkəsən',
  'Füzuli',
  'Gədəbəy',
  'Gəncə',
  'Goranboy',
  'Göyçay',
  'Göygöl',
  'Hacıqabul',
  'Xankəndi',
  'Xaçmaz',
  'Xızı',
  'Xocalı',
  'Xocavənd',
  'İmişli',
  'İsmayıllı',
  'Kəlbəcər',
  'Kəngərli',
  'Kürdəmir',
  'Laçın',
  'Lənkəran',
  'Lerik',
  'Masallı',
  'Mingəçevir',
  'Naftalan',
  'Naxçıvan',
  'Neftçala',
  'Oğuz',
  'Ordubad',
  'Qax',
  'Qazax',
  'Qəbələ',
  'Qobustan',
  'Quba',
  'Qubadlı',
  'Qusar',
  'Saatlı',
  'Sabirabad',
  'Salyan',
  'Samux',
  'Sədərək',
  'Siyəzən',
  'Sumqayıt',
  'Şabran',
  'Şahbuz',
  'Şamaxı',
  'Şəki',
  'Şəmkir',
  'Şərur',
  'Şirvan',
  'Şuşa',
  'Tərtər',
  'Tovuz',
  'Ucar',
  'Yardımlı',
  'Yevlax',
  'Zaqatala',
  'Zəngilan',
  'Zərdab',
];

export default function ExplorePageClient() {
  const { userId } = useUser();
  const t = useAppStrings();
  const myId = userId;

  const [feed, setFeed] = useState<UserFeedItem[]>([]);
  const [filtered, setFiltered] = useState<UserFeedItem[]>([]);
  const [feedError, setFeedError] = useState('');
  const [blockedIds, setBlockedIds] = useState<string[]>([]);
  const [userIndex, setUserIndex] = useState(0);
  const [mediaIndex, setMediaIndex] = useState(0);
  const [liveCommentCount, setLiveCommentCount] = useState(0);
  const [heartBurst, setHeartBurst] = useState(0);

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
  const [showShareSheet, setShowShareSheet] = useState(false);
  const [shareSearch, setShareSearch] = useState('');
  const [shareUsers, setShareUsers] = useState<AppUserProfile[]>([]);
  const [shareBusyId, setShareBusyId] = useState<string | null>(null);
  const [videoMuted, setVideoMuted] = useState(true);
  const videoRef = useRef<HTMLVideoElement | null>(null);

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

  useEffect(() => {
    setVideoMuted(true);
    if (videoRef.current) videoRef.current.muted = true;
  }, [media?.id]);

  const current = filtered[userIndex];
  const media = current?.mediaList[mediaIndex];
  const currentUserId = current?.userId;
  const mediaId = media?.id;

  useEffect(() => {
    setLiveCommentCount(0);
    if (!mediaId) return;
    return listenPostCommentCount(mediaId, setLiveCommentCount);
  }, [mediaId]);

  useEffect(() => {
    if (
      !currentUserId || !mediaId || !myId ||
      myId === 'anonim_user_id' || myId === 'guest' ||
      currentUserId === myId
    ) return;

    void recordPostView(mediaId, myId, currentUserId).catch((err) => console.warn('[Explore] view event failed:', err));
  }, [currentUserId, mediaId, myId]);

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
      setHeartBurst((value) => value + 1);
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

  const handleShare = () => {
    if (!current || !media) return;
    setShareSearch('');
    setShareUsers([]);
    setShowShareSheet(true);
  };

  const getCurrentShareUrl = () => {
    if (!current) return window.location.href;
    return `${window.location.origin}/profile?user=${encodeURIComponent(current.userId)}`;
  };

  const shareOutsideGesbx = async () => {
    if (!current || !media) return;
    const url = getCurrentShareUrl();
    const title = media.title?.trim() || `${current.userName} — GEPS X`;
    const shareData = { title: 'GEPS X', text: `${title} · ${current.userName}`, url };
    try {
      if (Capacitor.isNativePlatform()) {
        await NativeShare.share(shareData);
      } else if (typeof navigator.share === 'function') {
        await navigator.share(shareData);
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        alert('Paylaşım bağlantısı kopyalandı. İstədiyiniz tətbiqə yapışdırın.');
      } else {
        window.prompt('Paylaşım bağlantısını kopyalayın:', url);
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      console.error('[Explore] system share failed:', error);
      try {
        await navigator.clipboard.writeText(url);
        alert('Paylaşım pəncərəsi açılmadı. Bağlantı kopyalandı.');
      } catch {
        window.prompt('Bağlantını kopyalayın:', url);
      }
    }
  };

  const copyShareLink = async () => {
    if (!current || !media) return;
    const url = getCurrentShareUrl();
    try {
      await navigator.clipboard.writeText(url);
      alert('Bağlantı kopyalandı.');
    } catch {
      window.prompt('Bağlantını kopyalayın:', url);
    }
  };

  const toggleVideoSound = async () => {
    const video = videoRef.current;
    const nextMuted = !videoMuted;
    setVideoMuted(nextMuted);
    if (video) {
      video.muted = nextMuted;
      if (!nextMuted) {
        try { await video.play(); } catch (error) { console.warn('[Explore] video playback after unmute failed:', error); }
      }
    }
  };

  const searchShareUsers = async () => {
    if (!shareSearch.trim()) { setShareUsers([]); return; }
    try { setShareUsers(await searchUsers(shareSearch, myId)); }
    catch (error) { console.error(error); alert('İstifadəçilər yüklənmədi.'); }
  };

  const sendPostToUser = async (recipient: AppUserProfile) => {
    if (!current || !media || !myId || myId === 'anonim_user_id' || myId === 'guest') {
      alert('Paylaşmaq üçün hesaba daxil olun.'); return;
    }
    setShareBusyId(recipient.id);
    try {
      const url = window.location.origin + '/profile?user=' + current.userId;
      await sendPrivateMessage({
        senderId: myId,
        recipientId: recipient.id,
        text: 'Səninlə bir paylaşım bölüşdü: ' + current.userName + ' — ' + media.title + '\n' + url,
      });
      alert(recipient.name + ' istifadəçisinə göndərildi.');
      setShowShareSheet(false);
    } catch (error) { console.error(error); alert('Mesaj göndərilmədi.'); }
    finally { setShareBusyId(null); }
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
          <h1 className={styles.exploreTitle}>GESBX</h1>
        </div>
        <button type="button" className={styles.exploreSearchBtn} onClick={() => setShowSearch(true)} aria-label={t.explore.searchTitle}>
          🔍
        </button>
      </header>

      <div className={styles.feedStagePremium} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        {!current || !media ? (
          <div className={styles.emptyFeed}>
            <div className={styles.emptyFeedTitle}>{feedError || t.explore.empty}</div>
            {feedError ? <p>İnternet bağlantısını yoxlayın və yenidən cəhd edin.</p> : null}
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
              <span style={{ color: '#fff', fontSize: 12, fontWeight: 700, textShadow: '0 1px 4px #000' }}>
                {mediaIndex + 1}/{current.mediaList.length}
              </span>
            </div>
            {media.mediaType === 'video' ? (
              <>
                <video ref={videoRef} src={media.mediaUrl} className={styles.mediaFullPremium} autoPlay loop muted={videoMuted} playsInline />
                <button type="button" onClick={() => void toggleVideoSound()} aria-label={videoMuted ? 'Səsi aç' : 'Səsi bağla'} style={{ position: 'absolute', zIndex: 7, top: 54, right: 14, width: 42, height: 42, border: '1px solid rgba(255,255,255,.35)', borderRadius: 999, background: 'rgba(0,0,0,.55)', color: '#fff', fontSize: 20, display: 'grid', placeItems: 'center' }}>
                  {videoMuted ? '🔇' : '🔊'}
                </button>
              </>
            ) : (
              <img src={media.mediaUrl} alt={media.title} className={styles.mediaFullPremium} />
            )}
            {current.mediaList.length > 1 && (
              <>
                <button
                  type="button"
                  aria-label="Əvvəlki şəkil"
                  onClick={() => setMediaIndex((i) => Math.max(0, i - 1))}
                  disabled={mediaIndex === 0}
                  style={{ position: 'absolute', zIndex: 4, left: 12, top: '50%', transform: 'translateY(-50%)', width: 38, height: 38, border: 0, borderRadius: 999, color: '#fff', background: 'rgba(0,0,0,.45)', fontSize: 24, opacity: mediaIndex === 0 ? .3 : 1 }}
                >‹</button>
                <button
                  type="button"
                  aria-label="Növbəti şəkil"
                  onClick={() => setMediaIndex((i) => Math.min(current.mediaList.length - 1, i + 1))}
                  disabled={mediaIndex === current.mediaList.length - 1}
                  style={{ position: 'absolute', zIndex: 4, right: 12, top: '40%', transform: 'translateY(-50%)', width: 38, height: 38, border: 0, borderRadius: 999, color: '#fff', background: 'rgba(0,0,0,.45)', fontSize: 24, opacity: mediaIndex === current.mediaList.length - 1 ? .3 : 1 }}
                >›</button>
              </>
            )}
            <div className={styles.mediaOverlayPremium} />
            {heartBurst > 0 && (
              <div key={heartBurst} className={styles.heartBurst} aria-hidden="true">
                <span className={styles.heartBurstMain}>♥</span>
                {Array.from({ length: 10 }, (_, index) => (
                  <span key={index} className={styles.heartParticle}>♥</span>
                ))}
              </div>
            )}
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
                <span className={styles.actionCountPremium}>{liveCommentCount}</span>
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
            <div className={styles.searchControls}>
              <input
                className={styles.input}
                placeholder="Ad, nickname..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              <button type="button" className={styles.secondaryBtn} onClick={runUserSearch}>
                Saytda axtar
              </button>
              <select className={styles.input} value={region} onChange={(e) => setRegion(e.target.value)}>
                <option value="all">Bütün regionlar</option>
                <optgroup label="Azərbaycan bölgələri">
                  {AZ_REGIONS.map((r) => <option key={r} value={r}>{r}</option>)}
                </optgroup>
                <option value="Beynəlxalq">Beynəlxalq</option>
              </select>
              <select className={styles.input} value={gender} onChange={(e) => setGender(e.target.value)}>
                <option value="all">Hamısı</option>
                <option value="Kişi">Kişi</option>
                <option value="Qadın">Qadın</option>
              </select>
              <button type="button" className={styles.primaryBtn} onClick={applyFilters}>{t.explore.filter}</button>
            </div>
            <div className={styles.searchResultsList}>
              {searchResults.map((u) => (
                <div key={u.id} className={styles.userResult}>
                  <img src={u.avatar || "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100"} alt="" className={styles.avatar} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 800 }}>{u.name} {u.surname}</div>
                    <div style={{ fontSize: 12, color: "#94a3b8" }}>{u.handle}</div>
                  </div>
                  <AppLink
                    href={`/profile?user=${u.id}`}
                    className={styles.secondaryBtn}
                    style={{ textDecoration: "none", padding: "8px 12px", fontSize: 12, width: "auto", flexShrink: 0 }}
                    onClick={() => setShowSearch(false)}
                  >
                    {t.explore.viewProfile}
                  </AppLink>
                </div>
              ))}
            </div>
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

      {showShareSheet && (
        <div className={styles.modalOverlay} onClick={() => setShowShareSheet(false)}>
          <div className={styles.modalSheet} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
              <h2 className={styles.modalTitle}>Paylaşımı göndər</h2>
              <button type="button" className={styles.commentsCloseBtn} onClick={() => setShowShareSheet(false)} aria-label="Bağla">✕</button>
            </div>
            <p style={{ color: '#94a3b8', fontSize: 12 }}>Videonu və ya paylaşımı istədiyiniz tətbiqə göndərin.</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, margin: '12px 0 16px' }}>
              <button type="button" className={styles.secondaryBtn} onClick={() => void shareOutsideGesbx()} style={{ minHeight: 58, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                <span style={{ fontSize: 21 }}>↗</span><span>Digər tətbiqlərdə paylaş<br /><small style={{ opacity: .75 }}>Quick Share və tətbiqlər</small></span>
              </button>
              <button type="button" className={styles.secondaryBtn} onClick={() => void copyShareLink()} style={{ minHeight: 58, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                <span style={{ fontSize: 21 }}>🔗</span><span>Bağlantını kopyala</span>
              </button>
            </div>
            <p style={{ color: '#94a3b8', fontSize: 12 }}>GEPS X daxilində istifadəçiyə göndər:</p>
            <div className={styles.searchControls}>
              <input className={styles.input} placeholder="Ad və ya nickname..." value={shareSearch} onChange={(e) => setShareSearch(e.target.value)} />
              <button type="button" className={styles.secondaryBtn} onClick={() => void searchShareUsers()}>Axtar</button>
            </div>
            <div style={{ display: 'grid', gap: 8, maxHeight: '42vh', overflowY: 'auto' }}>
              {shareUsers.map((person) => (
                <button key={person.id} type="button" disabled={shareBusyId !== null} onClick={() => void sendPostToUser(person)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 10, borderRadius: 12, border: '1px solid rgba(148,163,184,.22)', background: 'rgba(15,23,42,.8)', color: '#f8fafc', textAlign: 'left' }}>
                  {person.avatar ? <img src={person.avatar} alt="" style={{ width: 38, height: 38, borderRadius: '50%', objectFit: 'cover' }} /> : <span style={{ width: 38, height: 38, borderRadius: '50%', display: 'grid', placeItems: 'center', background: '#334155' }}>{person.name.charAt(0)}</span>}
                  <span style={{ flex: 1 }}>{person.name} <small style={{ display: 'block', color: '#94a3b8' }}>{person.handle}</small></span>
                  <span>{shareBusyId === person.id ? 'Göndərilir…' : 'Göndər'}</span>
                </button>
              ))}
              {shareSearch.trim() && shareUsers.length === 0 ? <p style={{ color: '#94a3b8', fontSize: 12 }}>Nəticə yoxdur. Axtarış et.</p> : null}
            </div>
            <button type="button" className={styles.postViewerCloseBtn} onClick={() => setShowShareSheet(false)} style={{ marginTop: 14 }}>Bağla</button>
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
