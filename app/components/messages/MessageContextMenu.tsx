'use client';

import React from 'react';
import styles from '@/app/components/social/social.module.css';
import type { StoredMessage } from '@/app/lib/messageService';

export interface MessageContextMenuProps {
  message: StoredMessage;
  anchor: DOMRect;
  myId: string;
  onEdit?: () => void;
  onReply?: () => void;
  onForward?: () => void;
  onReact?: (emoji: string) => void;
  onDelete: () => void;
  onCopy: () => void;
  onClose: () => void;
}

const QUICK_REACTIONS = ['❤️', '👍', '😂', '😮', '😢', '🔥'];

export default function MessageContextMenu({
  message,
  anchor,
  myId,
  onEdit,
  onReply,
  onForward,
  onReact,
  onDelete,
  onCopy,
  onClose,
}: MessageContextMenuProps) {
  const mine = message.senderId === myId;
  const canEdit = mine && message.type === 'text';
  const canCopy = Boolean(message.text?.trim());
  const top = Math.min(anchor.top - 8, window.innerHeight - 300);
  const left = Math.min(Math.max(12, anchor.left), window.innerWidth - 220);

  return (
    <>
      <div className={styles.contextMenuBackdrop} onClick={onClose} aria-hidden />
      <div
        className={styles.contextMenuPopup}
        style={{ top: `${Math.max(12, top)}px`, left: `${left}px` }}
        role="menu"
      >
        <div className={styles.messageQuickReactions} aria-label="Reaksiya seç">
          {QUICK_REACTIONS.map((emoji) => (
            <button key={emoji} type="button" aria-label={`Reaksiya ${emoji}`} onClick={() => onReact?.(emoji)}>
              {emoji}
            </button>
          ))}
        </div>
        {onReply && <button type="button" className={styles.contextMenuItem} onClick={onReply}>↩️ Cavabla</button>}
        {onForward && <button type="button" className={styles.contextMenuItem} onClick={onForward}>↗️ Ötür</button>}
        {canCopy && <button type="button" className={styles.contextMenuItem} onClick={onCopy}>📋 Kopyala</button>}
        {canEdit && onEdit && <button type="button" className={styles.contextMenuItem} onClick={onEdit}>✏️ Redaktə et</button>}
        <button type="button" className={`${styles.contextMenuItem} ${styles.contextMenuDanger}`} onClick={onDelete}>🗑️ Sil</button>
      </div>
    </>
  );
}
