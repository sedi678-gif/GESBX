"use client";

import React, { useEffect, useRef, useState } from 'react';
import { AllianceData, ChatChannel, MessageData } from './types';
import { AllianceHubMessage } from '@/app/components/chat/ChatUiParts';
import { IconSend } from '@/app/components/messages/MessageHubIcons';
import styles from './alliance.module.css';

interface AllianceChatProps {
  globalMessages: MessageData[];
  allianceMessages: MessageData[];
  activeAlliance: AllianceData | null;
  currentUserName: string;
  onSendMessage: (text: string, channel: ChatChannel) => void;
  /** Naviqasiya barından açılanda */
  startOpen?: boolean;
  hideTrigger?: boolean;
  onClose?: () => void;
}

export default function AllianceChat({
  globalMessages,
  allianceMessages,
  activeAlliance,
  currentUserName,
  onSendMessage,
  startOpen = false,
  hideTrigger = false,
  onClose,
}: AllianceChatProps) {
  const [open, setOpen] = useState(startOpen);
  const [channel, setChannel] = useState<ChatChannel>('global');
  const [chatMessage, setChatMessage] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  const messages = channel === 'global' ? globalMessages : allianceMessages;
  const recentPreview = [...globalMessages.slice(-1), ...(activeAlliance ? allianceMessages.slice(-1) : [])];

  useEffect(() => {
    if (startOpen) setOpen(true);
  }, [startOpen]);

  const closeChat = () => {
    setOpen(false);
    onClose?.();
  };

  useEffect(() => {
    if (open && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [open, messages, channel]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatMessage.trim()) return;
    if (channel === 'alliance' && !activeAlliance) return;
    onSendMessage(chatMessage, channel);
    setChatMessage('');
  };

  const placeholder =
    channel === 'global'
      ? 'Qlobal mesaj yazın...'
      : activeAlliance
        ? `${activeAlliance.name} ittifaqına mesaj yazın...`
        : 'İttifaq çatı üçün ittifaqda olmalısan';

  return (
    <>
      {!hideTrigger && (
      <button
        type="button"
        className={styles.chatCompactBtn}
        onClick={() => setOpen(true)}
        aria-label="Canlı söhbət — aç"
      >
        <span className={styles.chatCompactLabel}>
          <span className={styles.chatLiveDot} aria-hidden="true" />
          CANLI SÖHBƏT
        </span>
        <div className={styles.chatCompactPreview}>
          {recentPreview.length === 0 ? (
            <span className={styles.chatPreviewLine}>Qlobal və ittifaq söhbətinə qoşul...</span>
          ) : (
            recentPreview.map((msg) => (
              <span key={msg.id} className={styles.chatPreviewLine}>
                <strong>{msg.user === currentUserName ? 'Sən' : msg.user}:</strong> {msg.text}
              </span>
            ))
          )}
        </div>
      </button>
      )}

      {open && (
        <div className={styles.chatModalOverlay} onClick={closeChat} role="presentation">
          <div
            className={`${styles.chatModal} ${styles.glass}`}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-label="Söhbət çatı"
          >
            <div className={styles.chatModalHeader}>
              <span>💬 CANLI SÖHBƏT</span>
              <button
                type="button"
                className={styles.searchModalClose}
                onClick={closeChat}
                aria-label="Bağla"
              >
                ✕
              </button>
            </div>

            <div className={styles.chatChannelTabs}>
              <button
                type="button"
                className={`${styles.chatChannelTab} ${channel === 'global' ? styles.chatChannelTabActive : ''}`}
                onClick={() => setChannel('global')}
              >
                🌍 Qlobal
              </button>
              <button
                type="button"
                className={`${styles.chatChannelTab} ${channel === 'alliance' ? styles.chatChannelTabActive : ''}`}
                onClick={() => setChannel('alliance')}
                disabled={!activeAlliance}
                title={!activeAlliance ? 'İttifaq çatı üçün ittifaqda olmalısan' : undefined}
              >
                🛡️ {activeAlliance ? activeAlliance.name : 'İttifaq'}
              </button>
            </div>

            {channel === 'alliance' && !activeAlliance && (
              <p className={styles.chatChannelHint}>
                İttifaq daxili çat yalnız ittifaq üzvləri üçündür. Əvvəlcə ittifaqə qoşul.
              </p>
            )}

            <div ref={scrollRef} className={styles.chatModalMessages}>
              {messages.map((msg) => (
                <AllianceHubMessage key={msg.id} msg={msg} currentUserName={currentUserName} />
              ))}
            </div>

            <form onSubmit={handleSubmit} className={styles.chatModalForm}>
              <input
                type="text"
                placeholder={placeholder}
                value={chatMessage}
                onChange={(e) => setChatMessage(e.target.value)}
                disabled={channel === 'alliance' && !activeAlliance}
              />
              <button
                type="submit"
                className={styles.chatModalSendBtn}
                disabled={channel === 'alliance' && !activeAlliance}
                aria-label="Göndər"
              >
                <IconSend />
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
