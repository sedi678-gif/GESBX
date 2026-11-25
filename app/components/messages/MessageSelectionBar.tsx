'use client';

import React from 'react';
import styles from '@/app/components/social/social.module.css';

interface MessageSelectionBarProps {
  count: number;
  onCancel: () => void;
  onReply: () => void;
  onPin: () => void;
  onDelete: () => void;
  onForward: () => void;
  onMore: () => void;
}

export default function MessageSelectionBar({
  count, onCancel, onReply, onPin, onDelete, onForward, onMore,
}: MessageSelectionBarProps) {
  const single = count === 1;
  return (
    <header className={styles.selectionBar} aria-label="Seçilmiş mesaj əməliyyatları">
      <button type="button" className={styles.selectionBarBtn} onClick={onCancel} aria-label="Seçimi ləğv et">‹</button>
      <span className={styles.selectionBarCount}>{count}</span>
      <div className={styles.selectionBarActions}>
        <button type="button" className={styles.selectionBarBtn} onClick={onReply} disabled={!single} aria-label="Cavabla" title="Cavabla">↩</button>
        <button type="button" className={styles.selectionBarBtn} onClick={onPin} disabled={!single} aria-label="Ulduzla / sabitlə" title="Ulduzla / sabitlə">☆</button>
        <button type="button" className={styles.selectionBarBtn} onClick={onDelete} disabled={!count} aria-label="Sil" title="Sil">▤</button>
        <button type="button" className={styles.selectionBarBtn} onClick={onForward} disabled={!single} aria-label="Ötür" title="Ötür">➦</button>
        <button type="button" className={styles.selectionBarBtn} onClick={onMore} aria-label="Daha çox" title="Daha çox">⋮</button>
      </div>
    </header>
  );
}
