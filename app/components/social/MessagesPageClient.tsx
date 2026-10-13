"use client";

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import AppBottomNav from '@/app/components/AppBottomNav';
import AttachSheet from '@/app/components/messages/AttachSheet';
import ChatMessageRow from '@/app/components/messages/ChatMessageRow';
import MessageContextMenu from '@/app/components/messages/MessageContextMenu';
import MessageSelectionBar from '@/app/components/messages/MessageSelectionBar';
import VoiceMessagePlayer from '@/app/components/messages/VoiceMessagePlayer';
import { ChatSystemPill } from '@/app/components/chat/ChatUiParts';
import {
  IconAttach,
  IconBack,
  IconCompose,
  IconMic,
  IconMore,
  IconPhone,
  IconSend,
  IconSettings,
  IconVideo,
} from '@/app/components/messages/MessageHubIcons';
import { useCall } from '@/context/CallContext';
import { unlockCallAudio } from '@/app/lib/audioUnlock';
import { setCallLocalStream } from '@/app/lib/callMediaBridge';
import { setCallUiState } from '@/app/lib/callUiBridge';
import { zegoHangUp } from '@/app/lib/zegoCallKit';
import {
  primeCallMedia,
  releaseMediaStream,
  ensureMediaPermission,
  validateMediaFile,
  getSupportedAudioMimeType,
  getCurrentLocation,
} from '@/app/lib/mediaPermissions';
import CallSettingsSheet from '@/app/components/messages/CallSettingsSheet';
import {
  listenMessageContacts,
  acceptMessageRequest,
  declineMessageRequest,
  registerMessageContact,
  MessageContact,
} from '@/app/lib/messageRequestService';
import { listenCallHistory, CallHistoryItem } from '@/app/lib/callHistoryService';
import { TEEN_SAFETY_RULES, getCallSettings } from '@/app/lib/callSettings';
import {
  blockUser,
  reportContent,
  searchUsers,
  listenBlockedUsers,
  isBlocked,
  getUserProfile,
} from '@/app/lib/socialService';
import {
  buildChatId,
  listenUserChats,
  listenChatMessages,
  sendPrivateMessage,
  sendAudioMessageFast,
  sendMediaMessageFast,
  sendFileMessageFast,
  sendLocationMessage,
  deleteMessage,
  clearChat,
  editMessage,
  messagePreview,
  isTransferableMessageUrl,
  type FastSendResult,
  ChatSummary,
  StoredMessage,
} from '@/app/lib/messageService';
import {
  onChatError,
  emitChatDelete,
  emitChatClear,
  emitChatEdit,
  onChatDelete,
  onChatClear,
  onChatEdit,
} from '@/app/lib/messageSocketService';
import { CallType } from '@/app/lib/callService';
import { AppUserProfile } from '@/app/lib/socialTypes';
import { useUser } from '@/context/UserContext';
import { useAppBrain } from '@/app/components/alliance/AllianceBrainContext';
import { getAppUserId } from '@/app/lib/userId';
import { useAppStrings } from '@/app/lib/useAppStrings';
import AppLink from '@/app/components/AppLink';
import styles from './social.module.css';

const DEFAULT_AVATAR =
  'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=100&q=80';

type InboxTab = 'chats' | 'groups' | 'calls';

interface ChatItem {
  chatId: string;
  id: string;
  name: string;
  username: string;
  avatar: string;
  isOnline: boolean;
  lastMsg: string;
  time: string;
}

