"use client";

import React, { useEffect, useState } from 'react';
import { addPostComment, listenPostComments } from '@/app/lib/postsService';
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

export default function PostCommentsSheet({
  open,
  postId,
  postTitle,
  onClose,
  currentUserId,
  currentUserName,
  currentUserAvatar,
}: PostCommentsSheetProps) {
  const [comments, setComments] = useState<PostComment[]>([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open || !postId) {
      setComments([]);
      setText('');
      setError('');
      return;
    }

    return listenPostComments(postId, setComments, setError);
  }, [open, postId]);

  if (!open || !postId) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    if (!currentUserId || currentUserId === 'anonim_user_id') {
      alert('Şərh yazmaq üçün profil qeydiyyatı tələb olunur.');
      return;
    }

    setLoading(true);
    setError('');
    try {
      await addPostComment(postId, {
        id: currentUserId,
        name: currentUserName,
        avatar: currentUserAvatar,
      }, trimmed);
      setText('');
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Şərh göndərilmədi.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div
        className={`${styles.modalSheet} ${styles.commentsSheet}`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Şərhlər"
      >
        <div className={styles.commentsSheetHead}>
          <h2 className={styles.modalTitle}>💬 Şərhlər</h2>
          {postTitle ? <p className={styles.commentsSheetSub}>{postTitle}</p> : null}
          <button type="button" className={styles.commentsCloseBtn} onClick={onClose} aria-label="Bağla">
            ✕
          </button>
        </div>

        <div className={styles.commentsList}>
          {error && <div className={styles.commentsError}>{error}</div>}
          {comments.length === 0 ? (
            <div className={styles.commentsEmpty}>İlk şərhi sən yaz!</div>
          ) : (
            comments.map((c) => (
              <div key={c.id} className={styles.commentItem}>
                {c.userAvatar ? (
                  <img src={c.userAvatar} alt="" className={styles.commentAvatar} />
                ) : (
                  <div className={styles.commentAvatarFallback}>{c.userName.charAt(0)}</div>
                )}
                <div className={styles.commentBody}>
                  <div className={styles.commentAuthor}>{c.userName}</div>
                  <div className={styles.commentText}>{c.text}</div>
                </div>
              </div>
            ))
          )}
        </div>

        <form className={styles.commentForm} onSubmit={handleSubmit}>
          <input
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Şərh yaz..."
            className={styles.commentInput}
            maxLength={500}
            disabled={loading}
          />
          <button type="submit" className={styles.commentSubmit} disabled={loading || !text.trim()}>
            {loading ? '...' : 'Göndər'}
          </button>
        </form>
      </div>
    </div>
  );
}
