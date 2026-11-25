'use client';

import React from 'react';
import styles from '@/app/components/social/social.module.css';

interface MessageSelectionBarProps {
  count: number;
  onCancel: () => void;
  onDelete: () => void;
}

export default function MessageSelectionBar({ count, onCancel, onDelete }: MessageSelectionBarProps) {
  return (
    <header className={styles.selectionBar}>
      <button type="button" className={styles.selectionBarBtn} onClick={onCancel} aria-label="Ləğv et">✕</button>
      <span className={styles.selectionBarCount}>{count} mesaj</span>
      <div className={styles.selectionBarActions}>
        <button type="button" className={`${styles.selectionBarBtn} ${styles.selectionBarDanger}`} onClick={onDelete} title="Seçilmiş mesajları sil">🗑️</button>
      </div>
    </header>
  );
}
