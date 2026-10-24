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
    return (
      <div className={styles.hubSystemRow}>
        <div className={styles.hubSystemPill}>
          <span className={styles.hubSystemText}>{msg.text}</span>
          {msg.time ? <span className={styles.hubSystemTime}>{msg.time}</span> : null}
        </div>
      </div>
    );
  }

  const mine = msg.user === currentUserName;

  return (
    <div className={styles.hubRow}>
      <div className={styles.hubAvatar} aria-hidden="true">
        {msg.user.charAt(0).toUpperCase()}
      </div>
      <div className={styles.hubBody}>
        <div className={styles.hubHead}>
          <span className={`${styles.hubAuthor} ${mine ? styles.hubAuthorMine : ''}`}>{msg.user}</span>
          <span className={styles.hubTime}>{msg.time}</span>
        </div>
        <span className={styles.hubText}>{msg.text}</span>
      </div>
    </div>
  );
}
