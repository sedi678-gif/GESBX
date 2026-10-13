import {
  collection,
  addDoc,
  onSnapshot,
  query,
  where,
  orderBy,
  doc,
  updateDoc,
  deleteDoc,
  getDoc,
  setDoc,
  increment,
  runTransaction,
  Unsubscribe,
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '@/firebase';
import { ensureFirebaseAuth, blobToDataUrl, compressImageSafe, withTimeout } from './firebaseAuth';
import { SocialPost, UserFeedItem, AppUserProfile, PostComment } from './socialTypes';
import { isDiscoverBoostActive, listenDiscoverBoostMap } from '@/app/lib/discoverBoost';

const POST_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_VIDEO_BYTES = 25 * 1024 * 1024;
const MAX_INLINE_DATA_URL_CHARS = 850_000;
const POST_IMAGE_MAX_WIDTH = 900;
const POST_IMAGE_QUALITY = 0.68;
const UPLOAD_TIMEOUT_MS = 45_000;
const CREATE_POST_TIMEOUT_MS = 75_000;

function calcAge(birthDate?: string): number | undefined {
  if (!birthDate) return undefined;
  const born = new Date(birthDate);
  if (Number.isNaN(born.getTime())) return undefined;
  const now = new Date();
  let age = now.getFullYear() - born.getFullYear();
  const m = now.getMonth() - born.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < born.getDate())) age--;
  return age;
}

function isExpired(raw: Record<string, unknown>, now = Date.now()): boolean {
  const expiresAt = Number(raw.expiresAt);
  return !Number.isFinite(expiresAt) || expiresAt <= now;
}

function scheduleExpiredPostDelete(postId: string) {
  void deleteDoc(doc(db, 'posts', postId)).catch(() => {});
}

function mapPostDoc(id: string, raw: Record<string, unknown>): SocialPost | null {
  if (isExpired(raw)) {
    scheduleExpiredPostDelete(id);
    return null;
  }

  const createdAt = Number(raw.createdAt);
  if (!Number.isFinite(createdAt) || !raw.mediaUrl || !raw.userId) return null;

  return {
    id,
    userId: String(raw.userId),
    userName: String(raw.userName || 'İstifadəçi'),
    userHandle: String(raw.userHandle || ''),
    userAvatar: String(raw.userAvatar || ''),
    userGender: raw.userGender ? String(raw.userGender) : undefined,
    userRegion: raw.userRegion ? String(raw.userRegion) : undefined,
    userAge: typeof raw.userAge === 'number' ? raw.userAge : undefined,
    title: String(raw.title || ''),
    mediaUrl: String(raw.mediaUrl),
    mediaType: raw.mediaType === 'video' ? 'video' : 'image',
    likes: Number(raw.likes) || 0,
    commentsCount: Number(raw.commentsCount) || 0,
    giftCount: Number(raw.giftCount) || 0,
    createdAt,
    expiresAt: Number(raw.expiresAt),
  };
}

/** Fayl seçiləndə arxa planda çağır — paylaşım daha tez başlayır */
export async function preparePostMediaFile(file: File): Promise<File> {
  if (!file.type.startsWith('image/')) return file;
  const blob = await compressImageSafe(file, POST_IMAGE_MAX_WIDTH, POST_IMAGE_QUALITY);
  const baseName = file.name.replace(/\.[^.]+$/, '') || 'photo';
  return new File([blob], `${baseName}.jpg`, {
    type: 'image/jpeg',
    lastModified: Date.now(),
  });
}

async function uploadBlobToStorage(blob: Blob, userId: string, contentType: string): Promise<string> {
  const ext = contentType.startsWith('video/') ? 'mp4' : 'jpg';
  const path = `posts/${userId}/${Date.now()}.${ext}`;
  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, blob, { contentType: contentType || 'application/octet-stream' });
  return getDownloadURL(storageRef);
}

async function uploadMediaInline(file: File | Blob): Promise<string> {
  const compressed =
    file instanceof File && file.type.startsWith('image/')
      ? await compressImageSafe(file, 720, 0.62)
      : file;
  const dataUrl = await blobToDataUrl(compressed);
  if (dataUrl.length > MAX_INLINE_DATA_URL_CHARS) {
    throw new Error('Şəkil çox böyükdür. Daha kiçik fayl seçin.');
  }
  return dataUrl;
}

