'use client';

import React from 'react';
import styles from '@/app/components/social/social.module.css';

interface MessageSelectionBarProps {
  count: number;
  onCancel: () => void;
  onDelete: () => void;
  onCopy: () => void;
  onForward: () => void;
  onShare: () => void;
}

export default function MessageSelectionBar({
  count,
  onCancel,
  onDelete,
  onCopy,
  onForward,
  onShare,
}: MessageSelectionBarProps) {
  return (
    <header className={styles.selectionBar}>
      <button type="button" className={styles.selectionBarBtn} onClick={onCancel} aria-label="Ləğv et">
        ✕
      </button>
      <span className={styles.selectionBarCount}>{count}</span>
      <div className={styles.selectionBarActions}>
        <button type="button" className={styles.selectionBarBtn} onClick={onCopy} title="Kopyala">
          📋
        </button>
        <button type="button" className={styles.selectionBarBtn} onClick={onForward} title="Ötür">
          ↪️
        </button>
        <button type="button" className={styles.selectionBarBtn} onClick={onShare} title="Paylaş">
          📤
        </button>
        <button type="button" className={`${styles.selectionBarBtn} ${styles.selectionBarDanger}`} onClick={onDelete} title="Sil">
          🗑️
        </button>
      </div>
    </header>
  );
}