function formatTime(ts: number): string {
  if (!ts) return '';
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatDuration(ms: number): string {
  const sec = Math.max(1, Math.round(ms / 1000));
  return `${sec}s`;
}

function chatSummaryToItem(chat: ChatSummary): ChatItem {
  return {
    chatId: chat.chatId,
    id: chat.otherUserId,
    name: chat.otherUserName,
    username: chat.otherUserHandle,
    avatar: chat.otherUserAvatar || DEFAULT_AVATAR,
    isOnline: false,
    lastMsg: chat.lastMessage || 'Söhbət',
    time: formatTime(chat.lastMessageAt),
  };
}

function getMyProfileMeta(): { name: string; handle: string; avatar: string } {
  if (typeof window === 'undefined') {
    return { name: '', handle: '', avatar: DEFAULT_AVATAR };
  }
  try {
    const raw = localStorage.getItem('app_current_user_v6');
    if (!raw) return { name: '', handle: '', avatar: DEFAULT_AVATAR };
    const u = JSON.parse(raw);
    return {
      name: [u.name, u.surname].filter(Boolean).join(' '),
      handle: u.handle || '',
      avatar: u.avatar || DEFAULT_AVATAR,
    };
  } catch {
    return { name: '', handle: '', avatar: DEFAULT_AVATAR };
  }
}

function staticMapUrl(lat: number, lng: number): string {
  return `https://staticmap.openstreetmap.de/staticmap.php?center=${lat},${lng}&zoom=15&size=280x140&markers=${lat},${lng},red`;
}

function openMessageAsset(m: StoredMessage): void {
  const url = m.mediaUrl || m.audioUrl;
  if (!url) return;

  if (m.type === 'file' || m.type === 'audio') {
    const link = document.createElement('a');
    link.href = url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    if (m.fileName) link.download = m.fileName;
    link.click();
    return;
  }

  if (url.startsWith('http') || url.startsWith('data:') || url.startsWith('blob:')) {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}

function MessageBubble({
  m,
  myId,
  onOpenMedia,
}: {
  m: StoredMessage;
  myId: string;
  onOpenMedia?: (m: StoredMessage) => void;
}) {
  const mine = m.senderId === myId;
  const cls = mine ? styles.bubbleMine : styles.bubbleTheirs;
  const timeLabel = formatTime(m.createdAt);
  const editedLabel = m.editedAt ? ' · redaktə olunub' : '';

  if (m.type === 'audio' && m.audioUrl) {
    return (
      <div className={cls}>
        <VoiceMessagePlayer src={m.audioUrl} durationMs={m.audioDurationMs} />
        <div className={styles.bubbleMeta}>🎤 Səs mesajı · {timeLabel}</div>
      </div>
    );
  }

  if ((m.type === 'image' || m.type === 'video') && m.mediaUrl) {
    return (
      <div className={cls}>
        <button
          type="button"
          className={styles.mediaOpenBtn}
          onClick={(e) => {
            e.stopPropagation();
            onOpenMedia?.(m);
          }}
        >
          {m.type === 'image' ? (
            <img src={m.mediaUrl} alt="Şəkil" className={styles.mediaMessageImage} />
          ) : (
            <video src={m.mediaUrl} controls playsInline className={styles.mediaMessageVideo} preload="metadata" />
          )}
        </button>
        <div className={styles.bubbleMeta}>
          {m.type === 'image' ? '📷 Şəkil' : '🎬 Video'} · {timeLabel}
        </div>
      </div>
    );
  }

  if (m.type === 'file' && m.mediaUrl) {
    const ext = (m.fileName || '').split('.').pop()?.toUpperCase() || 'FILE';
    return (
      <div className={cls}>
        <button
          type="button"
          className={styles.waDocCard}
          onClick={(e) => {
            e.stopPropagation();
            onOpenMedia?.(m);
          }}
        >
          <span className={styles.waDocIcon}>{ext.slice(0, 4)}</span>
          <span className={styles.waDocInfo}>
            <span className={styles.waDocName}>{m.fileName || 'Sənəd'}</span>
            <span className={styles.waDocMeta}>Aç / yüklə · {timeLabel}</span>
          </span>
        </button>
      </div>
    );
  }

  if (m.type === 'location' && m.locationLat != null && m.locationLng != null) {
    const mapsUrl = m.mediaUrl || `https://www.google.com/maps?q=${m.locationLat},${m.locationLng}`;
    return (
      <div className={cls}>
        <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className={styles.waLocationCard}>
          <img src={staticMapUrl(m.locationLat, m.locationLng)} alt="Xəritə" className={styles.waLocationMap} />
          <span className={styles.waLocationLabel}>📍 {m.text || 'Konum'}</span>
          <span className={styles.waLocationMeta}>Xəritədə aç · {timeLabel}</span>
        </a>
      </div>
    );
  }

  if (m.type === 'call') {
    return <ChatSystemPill time={timeLabel}>{m.text}</ChatSystemPill>;
  }

  return (
    <div className={cls}>
      <span className={styles.bubbleText}>{m.text}</span>
      <div className={styles.bubbleTime}>
        {timeLabel}
        {editedLabel}
      </div>
    </div>
  );
}

export default function MessagesPageClient() {
  const searchParams = useSearchParams();
  const { userId } = useUser();
  const { startCall } = useCall();
  const t = useAppStrings();
  const myId = getAppUserId(userId) || 'guest';
  const { relayPrivateMessage, subscribePrivateMessages, realtimeHub, ensureAppSocket } = useAppBrain();

  const [chats, setChats] = useState<ChatItem[]>([]);
  const [selectedChat, setSelectedChat] = useState<ChatItem | null>(null);
  const [messages, setMessages] = useState<StoredMessage[]>([]);
  const [messageText, setMessageText] = useState('');
  const [blockedIds, setBlockedIds] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordElapsed, setRecordElapsed] = useState(0);
  const [showAttach, setShowAttach] = useState(false);
  const [inboxTab, setInboxTab] = useState<InboxTab>('chats');
  const [showCallSettings, setShowCallSettings] = useState(false);
  const [showRequests, setShowRequests] = useState(false);
  const [messageContacts, setMessageContacts] = useState<MessageContact[]>([]);
  const [callHistory, setCallHistory] = useState<CallHistoryItem[]>([]);
  const [listSearch, setListSearch] = useState('');

  const [showSearch, setShowSearch] = useState(false);
  const [showActions, setShowActions] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<AppUserProfile[]>([]);
  const [reportReason, setReportReason] = useState('');
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [contextMenu, setContextMenu] = useState<{ message: StoredMessage; anchor: DOMRect } | null>(null);
  const [editingMessage, setEditingMessage] = useState<StoredMessage | null>(null);
  const [mediaViewer, setMediaViewer] = useState<{
    url: string;
    type: 'image' | 'video' | 'file';
    fileName?: string;
  } | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const deepLinkHandled = useRef(false);
  const selectedChatRef = useRef<ChatItem | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordStreamRef = useRef<MediaStream | null>(null);
  const recordChunksRef = useRef<Blob[]>([]);
  const recordStartRef = useRef(0);
  const micHoldRef = useRef(false);
  const recordPendingStopRef = useRef(false);
  const recordTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mediaInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    selectedChatRef.current = selectedChat;
    setSelectionMode(false);
    setSelectedIds([]);
    setContextMenu(null);
    setEditingMessage(null);
  }, [selectedChat?.chatId]);

  useEffect(() => {
    if (!myId || myId === 'guest') return;
    return listenBlockedUsers(myId, setBlockedIds);
  }, [myId]);

  useEffect(() => {
    if (!myId || myId === 'guest') return;
    return listenMessageContacts(myId, setMessageContacts);
  }, [myId]);

  useEffect(() => {
    if (!myId || myId === 'guest') return;
    return listenCallHistory(myId, setCallHistory);
  }, [myId]);

  useEffect(() => {
    if (!myId || myId === 'guest') return;
    return listenUserChats(myId, (summaries) => {
      setChats(summaries.map(chatSummaryToItem));
    });
  }, [myId]);

  useEffect(() => {
    if (!selectedChat?.chatId) {
      setMessages([]);
      return;
    }
    return listenChatMessages(selectedChat.chatId, setMessages);
  }, [selectedChat?.chatId]);

  const applyIncomingMessage = useCallback((message: StoredMessage) => {
    const preview = messagePreview(message);
    const time = formatTime(message.createdAt);

    setChats((prev) => {
      const idx = prev.findIndex((c) => c.chatId === message.chatId);
      if (idx === -1) {
        const otherId = message.senderId === myId ? message.recipientId : message.senderId;
        const chat: ChatItem = {
          chatId: message.chatId,
          id: otherId,
          name: 'İstifadəçi',
          username: '',
          avatar: DEFAULT_AVATAR,
          isOnline: false,
          lastMsg: preview,
          time,
        };
        return [chat, ...prev];
      }
      const next = [...prev];
      const item = { ...next[idx], lastMsg: preview, time };
      next.splice(idx, 1);
      return [item, ...next];
    });

    if (selectedChatRef.current?.chatId === message.chatId) {
      setMessages((prev) => {
        const idx = prev.findIndex((m) => m.id === message.id);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = message;
          return next.sort((a, b) => a.createdAt - b.createdAt);
        }
        return [...prev, message].sort((a, b) => a.createdAt - b.createdAt);
      });
    }
  }, [myId]);

  const relayMessage = useCallback((recipientId: string, message: StoredMessage) => {
    relayPrivateMessage(recipientId, message);
    applyIncomingMessage(message);
  }, [relayPrivateMessage, applyIncomingMessage]);

  const trackMessageContact = useCallback(async (recipientId: string, preview: string) => {
    const myMeta = getMyProfileMeta();
    await registerMessageContact({
      ownerId: recipientId,
      contactId: myId,
      initiatedBy: myId,
      contactName: myMeta.name,
      contactAvatar: myMeta.avatar,
      contactHandle: myMeta.handle,
      lastPreview: preview,
    });
  }, [myId]);

  const getMessageTransferUrl = useCallback((message: StoredMessage): string | undefined => {
    return message.audioUrl || message.mediaUrl;
  }, []);

  const dispatchFastMessage = useCallback(
    (
      recipientId: string,
      preview: string,
      result: FastSendResult,
      options?: { replacePendingId?: string }
    ) => {
      const { instant, persist, localPreviewUrl } = result;
      const transferUrl = getMessageTransferUrl(instant);

      setMessages((prev) => {
        let next = options?.replacePendingId
          ? prev.filter((m) => m.id !== options.replacePendingId)
          : [...prev];
        const idx = next.findIndex((m) => m.id === instant.id);
        if (idx >= 0) {
          next[idx] = instant;
        } else {
          next = [...next, instant];
        }
        return next.sort((a, b) => a.createdAt - b.createdAt);
      });

      applyIncomingMessage(instant);

      if (isTransferableMessageUrl(transferUrl)) {
        relayPrivateMessage(recipientId, instant);
      }

      void trackMessageContact(recipientId, preview);

      void persist()
        .then((final) => {
          const finalUrl = getMessageTransferUrl(final);
          const instantUrl = getMessageTransferUrl(instant);
          if (!isTransferableMessageUrl(instantUrl) || finalUrl !== instantUrl) {
            relayPrivateMessage(recipientId, final);
          }
          setMessages((prev) => {
            const idx = prev.findIndex((m) => m.id === final.id);
            if (idx < 0) return prev;
            const next = [...prev];
            next[idx] = final;
            return next.sort((a, b) => a.createdAt - b.createdAt);
          });
        })
        .catch((err) => {
          console.error('[Message] persist failed:', err);
          alert('Mesaj saxlanıla bilmədi, amma göndərilməyə cəhd olundu.');
        })
        .finally(() => {
          if (localPreviewUrl) URL.revokeObjectURL(localPreviewUrl);
        });
    },
    [applyIncomingMessage, relayPrivateMessage, trackMessageContact, getMessageTransferUrl]
  );

  const cleanupRecordingStream = useCallback(() => {
    recordStreamRef.current?.getTracks().forEach((track) => track.stop());
    recordStreamRef.current = null;
    mediaRecorderRef.current = null;
    recordChunksRef.current = [];
    setRecording(false);
  }, []);

  const finalizeVoiceRecording = useCallback(
    async (recorder: MediaRecorder, mimeType: string) => {
      mediaRecorderRef.current = null;
      setRecording(false);

      recordStreamRef.current?.getTracks().forEach((track) => track.stop());
      recordStreamRef.current = null;

      const blobType = recorder.mimeType || mimeType || 'audio/webm';
      const blob = new Blob(recordChunksRef.current, { type: blobType });
      recordChunksRef.current = [];

      const durationMs = Math.max(0, Date.now() - recordStartRef.current);
      const chat = selectedChatRef.current;

      if (!chat) {
        console.warn('[VoiceMessage] Chat seçilməyib, səs mesajı ləğv edildi.');
        return;
      }

      if (blob.size < 100 || durationMs < 300) {
        if (durationMs >= 100) {
          alert('Səs mesajı çox qısadır. Bir az daha uzun saxlayın.');
        }
        return;
      }

      const myMeta = getMyProfileMeta();
      const chatId = buildChatId(String(myId), String(chat.id));
      const previewUrl = URL.createObjectURL(blob);
      const pendingId = `voice-pending-${Date.now()}`;

      const optimisticMessage: StoredMessage = {
        id: pendingId,
        chatId,
        senderId: String(myId),
        recipientId: String(chat.id),
        type: 'audio',
        audioUrl: previewUrl,
        audioDurationMs: durationMs,
        createdAt: Date.now(),
      };

      applyIncomingMessage(optimisticMessage);

      try {
        const result = await sendAudioMessageFast({
          senderId: String(myId),
          recipientId: String(chat.id),
          audioBlob: blob,
          durationMs,
          senderName: myMeta.name,
          senderHandle: myMeta.handle,
          senderAvatar: myMeta.avatar,
          recipientName: chat.name,
          recipientHandle: chat.username,
          recipientAvatar: chat.avatar,
        });

        dispatchFastMessage(String(chat.id), '🎤 Səs mesajı', result, {
          replacePendingId: pendingId,
        });
      } catch (err) {
        console.error('[VoiceMessage] send failed:', err);
        alert('Səs mesajı göndərilmədi. Yenidən cəhd edin.');
        setMessages((prev) => prev.filter((m) => m.id !== pendingId));
      } finally {
        URL.revokeObjectURL(previewUrl);
      }
    },
    [myId, applyIncomingMessage, dispatchFastMessage]
  );

  const stopRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (!recorder) {
      recordPendingStopRef.current = true;
      setRecording(false);
      return;
    }

    recordPendingStopRef.current = false;

    if (recorder.state === 'inactive') {
      setRecording(false);
      return;
    }

    try {
      if (recorder.state === 'recording') {
        recorder.requestData();
      }
      recorder.stop();
    } catch (err) {
      console.error('[VoiceMessage] stop recording failed:', err);
      alert('Səs yazması dayandırıla bilmədi.');
      cleanupRecordingStream();
    }
  }, [cleanupRecordingStream]);

  useEffect(() => {
    if (!myId || myId === 'guest') return;
    ensureAppSocket();
    const unsubMessages = subscribePrivateMessages((message) => {
      if (message.senderId === myId) return;
      applyIncomingMessage(message);
    });
    const unsubErrors = onChatError((payload) => {
      if (payload.message) alert(payload.message);
    });
    const unsubDelete = onChatDelete(({ chatId, messageId }) => {
      if (selectedChatRef.current?.chatId === chatId) {
        setMessages((prev) => prev.filter((m) => m.id !== messageId));
      }
    });
    const unsubClear = onChatClear(({ chatId }) => {
      if (selectedChatRef.current?.chatId === chatId) setMessages([]);
    });
    const unsubEdit = onChatEdit(({ chatId, messageId, text, editedAt }) => {
      if (selectedChatRef.current?.chatId !== chatId) return;
      setMessages((prev) =>
        prev.map((m) => (m.id === messageId ? { ...m, text, editedAt } : m))
      );
    });
    return () => {
      unsubMessages();
      unsubErrors();
      unsubDelete();
      unsubClear();
      unsubEdit();
    };
  }, [myId, applyIncomingMessage, subscribePrivateMessages, ensureAppSocket]);

  useEffect(() => {
    setChats((prev) =>
      prev.map((c) => ({
        ...c,
        isOnline: realtimeHub.onlineUserIds[c.id] ?? c.isOnline,
      }))
    );
  }, [realtimeHub.onlineUserIds]);

  useEffect(() => {
    const targetId = searchParams.get('user');
    if (!targetId || deepLinkHandled.current || isBlocked(blockedIds, targetId)) return;
    deepLinkHandled.current = true;

    void (async () => {
      const profile = await getUserProfile(targetId);
      if (profile) {
        startChatWithUser(profile);
        return;
      }
      const users = await searchUsers(targetId, myId);
      const u = users.find((x) => x.id === targetId) || users[0];
      if (u) startChatWithUser(u);
    })();
  }, [searchParams, blockedIds, myId]);

  useEffect(() => {
    scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight);
  }, [messages]);

  useEffect(() => {
    if (!recording) {
      setRecordElapsed(0);
      if (recordTimerRef.current) {
        clearInterval(recordTimerRef.current);
        recordTimerRef.current = null;
      }
      return;
    }
    recordTimerRef.current = setInterval(() => {
      setRecordElapsed(Math.floor((Date.now() - recordStartRef.current) / 1000));
    }, 200);
    return () => {
      if (recordTimerRef.current) clearInterval(recordTimerRef.current);
    };
  }, [recording]);

  useEffect(() => {
    return () => {
      if (mediaRecorderRef.current?.state !== 'inactive') {
        mediaRecorderRef.current?.stop();
      }
      recordStreamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const startChatWithUser = (u: AppUserProfile) => {
    const chatId = buildChatId(myId, u.id);
    const chat: ChatItem = {
      chatId,
      id: u.id,
      name: [u.name, u.surname].filter(Boolean).join(' '),
      username: u.handle,
      avatar: u.avatar || DEFAULT_AVATAR,
      isOnline: false,
      lastMsg: 'Yeni söhbət',
      time: 'İndi',
    };
    setChats((prev) => (prev.some((c) => c.id === chat.id) ? prev : [chat, ...prev]));
    setSelectedChat(chat);
    setShowSearch(false);
  };

  const handleSend = async () => {
    if (!messageText.trim() || !selectedChat || sending) return;
    if (isBlocked(blockedIds, selectedChat.id)) {
      alert('Bu istifadəçini bloklamısınız.');
      return;
    }

    const text = messageText.trim();
    setMessageText('');
    setSending(true);
    const myMeta = getMyProfileMeta();

    try {
      if (editingMessage) {
        const editedAt = Date.now();
        await editMessage(editingMessage.id, editingMessage.chatId, text);
        emitChatEdit(selectedChat.id, {
          chatId: editingMessage.chatId,
          messageId: editingMessage.id,
          text,
          editedAt,
        });
        setMessages((prev) =>
          prev.map((m) => (m.id === editingMessage.id ? { ...m, text, editedAt } : m))
        );
        setEditingMessage(null);
        return;
      }

      const message = await sendPrivateMessage({
        senderId: String(myId),
        recipientId: String(selectedChat.id),
        text,
        ...myMeta,
        senderName: myMeta.name,
        senderHandle: myMeta.handle,
        senderAvatar: myMeta.avatar,
        recipientName: selectedChat.name,
        recipientHandle: selectedChat.username,
        recipientAvatar: selectedChat.avatar,
      });

      await trackMessageContact(selectedChat.id, text);
      relayMessage(String(selectedChat.id), message);
    } catch (err) {
      console.error(err);
      alert(editingMessage ? 'Mesaj düzənlənmədi.' : 'Mesaj göndərilmədi.');
      setMessageText(text);
    } finally {
      setSending(false);
    }
  };

  const startRecording = async () => {
    if (!selectedChatRef.current || mediaRecorderRef.current) return;
    recordPendingStopRef.current = false;

    const allowed = await ensureMediaPermission('microphone');
    if (!allowed) {
      alert(t.messages.micDenied);
      return;
    }

    try {
      const mimeType = getSupportedAudioMimeType();
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });

      if (recordPendingStopRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        recordPendingStopRef.current = false;
        return;
      }

      recordStreamRef.current = stream;
      const recorder = new MediaRecorder(
        stream,
        MediaRecorder.isTypeSupported(mimeType) ? { mimeType } : undefined
      );
      recordChunksRef.current = [];
      recordStartRef.current = Date.now();

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) recordChunksRef.current.push(e.data);
      };

      recorder.onerror = (event) => {
        console.error('[VoiceMessage] MediaRecorder error:', event);
        alert('Səs yazılarkən xəta baş verdi.');
        cleanupRecordingStream();
      };

      recorder.onstop = () => {
        void finalizeVoiceRecording(recorder, mimeType);
      };

      mediaRecorderRef.current = recorder;
      recorder.start(200);
      setRecording(true);

      if (recordPendingStopRef.current) {
        stopRecording();
      }
    } catch (err) {
      console.error('[VoiceMessage] start recording failed:', err);
      alert('Mikrofon açıla bilmədi. Brauzer icazəsini yoxlayın.');
      cleanupRecordingStream();
    }
  };

  const onMicHoldStart = (e: React.PointerEvent) => {
    if (sending || messageText.trim() || recording) return;
    e.preventDefault();
    micHoldRef.current = true;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    void startRecording();
  };

  const onMicHoldEnd = () => {
    if (!micHoldRef.current && !recording && !mediaRecorderRef.current) return;
    micHoldRef.current = false;
    stopRecording();
  };

  const onMicClick = () => {
    if (recording || mediaRecorderRef.current) {
      stopRecording();
    }
  };

  const handleStartCall = async (callType: CallType) => {
    if (!selectedChat) {
      alert('Zəng üçün söhbət seçin.');
      return;
    }
    if (!myId || myId === 'guest') {
      alert('Zəng etmək üçün profil qeydiyyatından keçin.');
      return;
    }
    const settings = getCallSettings();
    if (callType === 'video' && !settings.videoCallsEnabled) {
      alert('Video zəng parametrlərdə söndürülüb. ⚙️ Parametrlərdən açın.');
      setShowCallSettings(true);
      return;
    }
    ensureAppSocket();
    void unlockCallAudio();
    setCallUiState({
      mode: 'outgoing',
      callType,
      peerName: selectedChat.name,
      peerAvatar: selectedChat.avatar,
      cancel: () => {
        zegoHangUp();
      },
    });
    const media = await primeCallMedia(callType === 'video');
    if (!media.audio) {
      releaseMediaStream(media.stream);
      setCallUiState(null);
      alert(media.error || 'Mikrofon icazəsi verilməyib.');
      return;
    }
    /* İcazə verildi — mikrofonu Zego-ya burax, əks halda publish olmur. */
    releaseMediaStream(media.stream);
    setCallLocalStream(null);
    startCall({
      calleeId: String(selectedChat.id),
      calleeName: selectedChat.name,
      calleeAvatar: selectedChat.avatar,
      chatId: selectedChat.chatId,
      callType,
      joinCamera: callType === 'video' && media.video,
    });
  };

  const pendingIds = new Set(messageContacts.filter((c) => c.status === 'pending').map((c) => c.contactId));
  const pendingRequests = messageContacts.filter((c) => c.status === 'pending');
  const mainChats = chats.filter((c) => {
    if (isBlocked(blockedIds, c.id)) return false;
    if (pendingIds.has(c.id)) return false;
    if (listSearch.trim()) {
      const q = listSearch.toLowerCase();
      return c.name.toLowerCase().includes(q) || c.username.toLowerCase().includes(q);
    }
    return true;
  });

  const allianceName =
    typeof window !== 'undefined' ? localStorage.getItem('app_user_alliance_name') || '' : '';

  const openRequestChat = (contact: MessageContact) => {
    const chat: ChatItem = {
      chatId: buildChatId(myId, contact.contactId),
      id: contact.contactId,
      name: contact.contactName || 'İstifadəçi',
      username: contact.contactHandle || '',
      avatar: contact.contactAvatar || DEFAULT_AVATAR,
      isOnline: false,
      lastMsg: contact.lastPreview || 'Mesaj istəyi',
      time: 'İndi',
    };
    setSelectedChat(chat);
    setShowRequests(false);
  };

  const handleAcceptRequest = async (contactId: string) => {
    await acceptMessageRequest(myId, contactId);
    const contact = pendingRequests.find((c) => c.contactId === contactId);
    if (contact) openRequestChat(contact);
  };

  const handleBlock = async () => {
    if (!selectedChat) return;
    await blockUser(myId, selectedChat.id);
    alert(`${selectedChat.name} bloklandı.`);
    setShowActions(false);
    setSelectedChat(null);
  };

  const handleReport = async () => {
    if (!selectedChat || !reportReason.trim()) return;
    await reportContent({
      reporterId: myId,
      targetUserId: selectedChat.id,
      reason: reportReason,
      type: 'message',
    });
    alert('Şikayət qeydə alındı.');
    setReportReason('');
    setShowActions(false);
  };

  const handleOpenMedia = useCallback((m: StoredMessage) => {
    if ((m.type === 'image' || m.type === 'video') && m.mediaUrl) {
      setMediaViewer({ url: m.mediaUrl, type: m.type, fileName: m.fileName });
      return;
    }
    openMessageAsset(m);
  }, []);

  const clearSelection = useCallback(() => {
    setSelectionMode(false);
    setSelectedIds([]);
  }, []);

  const enterSelection = useCallback((m: StoredMessage) => {
    setSelectionMode(true);
    setSelectedIds((prev) => (prev.includes(m.id) ? prev : [...prev, m.id]));
    setContextMenu(null);
  }, []);

  const toggleSelect = useCallback((m: StoredMessage) => {
    setSelectedIds((prev) =>
      prev.includes(m.id) ? prev.filter((id) => id !== m.id) : [...prev, m.id]
    );
  }, []);

  const getSelectedMessages = useCallback((): StoredMessage[] => {
    return messages.filter((m) => selectedIds.includes(m.id));
  }, [messages, selectedIds]);

  const copySelectedText = useCallback(async () => {
    const texts = getSelectedMessages()
      .map((m) => m.text || messagePreview(m))
      .filter(Boolean);
    if (!texts.length) return;
    try {
      await navigator.clipboard.writeText(texts.join('\n'));
      alert('Kopyalandı');
    } catch {
      alert('Kopyalama mümkün olmadı');
    }
    clearSelection();
  }, [clearSelection, getSelectedMessages]);

  const shareSelected = useCallback(async () => {
    const texts = getSelectedMessages()
      .map((m) => m.text || messagePreview(m))
      .join('\n');
    if (!texts) return;
    if (navigator.share) {
      try {
        await navigator.share({ text: texts });
      } catch {
        /* cancelled */
      }
    } else {
      await copySelectedText();
    }
    clearSelection();
  }, [clearSelection, copySelectedText, getSelectedMessages]);

  const forwardSelected = useCallback(async () => {
    const texts = getSelectedMessages()
      .map((m) => m.text || messagePreview(m))
      .join('\n');
    if (!texts) return;
    try {
      await navigator.clipboard.writeText(texts);
      alert('Mesaj kopyalandı — başqa söhbətə yapışdırıb göndərə bilərsən.');
    } catch {
      alert('Ötürmə mümkün olmadı');
    }
    clearSelection();
  }, [clearSelection, getSelectedMessages]);

  const deleteSelected = useCallback(async () => {
    if (!selectedChat || selectedIds.length === 0) return;
    if (!window.confirm(`${selectedIds.length} mesaj silinsin?`)) return;
    ensureAppSocket();
    for (const id of selectedIds) {
      const m = messages.find((x) => x.id === id);
      if (!m) continue;
      try {
        await deleteMessage(m.id, m.chatId);
        emitChatDelete(selectedChat.id, { chatId: m.chatId, messageId: m.id });
      } catch (err) {
        console.error('[Message] batch delete:', err);
      }
    }
    setMessages((prev) => prev.filter((m) => !selectedIds.includes(m.id)));
    clearSelection();
  }, [selectedChat, selectedIds, messages, ensureAppSocket, clearSelection]);

  const handleDeleteMessage = async (m: StoredMessage) => {
    if (!selectedChat) return;
    setContextMenu(null);
    try {
      ensureAppSocket();
      await deleteMessage(m.id, m.chatId);
      emitChatDelete(selectedChat.id, { chatId: m.chatId, messageId: m.id });
      setMessages((prev) => prev.filter((x) => x.id !== m.id));
    } catch (err) {
      console.error('[Message] delete failed:', err);
      alert('Mesaj silinə bilmədi.');
    }
  };

  const handleStartEdit = (m: StoredMessage) => {
    setContextMenu(null);
    clearSelection();
    setEditingMessage(m);
    setMessageText(m.text || '');
  };

  const handleCancelEdit = () => {
    setEditingMessage(null);
    setMessageText('');
  };

  const handleClearChat = async () => {
    if (!selectedChat) return;
    if (!window.confirm('Bütün mesajlar silinsin? Bu geri qaytarıla bilməz.')) return;
    try {
      ensureAppSocket();
      await clearChat(selectedChat.chatId);
      emitChatClear(selectedChat.id, { chatId: selectedChat.chatId });
      setMessages([]);
      setShowActions(false);
    } catch (err) {
      console.error('[Message] clear chat failed:', err);
      alert('Söhbət təmizlənə bilmədi.');
    }
  };

  const runSearch = async () => {
    const results = await searchUsers(searchQuery, myId);
    setSearchResults(results.filter((u) => !isBlocked(blockedIds, u.id)));
  };

  const handleMediaSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !selectedChat || sending) return;

    const validation = validateMediaFile(file);
    if (!validation.ok) {
      alert(validation.error);
      return;
    }

    const mediaKind = validation.kind === 'video' ? 'video' : 'image';
    const myMeta = getMyProfileMeta();
    setShowAttach(false);

    try {
      const result = await sendMediaMessageFast({
        senderId: String(myId),
        recipientId: String(selectedChat.id),
        file,
        mediaKind,
        senderName: myMeta.name,
        senderHandle: myMeta.handle,
        senderAvatar: myMeta.avatar,
        recipientName: selectedChat.name,
        recipientHandle: selectedChat.username,
        recipientAvatar: selectedChat.avatar,
      });
      dispatchFastMessage(
        String(selectedChat.id),
        mediaKind === 'video' ? '📹 Video' : '📷 Şəkil',
        result
      );
    } catch (err) {
      console.error('[Message] media send failed:', err);
      alert(t.messages.uploadFailed);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !selectedChat || sending) return;

    const validation = validateMediaFile(file);
    if (!validation.ok) {
      alert(validation.error);
      return;
    }

    const myMeta = getMyProfileMeta();
    setShowAttach(false);

    try {
      let result: FastSendResult;
      let preview: string;

      if (validation.kind === 'image' || validation.kind === 'video') {
        result = await sendMediaMessageFast({
          senderId: String(myId),
          recipientId: String(selectedChat.id),
          file,
          mediaKind: validation.kind,
          senderName: myMeta.name,
          senderHandle: myMeta.handle,
          senderAvatar: myMeta.avatar,
          recipientName: selectedChat.name,
          recipientHandle: selectedChat.username,
          recipientAvatar: selectedChat.avatar,
        });
        preview = validation.kind === 'image' ? '📷 Şəkil' : '📹 Video';
      } else {
        result = await sendFileMessageFast({
          senderId: String(myId),
          recipientId: String(selectedChat.id),
          file,
          senderName: myMeta.name,
          senderHandle: myMeta.handle,
          senderAvatar: myMeta.avatar,
          recipientName: selectedChat.name,
          recipientHandle: selectedChat.username,
          recipientAvatar: selectedChat.avatar,
        });
        preview = '📎 Fayl';
      }

      dispatchFastMessage(String(selectedChat.id), preview, result);
    } catch (err) {
      console.error('[Message] file send failed:', err);
      alert(t.messages.uploadFailed);
    }
  };

  const handleSendLocation = async () => {
    if (!selectedChat || sending) return;
    setShowAttach(false);
    setSending(true);
    const myMeta = getMyProfileMeta();

    try {
      const loc = await getCurrentLocation();
      const message = await sendLocationMessage({
        senderId: String(myId),
        recipientId: String(selectedChat.id),
        lat: loc.lat,
        lng: loc.lng,
        label: loc.label,
        senderName: myMeta.name,
        senderHandle: myMeta.handle,
        senderAvatar: myMeta.avatar,
        recipientName: selectedChat.name,
        recipientHandle: selectedChat.username,
        recipientAvatar: selectedChat.avatar,
      });
      await trackMessageContact(selectedChat.id, '📍 Konum');
      relayMessage(String(selectedChat.id), message);
    } catch (err) {
      console.error(err);
      alert('Konum göndərilmədi. GPS icazəsini yoxlayın.');
    } finally {
      setSending(false);
    }
  };

  const triggerFileInput = (input: HTMLInputElement | null) => {
    setShowAttach(false);
    window.setTimeout(() => input?.click(), 80);
  };

  const openGalleryPicker = () => {
    triggerFileInput(mediaInputRef.current);
  };

  const openCameraPicker = () => {
    triggerFileInput(cameraInputRef.current);
  };

  const openFilePicker = () => {
    triggerFileInput(fileInputRef.current);
  };

  const hasComposeText = messageText.trim().length > 0;

  return (
    <div className={styles.msgHubPage}>
      <header className={styles.msgHubHeader}>
        {selectedChat && (selectionMode || selectedIds.length > 0) ? (
          <MessageSelectionBar
            count={selectedIds.length}
            onCancel={clearSelection}
            onDelete={() => void deleteSelected()}
            onCopy={() => void copySelectedText()}
            onForward={() => void forwardSelected()}
            onShare={() => void shareSelected()}
          />
        ) : selectedChat ? (
          <>
            <button type="button" className={styles.msgHubIconBtn} onClick={() => setSelectedChat(null)} aria-label="Geri">
              <IconBack />
            </button>
            <AppLink href={`/profile?user=${selectedChat.id}`} className={styles.chatHeaderProfile}>
              <img src={selectedChat.avatar} alt="" className={styles.msgHubAvatarSm} />
              <div>
                <h1 className={styles.msgHubChatTitle}>{selectedChat.name}</h1>
                <p className={styles.msgHubChatSub}>{selectedChat.username}</p>
              </div>
            </AppLink>
            <div className={styles.headerActions}>
              <button type="button" className={`${styles.msgHubIconBtn} ${styles.msgHubIconBtnAccent}`} onClick={() => void handleStartCall('voice')} aria-label={t.messages.voiceCall} title={t.messages.voiceCall}>
                <IconPhone />
              </button>
              <button type="button" className={`${styles.msgHubIconBtn} ${styles.msgHubIconBtnAccent}`} onClick={() => void handleStartCall('video')} aria-label={t.messages.videoCall} title={t.messages.videoCall}>
                <IconVideo />
              </button>
              <button type="button" className={styles.msgHubIconBtn} onClick={() => setShowActions(true)} aria-label="Daha çox">
                <IconMore />
              </button>
            </div>
          </>
        ) : (
          <>
            <div>
              <h1 className={styles.msgHubTitle}>Mesajlar</h1>
              <p className={styles.msgHubSubtitle}>13+ · Təhlükəsiz söhbət</p>
            </div>
            <div className={styles.headerActions}>
              <button type="button" className={styles.msgHubIconBtn} onClick={() => setShowCallSettings(true)} title="Zəng parametrləri" aria-label="Zəng parametrləri">
                <IconSettings />
              </button>
              <button type="button" className={`${styles.msgHubIconBtn} ${styles.msgHubIconBtnPrimary}`} onClick={() => setShowSearch(true)} aria-label="Yeni söhbət">
                <IconCompose />
              </button>
            </div>
          </>
        )}
      </header>

      {!selectedChat && (
        <>
          <div className={styles.msgSafetyStrip}>
            🛡️ {TEEN_SAFETY_RULES[0]}
          </div>
          <div className={styles.msgTabBar}>
            {(['chats', 'groups', 'calls'] as InboxTab[]).map((tab) => (
              <button
                key={tab}
                type="button"
                className={`${styles.msgTabBtn} ${inboxTab === tab ? styles.msgTabBtnActive : ''}`}
                onClick={() => setInboxTab(tab)}
              >
                {tab === 'chats' ? 'Söhbətlər' : tab === 'groups' ? 'Qruplar' : 'Zənglər'}
              </button>
            ))}
          </div>
          <input
            className={styles.msgSearchInput}
            placeholder="Axtar..."
            value={listSearch}
            onChange={(e) => setListSearch(e.target.value)}
          />
        </>
      )}

      {!selectedChat ? (
        <div className={styles.msgHubBody}>
          {inboxTab === 'chats' && (
            <>
              {pendingRequests.length > 0 && (
                <button type="button" className={styles.msgRequestBanner} onClick={() => setShowRequests(true)}>
                  <span className={styles.msgRequestIcon}>📩</span>
                  <span className={styles.msgRequestText}>
                    <strong>Mesaj istəkləri</strong>
                    <small>{pendingRequests.length} yeni sorğu</small>
                  </span>
                  <span className={styles.msgRequestChevron}>›</span>
                </button>
              )}
              {mainChats.length === 0 ? (
                <div className={styles.msgEmpty}>
                  <div className={styles.msgEmptyIcon}>💬</div>
                  <p>Söhbət yoxdur</p>
                  <button type="button" className={styles.primaryBtn} onClick={() => setShowSearch(true)}>Yeni söhbət</button>
                </div>
              ) : (
                mainChats.map((chat) => (
                  <div key={chat.chatId} className={styles.msgChatRow} onClick={() => setSelectedChat(chat)}>
                    <img src={chat.avatar} alt="" className={styles.msgHubAvatar} />
                    <div className={styles.msgChatBody}>
                      <div className={styles.msgChatTop}>
                        <span className={styles.msgChatName}>{chat.name}</span>
                        <span className={styles.msgChatTime}>{chat.time}</span>
                      </div>
                      <p className={styles.msgChatPreview}>{chat.lastMsg}</p>
                    </div>
                  </div>
                ))
              )}
            </>
          )}

          {inboxTab === 'groups' && (
            <div className={styles.msgGroupsPane}>
              {allianceName ? (
                <div className={styles.msgGroupCard}>
                  <span className={styles.msgGroupIcon}>⚔️</span>
                  <div>
                    <strong>{allianceName}</strong>
                    <p>İttifaq qrup söhbəti</p>
                  </div>
                  <AppLink href="/alliance" className={styles.msgGroupLink}>Aç</AppLink>
                </div>
              ) : (
                <div className={styles.msgEmpty}>
                  <div className={styles.msgEmptyIcon}>👥</div>
                  <p>Qrup yoxdur</p>
                  <small>İttifaqdan qrup söhbətinə qoşula bilərsən</small>
                  <AppLink href="/alliance" className={styles.secondaryBtn}>İttifaqə get</AppLink>
                </div>
              )}
            </div>
          )}

          {inboxTab === 'calls' && (
            <div className={styles.msgCallsPane}>
              {callHistory.length === 0 ? (
                <div className={styles.msgEmpty}>
                  <div className={styles.msgEmptyIcon}>📞</div>
                  <p>Zəng tarixçəsi boşdur</p>
                </div>
              ) : (
                callHistory.map((call) => (
                  <div key={call.callId} className={styles.msgCallRow}>
                    <span className={styles.msgCallDir}>{call.direction === 'incoming' ? '↓' : '↑'}</span>
                    <div className={styles.msgChatBody}>
                      <span className={styles.msgChatName}>{call.peerName}</span>
                      <p className={styles.msgChatPreview}>
                        {call.callType === 'video' ? '📹' : '📞'} {call.status} · {formatTime(call.createdAt)}
                      </p>
                    </div>
                    <button
                      type="button"
                      className={`${styles.msgHubIconBtn} ${styles.msgHubIconBtnAccent}`}
                      onClick={() => {
                        const chat = chats.find((c) => c.id === call.peerId) || {
                          chatId: buildChatId(myId, call.peerId),
                          id: call.peerId,
                          name: call.peerName,
                          username: '',
                          avatar: DEFAULT_AVATAR,
                          isOnline: false,
                          lastMsg: '',
                          time: '',
                        };
                        setSelectedChat(chat);
                        void handleStartCall(call.callType);
                      }}
                      aria-label="Zəng et"
                    >
                      <IconPhone />
                    </button>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      ) : (
        <div className={styles.messageArea}>
          <div className={styles.messageScroll} ref={scrollRef}>
            <ChatSystemPill>Təhlükəsiz söhbət · Blokla və ya şikayət et</ChatSystemPill>
            {messages.map((m) => (
              <ChatMessageRow
                key={m.id}
                message={m}
                myId={myId}
                selected={selectedIds.includes(m.id)}
                selectionMode={selectionMode}
                onBubbleLongPress={(msg, anchor) => setContextMenu({ message: msg, anchor })}
                onGutterLongPress={enterSelection}
                onToggleSelect={toggleSelect}
              >
                <MessageBubble m={m} myId={myId} onOpenMedia={handleOpenMedia} />
              </ChatMessageRow>
            ))}
          </div>
          {recording && (
            <div className={styles.voiceRecordingBar}>
              <span className={styles.voiceRecDot} aria-hidden />
              🎤 Səs yazılır · {recordElapsed}s — buraxın və ya mikrofona toxunun
            </div>
          )}
          {editingMessage && (
            <div className={styles.editBanner}>
              <span>✏️ Mesajı düzənləyirsən</span>
              <button type="button" onClick={handleCancelEdit}>Ləğv</button>
            </div>
          )}
          <div className={styles.composeBar}>
            <input
              ref={mediaInputRef}
              type="file"
              accept="image/*,video/*"
              className={styles.hiddenFileInput}
              onChange={(e) => void handleMediaSelect(e)}
            />
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className={styles.hiddenFileInput}
              onChange={(e) => void handleMediaSelect(e)}
            />
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.txt,.zip,.rar"
              className={styles.hiddenFileInput}
              onChange={(e) => void handleFileSelect(e)}
            />
            <button
              type="button"
              className={styles.msgComposeBtn}
              onClick={() => setShowAttach(true)}
              disabled={sending || recording}
              title={t.messages.attachTitle}
              aria-label="Fayl əlavə et"
            >
              <IconAttach />
            </button>
            <input
              className={styles.composeInput}
              placeholder={
                editingMessage
                  ? 'Mesajı düzənlə...'
                  : recording
                    ? 'Səs yazılır...'
                    : sending
                      ? t.messages.sending
                      : t.messages.placeholder
              }
              value={messageText}
              onChange={(e) => setMessageText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && hasComposeText && handleSend()}
              disabled={sending || recording}
            />
            {hasComposeText ? (
              <button
                type="button"
                className={`${styles.msgComposeBtn} ${styles.msgComposeSendBtn}`}
                onClick={() => void handleSend()}
                disabled={sending || recording}
                aria-label="Göndər"
              >
                <IconSend />
              </button>
            ) : (
              <button
                type="button"
                className={`${styles.msgComposeBtn} ${styles.msgComposeMicBtn} ${recording ? styles.recordingActive : ''}`}
                onPointerDown={onMicHoldStart}
                onPointerUp={onMicHoldEnd}
                onPointerCancel={onMicHoldEnd}
                onPointerLeave={onMicHoldEnd}
                onClick={onMicClick}
                disabled={sending}
                title={recording ? 'Dayandır və göndər' : 'Basılı saxla — səs mesajı'}
                aria-label={recording ? 'Səs yazmasını dayandır' : 'Səs mesajı'}
              >
                <IconMic />
              </button>
            )}
          </div>
        </div>
      )}

      {showCallSettings && <CallSettingsSheet onClose={() => setShowCallSettings(false)} />}

      {showRequests && (
        <div className={styles.modalOverlay} onClick={() => setShowRequests(false)}>
          <div className={styles.modalSheet} onClick={(e) => e.stopPropagation()}>
            <h2 className={styles.modalTitle}>📩 Mesaj istəkləri</h2>
            <p className={styles.msgSafetyIntro}>Instagram tipli — qəbul et və ya rədd et</p>
            {pendingRequests.map((req) => (
              <div key={req.id} className={styles.msgRequestRow}>
                <img src={req.contactAvatar || DEFAULT_AVATAR} alt="" className={styles.msgHubAvatarSm} />
                <div className={styles.msgChatBody}>
                  <strong>{req.contactName || 'İstifadəçi'}</strong>
                  <p className={styles.msgChatPreview}>{req.lastPreview || 'Yeni mesaj'}</p>
                </div>
                <button type="button" className={styles.msgAcceptBtn} onClick={() => void handleAcceptRequest(req.contactId)}>✓</button>
                <button type="button" className={styles.msgDeclineBtn} onClick={() => void declineMessageRequest(myId, req.contactId)}>✕</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {showAttach && (
        <AttachSheet
          onGallery={openGalleryPicker}
          onCamera={openCameraPicker}
          onDocument={openFilePicker}
          onLocation={() => void handleSendLocation()}
          onClose={() => setShowAttach(false)}
        />
      )}

      {showSearch && (
        <div className={styles.modalOverlay} onClick={() => setShowSearch(false)}>
          <div className={styles.modalSheet} onClick={(e) => e.stopPropagation()}>
            <h2 className={styles.modalTitle}>{t.messages.search}</h2>
            <input className={styles.input} placeholder={t.messages.searchPlaceholder} value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
            <button type="button" className={styles.primaryBtn} onClick={runSearch}>{t.messages.searchBtn}</button>
            {searchResults.map((u) => (
              <div key={u.id} className={styles.userResult} onClick={() => startChatWithUser(u)}>
                <img src={u.avatar || DEFAULT_AVATAR} alt="" className={styles.avatar} />
                <div>
                  <div style={{ fontWeight: 800 }}>{u.name} {u.surname}</div>
                  <div style={{ fontSize: 12, color: '#94a3b8' }}>{u.handle}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {showActions && selectedChat && (
        <div className={styles.modalOverlay} onClick={() => setShowActions(false)}>
          <div className={styles.modalSheet} onClick={(e) => e.stopPropagation()}>
            <h2 className={styles.modalTitle}>{selectedChat.name}</h2>
            <AppLink
              href={`/profile?user=${selectedChat.id}`}
              className={styles.secondaryBtn}
              style={{ display: 'block', textAlign: 'center', textDecoration: 'none', marginBottom: 8 }}
            >
              👤 {t.messages.viewProfile}
            </AppLink>
            <button type="button" className={styles.dangerBtn} onClick={handleClearChat}>
              🗑️ Söhbəti təmizlə
            </button>
            <button type="button" className={styles.dangerBtn} onClick={handleBlock}>🚫 Blokla</button>
            <textarea className={styles.input} rows={3} placeholder="Şikayət səbəbi..." value={reportReason} onChange={(e) => setReportReason(e.target.value)} />
            <button type="button" className={styles.secondaryBtn} onClick={handleReport}>⚠️ Şikayət et</button>
          </div>
        </div>
      )}

      {contextMenu && (
        <MessageContextMenu
          message={contextMenu.message}
          anchor={contextMenu.anchor}
          myId={myId}
          onEdit={() => handleStartEdit(contextMenu.message)}
          onDelete={() => void handleDeleteMessage(contextMenu.message)}
          onCopy={() => {
            const t = contextMenu.message.text || messagePreview(contextMenu.message);
            void navigator.clipboard.writeText(t);
            setContextMenu(null);
          }}
          onClose={() => setContextMenu(null)}
        />
      )}

      {mediaViewer && (
        <div className={styles.mediaLightbox} onClick={() => setMediaViewer(null)}>
          <button
            type="button"
            className={styles.mediaLightboxClose}
            onClick={() => setMediaViewer(null)}
            aria-label="Bağla"
          >
            ✕
          </button>
          {mediaViewer.type === 'image' ? (
            <img
              src={mediaViewer.url}
              alt={mediaViewer.fileName || 'Şəkil'}
              className={styles.mediaLightboxImage}
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <video
              src={mediaViewer.url}
              controls
              autoPlay
              playsInline
              className={styles.mediaLightboxVideo}
              onClick={(e) => e.stopPropagation()}
            />
          )}
          <div className={styles.mediaLightboxActions} onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className={styles.primaryBtn}
              onClick={() => {
                const link = document.createElement('a');
                link.href = mediaViewer.url;
                link.target = '_blank';
                link.rel = 'noopener noreferrer';
                if (mediaViewer.fileName) link.download = mediaViewer.fileName;
                link.click();
              }}
            >
              Yeni pəncərədə aç
            </button>
          </div>
        </div>
      )}

      <AppBottomNav activeTab="messages" />
    </div>
  );
}
