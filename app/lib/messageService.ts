import {
  collection,
  doc,
  query,
  where,
  onSnapshot,
  Unsubscribe,
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '@/firebase';
import { ensureFirebaseAuth, blobToDataUrl, compressImage } from './firebaseAuth';
import type { AppUserProfile } from './socialTypes';

export type MessageType = 'text' | 'audio' | 'call' | 'image' | 'video' | 'file' | 'location';

export interface ChatSummary {
  chatId: string;
  otherUserId: string;
  otherUserName: string;
  otherUserHandle: string;
  otherUserAvatar: string;
  lastMessage: string;
  lastMessageAt: number;
  archived?: boolean;
}

export interface StoredMessage {
  id: string;
  chatId: string;
  senderId: string;
  recipientId: string;
  type: MessageType;
  text?: string;
  audioUrl?: string;
  audioDurationMs?: number;
  mediaUrl?: string;
  mediaMime?: string;
  fileName?: string;
  locationLat?: number;
  locationLng?: number;
  callType?: 'voice' | 'video';
  callStatus?: string;
  replyTo?: { id: string; senderId: string; type: MessageType; text: string };
  forwardedFrom?: { senderId: string; senderName: string };
  reactions?: Record<string, string[]>;
  pinnedBy?: string[];
  editedAt?: number;
  deliveredAt?: number;
  readAt?: number;
  createdAt: number;
}

const DEFAULT_AVATAR =
  'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=100&q=80';

const INLINE_LIMIT = 650_000;
/** Kiçik səs mesajları üçün Storage əvəzinə inline saxlama */
const VOICE_INLINE_PREFER = 350_000;
async function privateMessagesRequest<T = any>(
  action: string,
  profileId: string,
  method: 'GET' | 'POST' = 'GET',
  payload: Record<string, unknown> = {}
): Promise<T> {
  const user = await ensureFirebaseAuth();
  if (!user || user.isAnonymous) throw new Error('Mesaj serverinə qoşulmaq üçün qeydiyyatdan keçmiş hesaba daxil olun.');
  const params = new URLSearchParams({ handler: 'messages', action, profileId: String(profileId) });
  if (method === 'GET') {
    Object.entries(payload).forEach(([key, value]) => {
      if (value !== undefined && value !== null) params.set(key, String(value));
    });
  }
  const body = method === 'POST' ? JSON.stringify({ ...payload, profileId: String(profileId) }) : undefined;

  const send = async (forceRefresh: boolean) => {
    const token = await user.getIdToken(forceRefresh);
    return fetch(`/api/paypal?${params.toString()}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body,
      cache: 'no-store',
    });
  };

  let response = await send(false);
  let result = await response.json().catch(() => ({}));
  // Firebase ID token müddəti bitibsə, bir dəfə yenilə və sorğunu təkrar et.
  if (response.status === 401 && ['AUTH_TOKEN_INVALID', 'AUTH_REQUIRED'].includes(String(result.error || ''))) {
    response = await send(true);
    result = await response.json().catch(() => ({}));
  }
  if (!response.ok) throw new Error(String(result.error || 'PRIVATE_MESSAGES_FAILED'));
  return result as T;
}

async function persistPrivateMessage(
  payload: ChatPayload,
  message: StoredMessage
): Promise<StoredMessage> {
  const result = await privateMessagesRequest<{ message: StoredMessage }>(
    'send',
    payload.senderId,
    'POST',
    {
      senderId: payload.senderId,
      recipientId: payload.recipientId,
      senderName: payload.senderName || '',
      senderHandle: payload.senderHandle || '',
      senderAvatar: payload.senderAvatar || '',
      recipientName: payload.recipientName || '',
      recipientHandle: payload.recipientHandle || '',
      recipientAvatar: payload.recipientAvatar || '',
      message,
    }
  );
  return result.message;
}


export interface FastSendResult {
  instant: StoredMessage;
  persist: () => Promise<StoredMessage>;
  /** Yalnız lokal UI üçün — socket-ə getmir */
  localPreviewUrl?: string;
}

export async function searchMessageUsers(queryText: string, currentUserId: string): Promise<AppUserProfile[]> {
  const query = queryText.trim();
  if (!query) return [];
  const result = await privateMessagesRequest<{ users: AppUserProfile[] }>(
    'search-users', currentUserId, 'GET', { q: query }
  );
  return result.users || [];
}

export function isTransferableMessageUrl(url?: string): boolean {
  return Boolean(url && (url.startsWith('data:') || url.startsWith('http')));
}

async function toSocketTransferUrl(blob: Blob): Promise<string | null> {
  if (blob.size > INLINE_LIMIT) return null;
  return blobToDataUrl(blob);
}

async function persistBlobUrl(
  path: string,
  blob: Blob,
  mime: string,
  preferInlineUnder = VOICE_INLINE_PREFER
): Promise<string> {
  await ensureFirebaseAuth();
  if (blob.size <= preferInlineUnder) {
    return blobToDataUrl(blob);
  }
  return uploadOrInline(path, blob, mime);
}

function newMessageRef() {
  return doc(collection(db, 'private_messages'));
}

export function buildChatId(userA: string, userB: string): string {
  return [userA, userB].sort().join('__');
}

interface ParticipantMeta {
  senderName?: string;
  senderHandle?: string;
  senderAvatar?: string;
  recipientName?: string;
  recipientHandle?: string;
  recipientAvatar?: string;
}

interface ChatPayload extends ParticipantMeta {
  senderId: string;
  recipientId: string;
}

export async function ensurePrivateChat(payload: ChatPayload): Promise<void> {
  await upsertChat(buildChatId(payload.senderId, payload.recipientId), {
    ...payload,
    lastMessage: 'Yeni söhbət',
    lastMessageAt: Date.now(),
  });
}

async function upsertChat(
  _chatId: string,
  payload: ChatPayload & { lastMessage: string; lastMessageAt: number }
): Promise<void> {
  await privateMessagesRequest('ensure-chat', payload.senderId, 'POST', {
    senderId: payload.senderId,
    recipientId: payload.recipientId,
    senderName: payload.senderName || '',
    senderHandle: payload.senderHandle || '',
    senderAvatar: payload.senderAvatar || '',
    recipientName: payload.recipientName || '',
    recipientHandle: payload.recipientHandle || '',
    recipientAvatar: payload.recipientAvatar || '',
    lastMessage: payload.lastMessage,
    lastMessageAt: payload.lastMessageAt,
  });
}

async function uploadOrInline(path: string, blob: Blob, mime: string): Promise<string> {
  await ensureFirebaseAuth();
  try {
    const storageRef = ref(storage, path);
    await uploadBytes(storageRef, blob, { contentType: mime });
    return await getDownloadURL(storageRef);
  } catch (err) {
    console.warn('Storage upload failed, inline fallback', err);
    if (blob.size <= INLINE_LIMIT) {
      return blobToDataUrl(blob);
    }
    throw new Error('Fayl yüklənmədi. Faylı kiçildin və ya yenidən cəhd edin.');
  }
}

export function messagePreview(msg: StoredMessage): string {
  switch (msg.type) {
    case 'audio':
      return '🎤 Səs mesajı';
    case 'image':
      return '📷 Şəkil';
    case 'video':
      return '🎬 Video';
    case 'file':
      return `📁 ${msg.fileName || 'Fayl'}`;
    case 'location':
      return '📍 Konum';
    case 'call':
      return msg.text || 'Zəng';
    default:
      return msg.text?.trim() || 'Mesaj';
  }
}

export async function sendPrivateMessage(payload: ChatPayload & { text: string; replyTo?: StoredMessage['replyTo'] }): Promise<StoredMessage> {
  const user = await ensureFirebaseAuth();
  if (!user) throw new Error('Mesaj göndərmək üçün internet bağlantısı lazımdır.');
  const chatId = buildChatId(payload.senderId, payload.recipientId);
  const now = Date.now();
  const trimmed = payload.text.trim();
  if (!trimmed) throw new Error('Boş mesaj göndərilə bilməz');

  const msgRef = newMessageRef();
  const message: StoredMessage = {
    id: msgRef.id,
    chatId,
    senderId: payload.senderId,
    recipientId: payload.recipientId,
    type: 'text',
    text: trimmed,
    replyTo: payload.replyTo,
    createdAt: now,
  };
  return persistPrivateMessage(payload, message);
}

export async function sendAudioMessageFast(
  payload: ChatPayload & { audioBlob: Blob; durationMs: number }
): Promise<FastSendResult> {
  const chatId = buildChatId(payload.senderId, payload.recipientId);
  const now = Date.now();
  const msgRef = newMessageRef();
  const messageId = msgRef.id;
  const mime = payload.audioBlob.type || 'audio/webm';
  const ext = mime.includes('mp4') ? 'm4a' : mime.includes('ogg') ? 'ogg' : 'webm';

  const socketUrl = await toSocketTransferUrl(payload.audioBlob);
  const localPreviewUrl = socketUrl ? undefined : URL.createObjectURL(payload.audioBlob);

  const instant: StoredMessage = {
    id: messageId,
    chatId,
    senderId: payload.senderId,
    recipientId: payload.recipientId,
    type: 'audio',
    audioUrl: socketUrl || localPreviewUrl!,
    audioDurationMs: payload.durationMs,
    createdAt: now,
  };

  const persist = async (): Promise<StoredMessage> => {
    const audioUrl = await persistBlobUrl(
      `voice_messages/${chatId}/${messageId}.${ext}`,
      payload.audioBlob,
      mime
    );
    const message: StoredMessage = { ...instant, audioUrl };
    return persistPrivateMessage(payload, message);
  };

  return { instant, persist, localPreviewUrl };
}

export async function sendAudioMessage(payload: ChatPayload & { audioBlob: Blob; durationMs: number }): Promise<StoredMessage> {
  const { persist } = await sendAudioMessageFast(payload);
  return persist();
}

export async function sendMediaMessageFast(
  payload: ChatPayload & { file: File; mediaKind: 'image' | 'video' }
): Promise<FastSendResult> {
  const chatId = buildChatId(payload.senderId, payload.recipientId);
  const now = Date.now();
  const msgRef = newMessageRef();
  const messageId = msgRef.id;
  const type = payload.mediaKind;
  const lastMessage = type === 'image' ? '📷 Şəkil' : '🎬 Video';
  const localPreviewUrl = URL.createObjectURL(payload.file);
  const socketUrl = await toSocketTransferUrl(payload.file);

  const instant: StoredMessage = {
    id: messageId,
    chatId,
    senderId: payload.senderId,
    recipientId: payload.recipientId,
    type,
    mediaUrl: socketUrl || localPreviewUrl,
    mediaMime: payload.file.type,
    createdAt: now,
  };

  const persist = async (): Promise<StoredMessage> => {
    let blob: Blob = payload.file;
    let mime = payload.file.type;
    if (type === 'image') {
      blob = await compressImage(payload.file, 1920, 0.9);
      mime = 'image/jpeg';
    }
    const ext = type === 'image' ? 'jpg' : payload.file.name.split('.').pop()?.toLowerCase() || 'mp4';
    const mediaUrl = await persistBlobUrl(
      `chat_media/${chatId}/${messageId}.${ext}`,
      blob,
      mime,
      type === 'image' ? 500_000 : VOICE_INLINE_PREFER
    );
    const message: StoredMessage = { ...instant, mediaUrl, mediaMime: mime };
    return persistPrivateMessage(payload, message);
  };

  return { instant, persist, localPreviewUrl: socketUrl ? undefined : localPreviewUrl };
}

export async function sendFileMessageFast(payload: ChatPayload & { file: File }): Promise<FastSendResult> {
  const chatId = buildChatId(payload.senderId, payload.recipientId);
  const now = Date.now();
  const msgRef = newMessageRef();
  const messageId = msgRef.id;
  const ext = payload.file.name.split('.').pop()?.toLowerCase() || 'bin';
  const localPreviewUrl = URL.createObjectURL(payload.file);
  const socketUrl = await toSocketTransferUrl(payload.file);

  const instant: StoredMessage = {
    id: messageId,
    chatId,
    senderId: payload.senderId,
    recipientId: payload.recipientId,
    type: 'file',
    mediaUrl: socketUrl || localPreviewUrl,
    fileName: payload.file.name,
    mediaMime: payload.file.type,
    createdAt: now,
  };

  const persist = async (): Promise<StoredMessage> => {
    const mediaUrl = await uploadOrInline(
      `chat_files/${chatId}/${messageId}.${ext}`,
      payload.file,
      payload.file.type || 'application/octet-stream'
    );
    const message: StoredMessage = { ...instant, mediaUrl };
    return persistPrivateMessage(payload, message);
  };

  return { instant, persist, localPreviewUrl: socketUrl ? undefined : localPreviewUrl };
}

export async function sendMediaMessage(payload: ChatPayload & { file: File; mediaKind: 'image' | 'video' }): Promise<StoredMessage> {
  const { persist } = await sendMediaMessageFast(payload);
  return persist();
}

export async function sendFileMessage(payload: ChatPayload & { file: File }): Promise<StoredMessage> {
  const { persist } = await sendFileMessageFast(payload);
  return persist();
}

export async function sendLocationMessage(
  payload: ChatPayload & { lat: number; lng: number; label: string }
): Promise<StoredMessage> {
  const chatId = buildChatId(payload.senderId, payload.recipientId);
  const now = Date.now();
  const msgRef = newMessageRef();
  const mapsUrl = `https://www.google.com/maps?q=${payload.lat},${payload.lng}`;
  const message: StoredMessage = {
    id: msgRef.id,
    chatId,
    senderId: payload.senderId,
    recipientId: payload.recipientId,
    type: 'location',
    text: payload.label,
    mediaUrl: mapsUrl,
    locationLat: payload.lat,
    locationLng: payload.lng,
    createdAt: now,
  };
  return persistPrivateMessage(payload, message);
}

export async function sendCallLogMessage(payload: {
  senderId: string;
  recipientId: string;
  callType: 'voice' | 'video';
  callStatus: string;
  senderName?: string;
  recipientName?: string;
}): Promise<void> {
  const chatId = buildChatId(payload.senderId, payload.recipientId);
  const now = Date.now();
  const label =
    payload.callType === 'video' ? `📹 Video zəng — ${payload.callStatus}` : `📞 Səsli zəng — ${payload.callStatus}`;
  const meta = {
    senderId: payload.senderId,
    recipientId: payload.recipientId,
    senderName: payload.senderName,
    recipientName: payload.recipientName,
  };
  const msgRef = newMessageRef();
  await persistPrivateMessage(meta, {
    id: msgRef.id,
    chatId,
    senderId: payload.senderId,
    recipientId: payload.recipientId,
    type: 'call',
    text: label,
    callType: payload.callType,
    callStatus: payload.callStatus,
    createdAt: now,
  });
}

export function listenBlockedMessageUsers(
  userId: string,
  callback: (blockedIds: string[]) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  let cancelled = false;
  void privateMessagesRequest<{ blockedIds: string[] }>('blocked', userId)
    .then((result) => { if (!cancelled) callback(result.blockedIds || []); })
    .catch((error) => { if (!cancelled) onError?.(error instanceof Error ? error : new Error(String(error))); });
  return () => { cancelled = true; };
}

export async function blockMessageUser(userId: string, targetUserId: string): Promise<void> {
  await privateMessagesRequest('block', userId, 'POST', { targetUserId });
}

export async function unblockMessageUser(userId: string, targetUserId: string): Promise<void> {
  await privateMessagesRequest('unblock', userId, 'POST', { targetUserId });
}

export async function reportMessageUser(userId: string, targetUserId: string, reason: string): Promise<void> {
  await privateMessagesRequest('report', userId, 'POST', { targetUserId, reason });
}

export function listenUserChats(
  userId: string,
  callback: (chats: ChatSummary[]) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  let cancelled = false;
  void privateMessagesRequest<{ chats: ChatSummary[] }>('chats', userId)
    .then((result) => {
      if (!cancelled) callback(result.chats || []);
    })
    .catch((error) => {
      if (!cancelled) onError?.(error instanceof Error ? error : new Error(String(error)));
    });
  return () => { cancelled = true; };
}

function docToStoredMessage(d: { id: string; data: () => Record<string, unknown> }): StoredMessage {
  const data = d.data();
  return {
    id: (data.id as string) || d.id,
    chatId: data.chatId as string,
    senderId: data.senderId as string,
    recipientId: data.recipientId as string,
    type: (data.type as MessageType) || 'text',
    text: data.text as string | undefined,
    audioUrl: data.audioUrl as string | undefined,
    audioDurationMs: data.audioDurationMs as number | undefined,
    mediaUrl: data.mediaUrl as string | undefined,
    mediaMime: data.mediaMime as string | undefined,
    fileName: data.fileName as string | undefined,
    locationLat: data.locationLat as number | undefined,
    locationLng: data.locationLng as number | undefined,
    callType: data.callType as 'voice' | 'video' | undefined,
    callStatus: data.callStatus as string | undefined,
    editedAt: data.editedAt as number | undefined,
    deliveredAt: data.deliveredAt as number | undefined,
    readAt: data.readAt as number | undefined,
    replyTo: data.replyTo as StoredMessage['replyTo'],
    forwardedFrom: data.forwardedFrom as StoredMessage['forwardedFrom'],
    reactions: data.reactions as StoredMessage['reactions'],
    pinnedBy: Array.isArray(data.pinnedBy) ? data.pinnedBy.map(String) : [],
    createdAt: (data.createdAt as number) || 0,
  };
}

/** Mətn mesajını düzənlə (WhatsApp — yalnız öz mesajın) */
export async function toggleMessagePin(messageId: string, chatId: string, userId: string): Promise<string[]> {
  const result = await privateMessagesRequest<{ pinnedBy: string[] }>('pin', userId, 'POST', { messageId, chatId });
  return result.pinnedBy || [];
}

export async function toggleMessageReaction(
  messageId: string,
  chatId: string,
  emoji: string,
  userId: string
): Promise<Record<string, string[]>> {
  const result = await privateMessagesRequest<{ reactions: Record<string, string[]> }>(
    'react', userId, 'POST', { messageId, chatId, emoji }
  );
  return result.reactions || {};
}

export async function forwardPrivateMessage(payload: {
  messageId: string;
  targetUserId: string;
  senderId: string;
  senderName?: string;
  senderHandle?: string;
  senderAvatar?: string;
  forwardedFromName?: string;
}): Promise<StoredMessage> {
  const result = await privateMessagesRequest<{ message: StoredMessage }>(
    'forward', payload.senderId, 'POST', {
      messageId: payload.messageId,
      targetUserId: payload.targetUserId,
      senderMeta: {
        name: payload.senderName || '',
        handle: payload.senderHandle || '',
        avatar: payload.senderAvatar || '',
      },
      forwardedFromName: payload.forwardedFromName || '',
    }
  );
  return result.message;
}

export async function editMessage(messageId: string, chatId: string, newText: string, userId: string): Promise<void> {
  const trimmed = newText.trim();
  if (!trimmed) throw new Error('Mesaj boş ola bilməz.');
  await privateMessagesRequest('edit', userId, 'POST', { messageId, chatId, text: trimmed });
}

/** Mesajı sil — iştirakçılardan biri silə bilər. */
export async function deleteMessage(messageId: string, chatId: string, userId: string): Promise<void> {
  await privateMessagesRequest('delete', userId, 'POST', { messageId, chatId });
}

/** Söhbətdəki bütün mesajları sil. */
export async function clearChat(chatId: string, userId: string): Promise<void> {
  await privateMessagesRequest('clear', userId, 'POST', { chatId });
}

export async function markMessagesReceived(
  chatId: string,
  messageIds: string[],
  status: { deliveredAt?: number; readAt?: number },
  userId: string
): Promise<void> {
  if (!messageIds.length) return;
  await privateMessagesRequest('status-bulk', userId, 'POST', { chatId, messageIds, ...status });
}

export async function setPrivateChatArchived(chatId: string, userId: string, archived: boolean): Promise<void> {
  await privateMessagesRequest(archived ? 'archive-chat' : 'unarchive-chat', userId, 'POST', { chatId });
}

export function listenChatMessages(
  chatId: string,
  userId: string,
  callback: (msgs: StoredMessage[]) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  let cancelled = false;
  let loading = false;
  let lastSignature = '';

  // Mesaj tarixçəsini əvvəlcə təsdiqlənmiş server API-sindən alırıq.
  // Beləliklə Firestore client qaydaları/indeksləri tarixçənin açılmasını bloklamır.
  const load = async () => {
    if (cancelled || loading) return;
    loading = true;
    try {
      const result = await privateMessagesRequest<{ messages: StoredMessage[] }>(
        'messages', userId, 'GET', { chatId }
      );
      if (cancelled) return;
      const messages = (result.messages || [])
        .map((message) => ({
          ...message,
          id: String(message.id || ''),
          chatId: String(message.chatId || chatId),
          createdAt: Number(message.createdAt) || 0,
        }))
        .filter((message) => message.id && message.chatId === chatId)
        .sort((a, b) => a.createdAt - b.createdAt)
        .slice(-100);
      const signature = messages.map((message) => `${message.id}:${message.editedAt || 0}:${message.readAt || 0}:${message.deliveredAt || 0}`).join('|');
      if (signature !== lastSignature) {
        lastSignature = signature;
        callback(messages);
      }
    } catch (error) {
      if (!cancelled) onError?.(error instanceof Error ? error : new Error(String(error)));
    } finally {
      loading = false;
    }
  };

  void load();
  // Socket hadisəsi itərsə tarixçəni yeniləmək üçün ehtiyat sinxronizasiya.
  const interval = setInterval(() => { void load(); }, 30_000);
  return () => {
    cancelled = true;
    clearInterval(interval);
  };
}
