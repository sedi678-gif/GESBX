'use client';

import React from 'react';
import styles from '@/app/components/social/social.module.css';
import type { StoredMessage } from '@/app/lib/messageService';

export interface MessageContextMenuProps {
  message: StoredMessage;
  anchor: DOMRect;
  myId: string;
  onEdit?: () => void;
  onDelete: () => void;
  onCopy: () => void;
  onClose: () => void;
}

export default function MessageContextMenu({
  message,
  anchor,
  myId,
  onEdit,
  onDelete,
  onCopy,
  onClose,
}: MessageContextMenuProps) {
  const mine = message.senderId === myId;
  const canEdit = mine && message.type === 'text';
  const canCopy = Boolean(message.text?.trim());

  const top = Math.min(anchor.top - 8, window.innerHeight - 180);
  const left = Math.min(Math.max(12, anchor.left), window.innerWidth - 200);

  return (
    <>
      <div className={styles.contextMenuBackdrop} onClick={onClose} aria-hidden />
      <div
        className={styles.contextMenuPopup}
        style={{ top: `${Math.max(12, top)}px`, left: `${left}px` }}
        role="menu"
      >
        {canCopy && (
          <button type="button" className={styles.contextMenuItem} onClick={onCopy}>
            📋 Kopyala
          </button>
        )}
        {canEdit && onEdit && (
          <button type="button" className={styles.contextMenuItem} onClick={onEdit}>
            ✏️ Düzənlə
          </button>
        )}
        <button type="button" className={`${styles.contextMenuItem} ${styles.contextMenuDanger}`} onClick={onDelete}>
          🗑️ Sil
        </button>
      </div>
    </>
  );
}
