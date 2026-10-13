"use client";

import React, { useEffect, useMemo, useState } from 'react';
import { useUser } from '@/context/UserContext';
import { getLocalProfileDisplayName } from '@/app/lib/userId';
import { useAllianceBrain } from './AllianceBrainContext';
import AllianceMapEmbeddedChat from './AllianceMapEmbeddedChat';
import { useAllianceScreenBusy } from './AllianceScreenBusy';
import { MessageData } from './types';
import styles from './alliance.module.css';

function latestMessage(globalMessages: MessageData[], allianceMessages: MessageData[]) {
  return [...globalMessages, ...allianceMessages].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))[0];
}

export default function AllianceChatDock() {
  const { user } = useUser();
  const userName = user?.displayName || user?.email || getLocalProfileDisplayName();
  const busy = useAllianceScreenBusy();
  const [open, setOpen] = useState(false);
  const { activeAlliance, globalMessages, allianceMessages, handleSendMessage } = useAllianceBrain();

  useEffect(() => {
    if (busy) setOpen(false);
  }, [busy]);

  const preview = useMemo(
    () => latestMessage(globalMessages, allianceMessages),
    [globalMessages, allianceMessages]
  );

  return (
    <div
      className={`${styles.allianceChatStay} ${open ? '' : styles.allianceChatStayCollapsed} ${
        busy ? styles.allianceChatStayHidden : ''
      }`}
      aria-hidden={busy}
    >
      {open ? (
        <AllianceMapEmbeddedChat
          globalMessages={globalMessages}
          allianceMessages={allianceMessages}
          activeAlliance={activeAlliance}
          currentUserName={userName}
          onSendMessage={(text, channel) => void handleSendMessage(text, channel)}
          onCollapse={() => setOpen(false)}
        />
      ) : (
        <button
          type="button"
          className={styles.allianceChatPeek}
          onClick={() => setOpen(true)}
          aria-expanded={false}
          aria-label="Söhbəti aç"
        >
          <span className={styles.allianceChatPeekTitle}>💬 Söhbət</span>
          <span className={styles.allianceChatPeekLine}>
            {preview
              ? `${preview.user === userName ? 'Sən' : preview.user}: ${preview.text}`
              : 'Yazmaq üçün toxun'}
          </span>
        </button>
      )}
    </div>
  );
}
