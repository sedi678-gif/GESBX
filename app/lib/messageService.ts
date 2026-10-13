import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  writeBatch,
  query,
  where,
  onSnapshot,
  Unsubscribe,
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '@/firebase';
import { ensureFirebaseAuth, blobToDataUrl, compressImage } from './firebaseAuth';

export type MessageType = 'text' | 'audio' | 'call' | 'image' | 'video' | 'file' | 'location';

export interface ChatSummary {
  chatId: string;
  otherUserId: string;
  otherUserName: string;
  otherUserHandle: string;
  otherUserAvatar: string;
  lastMessage: string;
  lastMessageAt: number;
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
  editedAt?: number;
  createdAt: number;
}

const DEFAULT_AVATAR =
  'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=100&q=80';

const INLINE_LIMIT = 900_000;
/** Kiçik səs mesajları üçün Storage əvəzinə inline saxlama */
const VOICE_INLINE_PREFER = 350_000;

export interface FastSendResult {
  instant: StoredMessage;
  persist: () => Promise<StoredMessage>;
  /** Yalnız lokal UI üçün — socket-ə getmir */
  localPreviewUrl?: string;
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

async function upsertChat(
  chatId: string,
  payload: ChatPayload & { lastMessage: string; lastMessageAt: number }
) {
  await ensureFirebaseAuth();
  const existingChat = await getDoc(doc(db, 'private_chats', chatId));
  const existingMeta = existingChat.exists()
    ? (existingChat.data().participantMeta as Record<string, { name?: string; handle?: string; avatar?: string }>) || {}
    : {};

  await setDoc(
    doc(db, 'private_chats', chatId),
    {
      chatId,
      participants: [payload.senderId, payload.recipientId],
      participantMeta: {
        ...existingMeta,
        [payload.senderId]: {
          name: payload.senderName || existingMeta[payload.senderId]?.name || '',
          handle: payload.senderHandle || existingMeta[payload.senderId]?.handle || '',
          avatar: payload.senderAvatar || existingMeta[payload.senderId]?.avatar || DEFAULT_AVATAR,
        },
        [payload.recipientId]: {
          name: payload.recipientName || existingMeta[payload.recipientId]?.name || '',
          handle: payload.recipientHandle || existingMeta[payload.recipientId]?.handle || '',
          avatar: payload.recipientAvatar || existingMeta[payload.recipientId]?.avatar || DEFAULT_AVATAR,
        },
      },
      lastMessage: payload.lastMessage,
      lastMessageAt: payload.lastMessageAt,
      updatedAt: payload.lastMessageAt,
    },
    { merge: true }
  );
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

export async function sendPrivateMessage(payload: ChatPayload & { text: string }): Promise<StoredMessage> {
  const user = await ensureFirebaseAuth();
  if (!user) throw new Error('Mesaj göndərmək üçün internet bağlantısı lazımdır.');
  const chatId = buildChatId(payload.senderId, payload.recipientId);
  const now = Date.now();
  const trimmed = payload.text.trim();
  if (!trimmed) throw new Error('Boş mesaj göndərilə bilməz');

  const msgRef = doc(collection(db, 'private_messages'));
  const message: StoredMessage = {
    id: msgRef.id,
    chatId,
    senderId: payload.senderId,
    recipientId: payload.recipientId,
    type: 'text',
    text: trimmed,
    createdAt: now,
  };
  await setDoc(msgRef, message);
  await upsertChat(chatId, { ...payload, lastMessage: trimmed, lastMessageAt: now });
  return message;
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
    await setDoc(msgRef, message);
    await upsertChat(chatId, { ...payload, lastMessage: '🎤 Səs mesajı', lastMessageAt: now });
    return message;
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
      blob = await compressImage(payload.file);
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
    await setDoc(msgRef, message);
    await upsertChat(chatId, { ...payload, lastMessage, lastMessageAt: now });
    return message;
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
    await setDoc(msgRef, message);
    await upsertChat(chatId, {
      ...payload,
      lastMessage: `📁 ${payload.file.name}`,
      lastMessageAt: now,
    });
    return message;
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
  await ensureFirebaseAuth();
  const chatId = buildChatId(payload.senderId, payload.recipientId);
  const now = Date.now();
  const msgRef = doc(collection(db, 'private_messages'));
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
  await setDoc(msgRef, message);
  await upsertChat(chatId, { ...payload, lastMessage: '📍 Konum', lastMessageAt: now });
  return message;
}

export async function sendCallLogMessage(payload: {
  senderId: string;
  recipientId: string;
  callType: 'voice' | 'video';
  callStatus: string;
  senderName?: string;
  recipientName?: string;
}): Promise<void> {
  await ensureFirebaseAuth();
  const chatId = buildChatId(payload.senderId, payload.recipientId);
  const now = Date.now();
  const label =
    payload.callType === 'video' ? `📹 Video zəng — ${payload.callStatus}` : `📞 Səsli zəng — ${payload.callStatus}`;

  const msgRef = doc(collection(db, 'private_messages'));
  await setDoc(msgRef, {
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
  await upsertChat(chatId, {
    senderId: payload.senderId,
    recipientId: payload.recipientId,
    senderName: payload.senderName,
    recipientName: payload.recipientName,
    lastMessage: label,
    lastMessageAt: now,
  });
}

export function listenUserChats(userId: string, callback: (chats: ChatSummary[]) => void): Unsubscribe {
  const q = query(collection(db, 'private_chats'), where('participants', 'array-contains', userId));
  return onSnapshot(q, (snap) => {
    const chats: ChatSummary[] = [];
    snap.forEach((d) => {
      const data = d.data();
      const participants = (data.participants as string[]) || [];
      const otherId = participants.find((p) => p !== userId) || '';
      const meta = (data.participantMeta as Record<string, { name?: string; handle?: string; avatar?: string }>)?.[otherId] || {};
      chats.push({
        chatId: (data.chatId as string) || d.id,
        otherUserId: otherId,
        otherUserName: meta.name || 'İstifadəçi',
        otherUserHandle: meta.handle || '',
        otherUserAvatar: meta.avatar || DEFAULT_AVATAR,
        lastMessage: (data.lastMessage as string) || '',
        lastMessageAt: (data.lastMessageAt as number) || 0,
      });
    });
    chats.sort((a, b) => b.lastMessageAt - a.lastMessageAt);
    callback(chats);
  });
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
    createdAt: (data.createdAt as number) || 0,
  };
}

/** Mətn mesajını düzənlə (WhatsApp — yalnız öz mesajın) */
export async function editMessage(messageId: string, chatId: string, newText: string): Promise<void> {
  await ensureFirebaseAuth();
  const trimmed = newText.trim();
  if (!trimmed) throw new Error('Mesaj boş ola bilməz.');
  await updateDoc(doc(db, 'private_messages', messageId), {
    text: trimmed,
    editedAt: Date.now(),
  });
  await refreshChatLastMessage(chatId);
}

async function refreshChatLastMessage(chatId: string): Promise<void> {
  const q = query(collection(db, 'private_messages'), where('chatId', '==', chatId));
  const snap = await getDocs(q);
  const msgs = snap.docs.map((d) => docToStoredMessage(d));
  msgs.sort((a, b) => b.createdAt - a.createdAt);
  const latest = msgs[0];
  await setDoc(
    doc(db, 'private_chats', chatId),
    {
      lastMessage: latest ? messagePreview(latest) : '',
      lastMessageAt: latest?.createdAt ?? 0,
      updatedAt: Date.now(),
    },
    { merge: true }
  );
}

/** Mesajı sil (WhatsApp — hər iki tərəfdən) */
export async function deleteMessage(messageId: string, chatId: string): Promise<void> {
  await ensureFirebaseAuth();
  await deleteDoc(doc(db, 'private_messages', messageId));
  await refreshChatLastMessage(chatId);
}

/** Söhbəti tam təmizlə */
export async function clearChat(chatId: string): Promise<void> {
  await ensureFirebaseAuth();
  const q = query(collection(db, 'private_messages'), where('chatId', '==', chatId));
  const snap = await getDocs(q);

  const refs = snap.docs.map((d) => d.ref);
  for (let i = 0; i < refs.length; i += 450) {
    const batch = writeBatch(db);
    refs.slice(i, i + 450).forEach((ref) => batch.delete(ref));
    await batch.commit();
  }

  await setDoc(
    doc(db, 'private_chats', chatId),
    {
      lastMessage: '',
      lastMessageAt: 0,
      updatedAt: Date.now(),
    },
    { merge: true }
  );
}

export function listenChatMessages(chatId: string, callback: (msgs: StoredMessage[]) => void): Unsubscribe {
  const q = query(collection(db, 'private_messages'), where('chatId', '==', chatId));
  return onSnapshot(q, (snap) => {
    const msgs: StoredMessage[] = [];
    snap.forEach((d) => {
      msgs.push(docToStoredMessage(d));
    });
    msgs.sort((a, b) => a.createdAt - b.createdAt);
    callback(msgs);
  });
}
