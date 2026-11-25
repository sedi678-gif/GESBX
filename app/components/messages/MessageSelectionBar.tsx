'use client';

import React from 'react';
import styles from '@/app/components/social/social.module.css';

interface MessageSelectionBarProps {
  count: number;
  onCancel: () => void;
  onCopy: () => void;
  onDelete: () => void;
}

export default function MessageSelectionBar({ count, onCancel, onCopy, onDelete }: MessageSelectionBarProps) {
  return (
    <header className={styles.selectionBar}>
      <button type="button" className={styles.selectionBarBtn} onClick={onCancel} aria-label="Ləğv et">✕</button>
      <span className={styles.selectionBarCount}>{count} mesaj</span>
      <div className={styles.selectionBarActions}>
        <button type="button" className={styles.selectionBarBtn} onClick={onCopy} disabled={!count} title="Seçilmiş mesajları bir dəfə kopyala">📋 Kopyala</button>
        <button type="button" className={`${styles.selectionBarBtn} ${styles.selectionBarDanger}`} onClick={onDelete} disabled={!count} title="Seçilmiş mesajları sil">🗑️ Sil</button>
      </div>
    </header>
  );
}
