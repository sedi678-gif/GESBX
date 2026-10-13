"use client";

import React, { useEffect } from 'react';
import styles from './alliance.module.css';
import { useAllianceScreenHold } from './AllianceScreenBusy';

interface AllianceMapSheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  icon?: React.ReactNode;
  variant?: 'default' | 'neon';
  wide?: boolean;
  children: React.ReactNode;
}

export default function AllianceMapSheet({
  open,
  onClose,
  title,
  icon,
  variant = 'default',
  wide = false,
  children,
}: AllianceMapSheetProps) {
  useAllianceScreenHold(open);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className={styles.mapSheetOverlay} onClick={onClose} role="presentation">
      <div
        className={`${styles.mapSheetPage} ${wide ? styles.mapSheetWide : ''} ${variant === 'neon' ? styles.mapSheetNeon : styles.glass}`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className={styles.mapSheetHeader}>
          <span className={styles.mapSheetTitle}>
            {icon ? <span className={styles.mapSheetTitleIcon}>{icon}</span> : null}
            {title}
          </span>
          <button type="button" className={styles.searchModalClose} onClick={onClose} aria-label="Bağla">
            ✕
          </button>
        </div>
        <div className={styles.mapSheetBody}>{children}</div>
      </div>
    </div>
  );
}
