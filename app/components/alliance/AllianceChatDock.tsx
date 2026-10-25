"use client";

import React, { useEffect, useState } from 'react';
import { useUser } from '@/context/UserContext';
import { getLocalProfileDisplayName } from '@/app/lib/userId';
import { useAllianceBrain } from './AllianceBrainContext';
import AllianceMapEmbeddedChat from './AllianceMapEmbeddedChat';
import { useAllianceScreenBusy } from './AllianceScreenBusy';
import styles from './alliance.module.css';

export default function AllianceChatDock() {
  const { user } = useUser();
  const userName = user?.displayName || user?.email || getLocalProfileDisplayName();
  const busy = useAllianceScreenBusy();
  const [open, setOpen] = useState(false);
  const { activeAlliance, globalMessages, allianceMessages, handleSendMessage } = useAllianceBrain();

  useEffect(() => {
    if (busy) setOpen(false);
  }, [busy]);

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
          <span className={styles.allianceChatPeekIcon} aria-hidden="true">•••</span>
          <span className={styles.allianceChatPeekTitle}>Söhbət</span>
        </button>
      )}
    </div>
  );
}
