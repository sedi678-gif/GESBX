"use client";

import React, { useEffect, useMemo, useState } from 'react';
import { addPostComment, listenPostComments, listenPostCommentLikes, togglePostCommentLike } from '@/app/lib/postsService';
import type { PostComment } from '@/app/lib/socialTypes';
import styles from './social.module.css';

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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [likes, setLikes] = useState<Record<string, { count: number; liked: boolean }>>({});
  const [likeBusy, setLikeBusy] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !postId) { setComments([]); setText(''); setReplyTo(null); setError(''); setLikes({}); return; }
    return listenPostComments(postId, setComments, setError);
  }, [open, postId]);

  useEffect(() => {
    if (!open || !postId) return;
    return listenPostCommentLikes(postId, currentUserId, setLikes);
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
      await addPostComment(postId, { id: currentUserId, name: currentUserName, avatar: currentUserAvatar }, trimmed, replyTo?.id);
      setText(''); setReplyTo(null);
    } catch (err) {
      console.error(err);
      const message = err instanceof Error ? err.message : 'Şərh göndərilmədi.';
      setError(message.includes('permission') || message.includes('insufficient')
        ? 'Şərh göndərmək üçün hesab icazəsi təsdiqlənmədi. Hesabdan çıxıb yenidən daxil olun.'
        : message);
    } finally { setLoading(false); }
  };

  const renderComment = (comment: PostComment, isReply = false): React.ReactNode => {
    const stats = likes[comment.id] || { count: 0, liked: false };
    return (
      <React.Fragment key={comment.id}>
        <div className={styles.commentItem} style={isReply ? { marginLeft: 36, borderLeft: '2px solid rgba(99,102,241,.35)', paddingLeft: 10 } : undefined}>
          {comment.userAvatar ? <img src={comment.userAvatar} alt="" className={styles.commentAvatar} /> : <div className={styles.commentAvatarFallback}>{comment.userName.charAt(0)}</div>}
          <div className={styles.commentBody}>
            <div className={styles.commentAuthor}>{comment.userName}</div>
            <div className={styles.commentText}>{comment.text}</div>
            <div className={styles.commentActions}>
              <button
                type="button"
                className={styles.commentLikeButton + (stats.liked ? ' ' + styles.commentLiked : '')}
                disabled={likeBusy === comment.id}
                onClick={async () => {
                  if (!currentUserId || currentUserId === 'anonim_user_id' || currentUserId === 'guest') { alert('Bəyənmək üçün qeydiyyatdan keçin.'); return; }
                  if (likeBusy) return;
                  setLikeBusy(comment.id);
                  try { await togglePostCommentLike(comment, currentUserId); }
                  catch (err) {
                    console.error('Şərh bəyənmə xətası:', err);
                    setError(err instanceof Error ? err.message : 'Şərhi bəyənmək alınmadı. Hesab icazəsini yoxlayın.');
                  } finally { setLikeBusy(null); }
                }}
              >
                <span aria-hidden="true">{stats.liked ? '♥' : '♡'}</span>
                {stats.liked ? 'Bəyənildi' : 'Bəyən'}
                {stats.count > 0 && <span className={styles.commentLikeCount}>{stats.count}</span>}
              </button>
              {!isReply && (
                <button type="button" className={styles.commentReplyButton} onClick={() => { setReplyTo(comment); setText(''); setError(''); }}>
                  ↩ Cavab yaz
                </button>
              )}
            </div>
          </div>
        </div>
        {!isReply && (repliesByParent[comment.id] || []).map((reply) => renderComment(reply, true))}
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
          {replyTo && (
            <div className={styles.replyingToBar}>
              <span className={styles.replyingToName}>{replyTo.userName}</span>
              <button type="button" onClick={() => setReplyTo(null)}>Ləğv et ✕</button>
            </div>
          )}
          <input type="text" value={text} onChange={(e) => setText(e.target.value)} placeholder={replyTo ? 'Cavabını yaz...' : 'Şərh yaz...'} className={styles.commentInput} maxLength={500} disabled={loading} />
          <button type="submit" className={styles.commentSubmit} disabled={loading || !text.trim()}>{loading ? 'Göndərilir…' : replyTo ? 'Cavabla' : 'Göndər'}</button>
        </form>
      </div>
    </div>
  );
}
