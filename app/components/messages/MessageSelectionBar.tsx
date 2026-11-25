'use client';

import React from 'react';
import styles from '@/app/components/social/social.module.css';

interface MessageSelectionBarProps {
  count: number;
  android?: boolean;
  onCancel: () => void;
  onReply: () => void;
  onPin: () => void;
  onDelete: () => void;
  onForward: () => void;
  onMore: () => void;
}

export default function MessageSelectionBar({
  count, android = false, onCancel, onReply, onPin, onDelete, onForward, onMore,
}: MessageSelectionBarProps) {
  const single = count === 1;
  if (!android) {
    return (
      <header className={styles.selectionBar}>
        <button type="button" className={styles.selectionBarBtn} onClick={onCancel} aria-label="Ləğv et">✕</button>
        <span className={styles.selectionBarCount}>{count} mesaj</span>
        <div className={styles.selectionBarActions}>
          <button type="button" className={styles.selectionBarBtn} onClick={onMore} disabled={!count}>📋 Kopyala</button>
          <button type="button" className={`${styles.selectionBarBtn} ${styles.selectionBarDanger}`} onClick={onDelete} disabled={!count}>🗑️ Sil</button>
        </div>
      </header>
    );
  }
  return (
    <header className={styles.selectionBar} aria-label="Seçilmiş mesaj əməliyyatları">
      <button type="button" className={styles.selectionBarBtn} onClick={onCancel} aria-label="Seçimi ləğv et">‹</button>
      <span className={styles.selectionBarCount}>{count}</span>
      <div className={styles.selectionBarActions}>
        <button type="button" className={styles.selectionBarBtn} onClick={onReply} disabled={!single} aria-label="Cavabla" title="Cavabla">↩</button>
        <button type="button" className={styles.selectionBarBtn} onClick={onPin} disabled={!single} aria-label="Sabitlə" title="Sabitlə">📌</button>
        <button type="button" className={styles.selectionBarBtn} onClick={onDelete} disabled={!count} aria-label="Sil" title="Sil">▤</button>
        <button type="button" className={styles.selectionBarBtn} onClick={onForward} disabled={!single} aria-label="Ötür" title="Ötür">➦</button>
        <button type="button" className={styles.selectionBarBtn} onClick={onMore} aria-label="Seçilmiş mesajları kopyala" title="Kopyala">📋</button>
      </div>
    </header>
  );
}
