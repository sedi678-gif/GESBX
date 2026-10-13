'use client';

import React, { useRef } from 'react';
import { useLongPress } from '@/app/hooks/useLongPress';
import type { StoredMessage } from '@/app/lib/messageService';
import styles from '@/app/components/social/social.module.css';

interface ChatMessageRowProps {
  message: StoredMessage;
  myId: string;
  selected: boolean;
  selectionMode: boolean;
  children: React.ReactNode;
  onBubbleLongPress: (message: StoredMessage, anchor: DOMRect) => void;
  onGutterLongPress: (message: StoredMessage) => void;
  onToggleSelect: (message: StoredMessage) => void;
  onOpenMedia?: (message: StoredMessage) => void;
}

export default function ChatMessageRow({
  message,
  myId,
  selected,
  selectionMode,
  children,
  onBubbleLongPress,
  onGutterLongPress,
  onToggleSelect,
}: ChatMessageRowProps) {
  const bubbleRef = useRef<HTMLDivElement>(null);
  const mine = message.senderId === myId;

  const gutterPress = useLongPress(() => onGutterLongPress(message));

  const bubblePress = useLongPress(
    () => {
      const el = bubbleRef.current;
      if (!el) return;
      onBubbleLongPress(message, el.getBoundingClientRect());
    },
    {
      onClick: () => {
        if (selectionMode) onToggleSelect(message);
      },
    }
  );

  return (
    <div
      className={`${styles.messageRow} ${mine ? styles.messageRowMine : styles.messageRowTheirs} ${
        selected ? styles.messageRowSelected : ''
      }`}
    >
      <div
        className={styles.messageSelectGutter}
        {...gutterPress}
        aria-label="Mesaj seç"
      >
        {(selectionMode || selected) && (
          <span className={`${styles.messageSelectCircle} ${selected ? styles.messageSelectCircleOn : ''}`}>
            {selected ? '✓' : ''}
          </span>
        )}
      </div>
      <div ref={bubbleRef} className={styles.messageBubbleCol} {...bubblePress}>
        {children}
      </div>
    </div>
  );
}
