"use client";

import React, { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { addPostComment, listenPostComments, listenPostCommentLikes, togglePostCommentLike, editOwnPostComment, deleteOwnPostComment, reportPostComment } from '@/app/lib/postsService';
import type { PostComment } from '@/app/lib/socialTypes';
import styles from './social.module.css';

const commentLikeCache = new Map<string, Record<string, { count: number; liked: boolean }>>();

interface PostCommentsSheetProps {
  open: boolean;
  postId: string | null;
  postTitle?: string;
  onClose: () => void;
  currentUserId: string;
  currentUserName: string;
  currentUserAvatar?: string;
}

export default function PostCommentsSheet(props: PostCommentsSheetProps) {
  const { open, postId, postTitle, onClose, currentUserId, currentUserName, currentUserAvatar } = props;
  const [comments, setComments] = useState<PostComment[]>([]);
  const [text, setText] = useState('');
  const [replyTo, setReplyTo] = useState<PostComment | null>(null);
  const [editingComment, setEditingComment] = useState<PostComment | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [likes, setLikes] = useState<Record<string, { count: number; liked: boolean }>>(() => commentLikeCache.get(`${postId || ''}:${currentUserId}`) || {});
  const [likeBusy, setLikeBusy] = useState<string | null>(null);
  const [activeCommentMenu, setActiveCommentMenu] = useState<string | null>(null);
  const commentHoldTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const likeActionAtRef = useRef<Record<string, number>>({});
  const pendingCommentLikesRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!open || !postId) { setComments([]); setText(''); setReplyTo(null); setError(''); return; }
    return listenPostComments(postId, setComments, setError);
  }, [open, postId]);

  useEffect(() => {
    const cached = commentLikeCache.get(`${postId || ''}:${currentUserId}`);
    setLikes(cached || {});
  }, [postId, currentUserId]);

  useEffect(() => {
    if (postId && currentUserId) commentLikeCache.set(`${postId}:${currentUserId}`, likes);
  }, [likes, postId, currentUserId]);

  useEffect(() => {
    if (!open || !postId) return;
    return listenPostCommentLikes(postId, currentUserId, (serverLikes) => {
      setLikes((previous) => {
        const merged = { ...serverLikes };
        // Ignore a stale poll that began before a just-completed tap.
        Object.entries(previous).forEach(([commentId, state]) => {
          if (Date.now() - (likeActionAtRef.current[commentId] || 0) < 10000) {
            merged[commentId] = state;
          }
        });
        return merged;
      });
    });
  }, [open, postId, currentUserId]);

  const roots = useMemo(() => comments.filter((comment) => !comment.parentCommentId), [comments]);
  const repliesByParent = useMemo(() => {
    const grouped: Record<string, PostComment[]> = {};
    comments.filter((comment) => comment.parentCommentId).forEach((comment) => {
      const parentId = comment.parentCommentId!;
      if (!grouped[parentId]) grouped[parentId] = [];
      grouped[parentId].push(comment);
    });
    return grouped;
  }, [comments]);

  if (!open || !postId) return null;

  const clearCommentHoldTimer = () => {
    if (commentHoldTimerRef.current) { clearTimeout(commentHoldTimerRef.current); commentHoldTimerRef.current = null; }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = text.trim();
    if (loading) return;
    if (!postId) {
      setError('Bu paylaşımın identifikatoru tapılmadı. Şərhləri bağlayıb yenidən açın.');
      return;
    }
    if (!trimmed) {
      setError(replyTo ? 'Cavab mətnini yazın.' : 'Şərh mətnini yazın.');
      return;
    }
    if (!currentUserId || currentUserId === 'anonim_user_id' || currentUserId === 'guest') {
      alert('Şərh yazmaq üçün profil qeydiyyatı tələb olunur.');
      return;
    }
    setLoading(true); setError('');
    try {
      if (editingComment) {
        await editOwnPostComment(editingComment.id, currentUserId, trimmed);
        setEditingComment(null);
      } else {
        await addPostComment(postId, { id: currentUserId, name: currentUserName, avatar: currentUserAvatar }, trimmed, replyTo?.id);
        setReplyTo(null);
      }
      setText('');
    } catch (err) {
      console.error(err);
      const message = err instanceof Error ? err.message : 'Şərh göndərilmədi.';
      setError(message.includes('permission') || message.includes('insufficient')
        ? 'Şərh göndərmək üçün hesab icazəsi təsdiqlənmədi. Hesabdan çıxıb yenidən daxil olun.'
        : message);
    } finally { setLoading(false); }
  };

  const renderComment = (comment: PostComment, depth = 0): React.ReactNode => {
    const stats = likes[comment.id] || { count: 0, liked: false };
    const childComments = depth === 0 ? (repliesByParent[comment.id] || []) : [];
    return (
      <React.Fragment key={comment.id}>
        <div className={styles.commentItem} style={depth > 0 ? { marginLeft: Math.min(depth, 4) * 24, borderLeft: '2px solid rgba(99,102,241,.35)', paddingLeft: 10 } : undefined}>
          {comment.userAvatar ? (
            <>
              <img src={comment.userAvatar} alt="" className={styles.commentAvatar}
                onError={(event) => {
                  event.currentTarget.style.display = 'none';
                  const fallback = event.currentTarget.nextElementSibling as HTMLElement | null;
                  if (fallback) fallback.style.display = 'grid';
                }} />
              <div className={styles.commentAvatarFallback} style={{ display: 'none' }}>{comment.userName.charAt(0)}</div>
            </>
          ) : <div className={styles.commentAvatarFallback}>{comment.userName.charAt(0)}</div>}
          <div className={styles.commentBody}>
            <Link className={styles.commentAuthor} href={`/profile?user=${encodeURIComponent(comment.userId)}`}>{comment.userName}</Link>
            <div className={styles.commentText}
              onPointerDown={(event) => { if (event.pointerType === 'mouse' && event.button !== 0) return; clearCommentHoldTimer(); commentHoldTimerRef.current = setTimeout(() => setActiveCommentMenu(comment.id), 520); }}
              onPointerUp={clearCommentHoldTimer} onPointerCancel={clearCommentHoldTimer} onPointerLeave={clearCommentHoldTimer}
              onContextMenu={(event) => { event.preventDefault(); clearCommentHoldTimer(); setActiveCommentMenu(comment.id); }}
            >{comment.text}</div>
            <div className={styles.commentActions}>
              <button
                type="button"
                className={styles.commentLikeButton + (stats.liked ? ' ' + styles.commentLiked : '')}
                disabled={likeBusy === comment.id}
                onClick={async () => {
                  if (!currentUserId || currentUserId === 'anonim_user_id' || currentUserId === 'guest') { alert('Bəyənmək üçün qeydiyyatdan keçin.'); return; }
                  if (pendingCommentLikesRef.current.has(comment.id)) return;
                  pendingCommentLikesRef.current.add(comment.id);
                  setLikeBusy(comment.id);
                  likeActionAtRef.current[comment.id] = Date.now();
                  const previous = likes[comment.id] || { count: 0, liked: false };
                  const optimisticLiked = !previous.liked;
                  setLikes((prev) => ({
                    ...prev,
                    [comment.id]: {
                      count: Math.max(0, previous.count + (optimisticLiked ? 1 : -1)),
                      liked: optimisticLiked,
                    },
                  }));
                  try {
                    const confirmedLiked = await togglePostCommentLike(comment, currentUserId);
                    likeActionAtRef.current[comment.id] = Date.now();
                    setLikes((prev) => ({
                      ...prev,
                      [comment.id]: { ...prev[comment.id], liked: confirmedLiked },
                    }));
                  } catch (err) {
                    delete likeActionAtRef.current[comment.id];
                    setLikes((prev) => ({ ...prev, [comment.id]: previous }));
                    console.error('Şərh bəyənmə xətası:', err);
                    setError(err instanceof Error ? err.message : 'Şərhi bəyənmək alınmadı. Hesab icazəsini yoxlayın.');
                  } finally { pendingCommentLikesRef.current.delete(comment.id); setLikeBusy((active) => active === comment.id ? null : active); }
                }}
              >
                <span aria-hidden="true">{stats.liked ? '♥' : '♡'}</span>
                {stats.liked ? 'Bəyənildi' : 'Bəyən'}
                {stats.count > 0 && <span className={styles.commentLikeCount}>{stats.count}</span>}
              </button>
              <button type="button" className={styles.commentReplyButton} onClick={() => { setActiveCommentMenu(null); setEditingComment(null); setReplyTo(comment); setText(''); setError(''); }} aria-label="Şərhə cavab yaz" title="Cavab yaz">↩</button>
            </div>
            {activeCommentMenu === comment.id && (
              <div className={styles.commentContextMenu} role="menu" aria-label="Şərh seçimləri">
                {comment.userId === currentUserId ? <>
                  <button type="button" role="menuitem" onClick={() => { setActiveCommentMenu(null); setEditingComment(comment); setReplyTo(null); setText(comment.text); setError(''); }}>Düzənlə</button>
                  <button type="button" role="menuitem" className={styles.commentContextDanger} onClick={async () => { setActiveCommentMenu(null); if (!window.confirm('Bu şərhi silmək istəyirsiniz?')) return; try { await deleteOwnPostComment(comment.id, currentUserId); } catch (err) { setError(err instanceof Error ? err.message : 'Şərh silinmədi.'); } }}>Şərhi sil</button>
                </> : <button type="button" role="menuitem" className={styles.commentContextDanger} onClick={async () => { setActiveCommentMenu(null); const reason = window.prompt('Şikayət səbəbini yazın:'); if (!reason?.trim()) return; try { await reportPostComment(comment.id, currentUserId, reason); alert('Şikayət göndərildi.'); } catch (err) { setError(err instanceof Error ? err.message : 'Şikayət göndərilmədi.'); } }}>Şikayət et</button>}
                <button type="button" role="menuitem" onClick={() => setActiveCommentMenu(null)}>Bağla</button>
              </div>
            )}
          </div>
        </div>
        {childComments.map((child) => renderComment(child, depth + 1))}
      </React.Fragment>
    );
  };

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modalSheet + ' ' + styles.commentsSheet} onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Şərhlər">
        <div className={styles.commentsSheetHead}>
          <h2 className={styles.modalTitle}>💬 Şərhlər</h2>
          {postTitle ? <p className={styles.commentsSheetSub}>{postTitle}</p> : null}
          <button type="button" className={styles.commentsCloseBtn} onClick={onClose} aria-label="Bağla">✕</button>
        </div>
        <div className={styles.commentsList}>
          {error && <div className={styles.commentsError}>{error}</div>}
          {roots.length === 0 ? <div className={styles.commentsEmpty}>İlk şərhi sən yaz!</div> : roots.map((comment) => renderComment(comment))}
        </div>
        <form className={styles.commentForm} onSubmit={handleSubmit}>
          {editingComment && (
            <div className={styles.replyingToBar}>
              <span className={styles.replyingToName}>Şərhi düzəlt</span>
              <button type="button" onClick={() => { setEditingComment(null); setText(''); }}>Ləğv et ✕</button>
            </div>
          )}
          {replyTo && (
            <div className={styles.replyingToBar}>
              <span className={styles.replyingToName}>{replyTo.userName}</span>
              <button type="button" onClick={() => setReplyTo(null)}>Ləğv et ✕</button>
            </div>
          )}
          <input type="text" value={text} onChange={(e) => setText(e.target.value)} placeholder={editingComment ? 'Şərhi düzəlt...' : replyTo ? 'Cavabını yaz...' : 'Şərh yaz...'} className={styles.commentInput} maxLength={500} disabled={loading} />
          <button type="submit" className={styles.commentSubmit} disabled={loading || !text.trim()}>{loading ? '...' : editingComment ? 'Yadda saxla' : replyTo ? 'Cavabla' : 'Göndər'}</button>
        </form>
      </div>
    </div>
  );
}