async function uploadMedia(file: File, userId: string): Promise<string> {
  if (file.type.startsWith('video/') && file.size > MAX_VIDEO_BYTES) {
    throw new Error('Video çox böyükdür (maks. 25 MB).');
  }
  if (file.type.startsWith('image/') && file.size > MAX_IMAGE_BYTES) {
    throw new Error('Şəkil çox böyükdür (maks. 8 MB).');
  }

  const authPromise = ensureFirebaseAuth();

  if (file.type.startsWith('image/')) {
    try {
      await authPromise;
      return await withTimeout(
        uploadBlobToStorage(file, userId, file.type || 'image/jpeg'),
        UPLOAD_TIMEOUT_MS,
        'Yükləmə vaxtı bitdi.'
      );
    } catch (err) {
      console.warn('Storage uğursuz, inline fallback:', err);
      await authPromise;
      return uploadMediaInline(file);
    }
  }

  await authPromise;
  return withTimeout(
    uploadBlobToStorage(file, userId, file.type || 'video/mp4'),
    UPLOAD_TIMEOUT_MS,
    'Video yükləmə vaxtı bitdi. İnternet bağlantısını yoxlayın.'
  );
}

async function createPostInternal(
  user: AppUserProfile,
  title: string,
  file: File,
  mediaType: 'video' | 'image'
): Promise<string> {
  if (!user.id?.trim()) {
    throw new Error('Profil tapılmadı. Əvvəlcə qeydiyyatdan keçin.');
  }

  const uploadFile =
    mediaType === 'image' && !file.name.toLowerCase().endsWith('.jpg')
      ? await preparePostMediaFile(file)
      : file;

  const mediaUrl = await uploadMedia(uploadFile, user.id);
  const now = Date.now();
  const fullName = [user.name, user.surname].filter(Boolean).join(' ').trim();

  const docRef = await addDoc(collection(db, 'posts'), {
    userId: user.id,
    userName: fullName || user.name || 'İstifadəçi',
    userHandle: user.handle || '',
    userAvatar: user.avatar || '',
    userGender: user.gender || '',
    userRegion: user.region || '',
    userAge: calcAge(user.birthDate),
    title: title.trim(),
    mediaUrl,
    mediaType,
    likes: 0,
    commentsCount: 0,
    giftCount: 0,
    createdAt: now,
    expiresAt: now + POST_TTL_MS,
  });

  return docRef.id;
}

export async function createPost(
  user: AppUserProfile,
  title: string,
  file: File,
  mediaType: 'video' | 'image'
): Promise<string> {
  return withTimeout(
    createPostInternal(user, title, file, mediaType),
    CREATE_POST_TIMEOUT_MS,
    'Paylaşım vaxtı bitdi. İnternet bağlantısını yoxlayın və yenidən cəhd edin.'
  );
}

export function postsToFeed(posts: SocialPost[]): UserFeedItem[] {
  const byUser = new Map<string, UserFeedItem>();

  for (const post of posts) {
    const existing = byUser.get(post.userId);
    const media = {
      id: post.id,
      mediaUrl: post.mediaUrl,
      mediaType: post.mediaType,
      title: post.title,
      createdAt: post.createdAt,
      likes: post.likes,
      commentsCount: post.commentsCount,
    };

    if (existing) {
      existing.mediaList.push(media);
      existing.likes += post.likes;
      existing.commentsCount += post.commentsCount;
      existing.giftCount += post.giftCount;
    } else {
      byUser.set(post.userId, {
        userId: post.userId,
        userName: post.userName,
        userHandle: post.userHandle,
        userAvatar: post.userAvatar,
        userAge: post.userAge,
        userGender: post.userGender,
        userRegion: post.userRegion,
        mediaList: [media],
        likes: post.likes,
        commentsCount: post.commentsCount,
        giftCount: post.giftCount,
      });
    }
  }

  return Array.from(byUser.values())
    .map((item) => ({
      ...item,
      mediaList: item.mediaList.sort((a, b) => b.createdAt - a.createdAt),
    }))
    .sort((a, b) => (b.mediaList[0]?.createdAt ?? 0) - (a.mediaList[0]?.createdAt ?? 0));
}

export function rankExploreFeed(
  items: UserFeedItem[],
  boosts: Map<string, number>,
  now = Date.now()
): UserFeedItem[] {
  return items
    .map((item) => {
      const until = boosts.get(item.userId) ?? 0;
      return {
        ...item,
        boostedUntil: isDiscoverBoostActive(until, now) ? until : 0,
      };
    })
    .sort((a, b) => {
      const aBoost = a.boostedUntil ? 1 : 0;
      const bBoost = b.boostedUntil ? 1 : 0;
      if (aBoost !== bBoost) return bBoost - aBoost;
      return (b.mediaList[0]?.createdAt ?? 0) - (a.mediaList[0]?.createdAt ?? 0);
    });
}

