"use client";



import React, { useEffect, useRef, useState } from 'react';

import { AllianceData, ChatChannel, MessageData } from './types';

import { AllianceHubMessage } from '@/app/components/chat/ChatUiParts';

import { IconSend } from '@/app/components/messages/MessageHubIcons';

import styles from './alliance.module.css';



interface AllianceMapEmbeddedChatProps {

  globalMessages: MessageData[];

  allianceMessages: MessageData[];

  activeAlliance: AllianceData | null;

  currentUserName: string;

  onSendMessage: (text: string, channel: ChatChannel) => void;

  sheetMode?: boolean;
  neon?: boolean;
  onCollapse?: () => void;

}



export default function AllianceMapEmbeddedChat({

  globalMessages,

  allianceMessages,

  activeAlliance,

  currentUserName,

  onSendMessage,

  sheetMode = false,
  neon = false,
  onCollapse,

}: AllianceMapEmbeddedChatProps) {

  const [channel, setChannel] = useState<ChatChannel>('global');

  const [chatMessage, setChatMessage] = useState('');

  const scrollRef = useRef<HTMLDivElement>(null);



  const messages = channel === 'global' ? globalMessages : allianceMessages;



  useEffect(() => {

    if (scrollRef.current) {

      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;

    }

  }, [messages, channel]);



  const handleSubmit = (e: React.FormEvent) => {

    e.preventDefault();

    if (!chatMessage.trim()) return;

    if (channel === 'alliance' && !activeAlliance) return;

    onSendMessage(chatMessage, channel);

    setChatMessage('');

  };



  const placeholder =

    channel === 'global'

      ? 'Qlobal mesaj...'

      : activeAlliance

        ? `${activeAlliance.name} çatı...`

        : 'İttifaq çatı üçün ittifaqda ol';



  return (

    <div className={`${styles.mapChatPanel} ${sheetMode ? styles.mapChatPanelSheet : ''} ${neon ? styles.mapChatPanelNeon : ''}`}>

      {!sheetMode && (

        <div className={styles.epChatHeader}>

          <span>💬 CANLI SÖHBƏT</span>
          {onCollapse ? (
            <button type="button" className={styles.epChatClose} onClick={onCollapse} aria-label="Söhbəti yığ">
              ✕
            </button>
          ) : null}

        </div>

      )}



      <div className={styles.epChatTabs}>

        <button

          type="button"

          className={channel === 'global' ? styles.epChatTabActive : styles.epChatTab}

          onClick={() => setChannel('global')}

        >

          🌍 Qlobal

        </button>

        <button

          type="button"

          className={channel === 'alliance' ? styles.epChatTabActive : styles.epChatTab}

          onClick={() => setChannel('alliance')}

          disabled={!activeAlliance}

          title={!activeAlliance ? 'İttifaq çatı üçün ittifaqda olmalısan' : undefined}

        >

          🛡️ {activeAlliance ? 'İttifaq' : 'İttifaq'}

        </button>

      </div>



      <div ref={scrollRef} className={styles.epChatMessages}>

        {messages.length === 0 ? (

          <p className={styles.epChatEmpty}>Hələ mesaj yoxdur — ilk sən yaz!</p>

        ) : (

          messages.map((msg) => (

            <AllianceHubMessage key={msg.id} msg={msg} currentUserName={currentUserName} />

          ))

        )}

      </div>



      <form onSubmit={handleSubmit} className={styles.epChatForm}>

        <input

          type="text"

          placeholder={placeholder}

          value={chatMessage}

          onChange={(e) => setChatMessage(e.target.value)}

          disabled={channel === 'alliance' && !activeAlliance}

        />

        <button

          type="submit"

          className={styles.epChatSendBtn}

          disabled={channel === 'alliance' && !activeAlliance}

          aria-label="Göndər"

        >

          <IconSend />

        </button>

      </form>

    </div>

  );

}

