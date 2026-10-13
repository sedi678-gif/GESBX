"use client";

import React from 'react';
import { MessageData } from '@/app/components/alliance/types';
import styles from './chatUi.module.css';

export function isSystemChatMessage(msg: MessageData): boolean {
  return msg.kind === 'system' || msg.user === 'Sistem' || msg.id.startsWith('welcome-');
}

export function ChatSystemPill({ children, time }: { children: React.ReactNode; time?: string }) {
  return (
    <div className={styles.systemPillWrap}>
      <div className={styles.systemPill}>
        <span className={styles.systemPillText}>{children}</span>
        {time ? <span className={styles.systemPillTime}>{time}</span> : null}
      </div>
    </div>
  );
}

export function AllianceHubMessage({
  msg,
  currentUserName,
}: {
  msg: MessageData;
  currentUserName: string;
}) {
  if (isSystemChatMessage(msg)) {
    return <ChatSystemPill time={msg.time}>{msg.text}</ChatSystemPill>;
  }

  const mine = msg.user === currentUserName;

  return (
    <div className={`${styles.hubBubbleWrap} ${mine ? styles.hubBubbleWrapMine : ''}`}>
      {!mine && (
        <div className={styles.hubBubbleAvatar} aria-hidden="true">
          {msg.user.charAt(0).toUpperCase()}
        </div>
      )}
      <div className={mine ? styles.hubBubbleMine : styles.hubBubbleTheirs}>
        {!mine && <span className={styles.hubBubbleAuthor}>{msg.user}</span>}
        <span className={styles.hubBubbleText}>{msg.text}</span>
        <div className={styles.hubBubbleTime}>{msg.time}</div>
      </div>
    </div>
  );
}