export function listenExploreFeed(
  callback: (feed: UserFeedItem[]) => void,
  blockedUserIds: string[] = [],
  onError?: (message: string) => void
): Unsubscribe {
  const q = query(collection(db, 'posts'), orderBy('createdAt', 'desc'));
  let posts: SocialPost[] = [];
  let boosts = new Map<string, number>();
  let expireTimer: ReturnType<typeof setTimeout> | null = null;

  const emit = () => {
    const now = Date.now();
    callback(rankExploreFeed(postsToFeed(posts), boosts, now));
    if (expireTimer) {
      clearTimeout(expireTimer);
      expireTimer = null;
    }
    const nextExpiry = [...boosts.values()].filter((until) => until > now).sort((a, b) => a - b)[0];
    if (nextExpiry) {
      expireTimer = setTimeout(emit, Math.max(50, nextExpiry - now + 40));
    }
  };

  const unsubPosts = onSnapshot(
    q,
    (snap) => {
      const next: SocialPost[] = [];
      snap.forEach((d) => {
        const raw = d.data() as Record<string, unknown>;
        const mapped = mapPostDoc(d.id, raw);
        if (!mapped) return;
        if (blockedUserIds.includes(mapped.userId)) return;
        next.push(mapped);
      });
      posts = next;
      emit();
    },
    (err) => {
      console.error('Kəşf et feed xətası:', err);
      onError?.('Paylaşımlar yüklənmədi. İnternet bağlantısını yoxlayın.');
      posts = [];
      callback([]);
    }
  );

  const unsubBoosts = listenDiscoverBoostMap((next) => {
    boosts = next;
    emit();
  });

  return () => {
    if (expireTimer) clearTimeout(expireTimer);
    unsubPosts();
    unsubBoosts();
  };
}

export function listenUserPosts(
  userId: string,
  callback: (posts: SocialPost[]) => void,
  onError?: (message: string) => void
): Unsubscribe {
  // orderBy olmadan — indeks tələb etmir, client-side sıralama
  const q = query(collection(db, 'posts'), where('userId', '==', userId));

  return onSnapshot(
    q,
    (snap) => {
      const posts: SocialPost[] = [];
      snap.forEach((d) => {
        const mapped = mapPostDoc(d.id, d.data() as Record<string, unknown>);
        if (mapped) posts.push(mapped);
      });
      callback(posts.sort((a, b) => b.createdAt - a.createdAt));
    },
    (err) => {
      console.error('Profil paylaşımları xətası:', err);
      onError?.('Paylaşımlar yüklənmədi.');
      callback([]);
    }
  );
}

export function likesReceivedStorageKey(userId: string): string {
  return `profile_likes_received_${userId}`;
}

export function readCachedLikesReceived(userId: string): number {
  if (typeof window === 'undefined' || !userId) return 0;
  try {
    const n = Number(localStorage.getItem(likesReceivedStorageKey(userId)));
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  } catch {
    return 0;
  }
}

export function writeCachedLikesReceived(userId: string, likes: number): void {
  if (typeof window === 'undefined' || !userId) return;
  const n = Math.max(0, Math.floor(Number(likes) || 0));
  try {
    localStorage.setItem(likesReceivedStorageKey(userId), String(n));
  } catch {
    /* ignore */
  }
}

export function listenUserLikesReceived(
  userId: string,
  callback: (likes: number) => void
): Unsubscribe {
  if (!userId) {
    callback(0);
    return () => {};
  }

  return onSnapshot(
    doc(db, 'users', userId),
    (snap) => {
      const likes = Number(snap.data()?.likesReceived) || 0;
      callback(likes > 0 ? Math.floor(likes) : 0);
    },
    () => callback(readCachedLikesReceived(userId))
  );
}

/** Mövcud post bəyənmələrini profil cəminə yazır (azaltmır). */
export async function ensureMinLikesReceived(userId: string, min: number): Promise<void> {
  const floor = Math.floor(Number(min) || 0);
  if (!userId || floor <= 0) return;
  await ensureFirebaseAuth();
  await runTransaction(db, async (tx) => {
    const ref = doc(db, 'users', userId);
    const snap = await tx.get(ref);
    if (!snap.exists()) return;
    const current = Number(snap.data()?.likesReceived) || 0;
    if (floor > current) {
      tx.update(ref, { likesReceived: floor });
    }
  });
}

export async function toggleLikePost(
  postId: string,
  userId: string
): Promise<{ liked: boolean; likes: number; alreadyLiked: boolean }> {
  if (!postId || !userId) {
    throw new Error('Bəyənmək üçün profil tələb olunur.');
  }

  await ensureFirebaseAuth();

  return runTransaction(db, async (tx) => {
    const likeRef = doc(db, 'post_likes', `${postId}_${userId}`);
    const postRef = doc(db, 'posts', postId);
    const likeSnap = await tx.get(likeRef);
    const postSnap = await tx.get(postRef);
    const likes = Number(postSnap.data()?.likes) || 0;

    if (likeSnap.exists()) {
      return { liked: true, likes, alreadyLiked: true };
    }
    if (!postSnap.exists()) {
      throw new Error('Paylaşım tapılmadı.');
    }

    const authorId = String(postSnap.data()?.userId || '');
    const authorRef = authorId ? doc(db, 'users', authorId) : null;
    const authorSnap = authorRef ? await tx.get(authorRef) : null;

    tx.set(likeRef, { postId, userId, createdAt: Date.now() });
    tx.update(postRef, { likes: increment(1) });
    if (authorRef && authorSnap?.exists()) {
      tx.update(authorRef, { likesReceived: increment(1) });
    }

    return { liked: true, likes: likes + 1, alreadyLiked: false };
  });
}

export function listenUserLikedPostIds(
  userId: string,
  callback: (postIds: Set<string>) => void
): Unsubscribe {
  if (!userId) {
    callback(new Set());
    return () => {};
  }

  const q = query(collection(db, 'post_likes'), where('userId', '==', userId));
  return onSnapshot(
    q,
    (snap) => {
      const ids = new Set<string>();
      snap.forEach((d) => {
        const postId = d.data().postId as string;
        if (postId) ids.add(postId);
      });
      callback(ids);
    },
    () => callback(new Set())
  );
}

/** @deprecated use toggleLikePost */
export async function likePost(postId: string, userId?: string): Promise<void> {
  if (!userId) return;
  await toggleLikePost(postId, userId);
}

export function getPostRemainingHours(expiresAt: number): number {
  return Math.max(0, Math.ceil((expiresAt - Date.now()) / (60 * 60 * 1000)));
}

function mapCommentDoc(id: string, raw: Record<string, unknown>): PostComment | null {
  const createdAt = Number(raw.createdAt);
  if (!raw.postId || !raw.userId || !raw.text || !Number.isFinite(createdAt)) return null;
  return {
    id,
    postId: String(raw.postId),
    userId: String(raw.userId),
    userName: String(raw.userName || 'İstifadəçi'),
    userAvatar: raw.userAvatar ? String(raw.userAvatar) : undefined,
    text: String(raw.text),
    createdAt,
  };
}

export function listenPostComments(
  postId: string,
  callback: (comments: PostComment[]) => void,
  onError?: (message: string) => void
): Unsubscribe {
  if (!postId) {
    callback([]);
    return () => {};
  }

  const q = query(collection(db, 'post_comments'), where('postId', '==', postId));

  return onSnapshot(
    q,
    (snap) => {
      const comments: PostComment[] = [];
      snap.forEach((d) => {
        const mapped = mapCommentDoc(d.id, d.data() as Record<string, unknown>);
        if (mapped) comments.push(mapped);
      });
      comments.sort((a, b) => a.createdAt - b.createdAt);
      callback(comments);
    },
    (err) => {
      console.error('Post şərhləri xətası:', err);
      onError?.('Şərhlər yüklənmədi.');
      callback([]);
    }
  );
}

export async function addPostComment(
  postId: string,
  user: { id: string; name: string; avatar?: string },
  text: string
): Promise<void> {
  const trimmed = text.trim();
  if (!postId || !user.id || !trimmed) {
    throw new Error('Şərh yazmaq üçün məlumat çatışmır.');
  }

  await ensureFirebaseAuth();

  const now = Date.now();
  await addDoc(collection(db, 'post_comments'), {
    postId,
    userId: user.id,
    userName: user.name.trim() || 'İstifadəçi',
    userAvatar: user.avatar || '',
    text: trimmed,
    createdAt: now,
  });

  const postRef = doc(db, 'posts', postId);
  const postSnap = await getDoc(postRef);
  if (postSnap.exists()) {
    await updateDoc(postRef, { commentsCount: increment(1) });
  }
}
