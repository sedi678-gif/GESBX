import {
  collection,
  getDocs,
  getDoc,
  addDoc,
  query,
  where,
  onSnapshot,
  doc,
  setDoc,
  deleteDoc,
  Unsubscribe,
} from 'firebase/firestore';
import { db } from '@/firebase';
import { ensureFirebaseAuth } from './firebaseAuth';
import { AppUserProfile } from './socialTypes';

export async function searchUsers(searchQuery: string, currentUserId?: string): Promise<AppUserProfile[]> {
  const q = searchQuery.trim().toLowerCase();
  if (!q) return [];

  const snap = await getDocs(collection(db, 'users'));
  const results: AppUserProfile[] = [];

  snap.forEach((d) => {
    const data = d.data() as AppUserProfile & { name?: string; surname?: string; handle?: string };
    const id = data.id || d.id;
    if (currentUserId && id === currentUserId) return;
    if (data.frozen || data.banned) return;

    const fullName = [data.name, data.surname].filter(Boolean).join(' ').toLowerCase();
    const handle = (data.handle || '').toLowerCase();

    if (fullName.includes(q) || handle.includes(q) || id.includes(q)) {
      results.push({
        id,
        name: data.name || '',
        surname: data.surname,
        handle: data.handle || '',
        gender: data.gender,
        birthDate: data.birthDate,
        avatar: data.avatar,
        region: data.region,
      });
    }
  });

  return results.slice(0, 30);
}

export async function getUserProfile(userId: string): Promise<AppUserProfile | null> {
  const snap = await getDoc(doc(db, 'users', userId));
  if (!snap.exists()) return null;
  const data = snap.data() as AppUserProfile & {
    name?: string;
    surname?: string;
    handle?: string;
    bio?: string;
    bannerGradient?: string;
    bannerImage?: string;
    vipTier?: 'none' | 'gold' | 'platinum';
    vipExpiresAt?: number;
    equippedCosmetics?: AppUserProfile['equippedCosmetics'];
  };
  return {
    id: userId,
    name: data.name || '',
    surname: data.surname,
    handle: data.handle || '',
    gender: data.gender,
    birthDate: data.birthDate,
    avatar: data.avatar,
    region: data.region,
    bio: data.bio,
    bannerGradient: data.bannerGradient,
    bannerImage: data.bannerImage,
    vipTier: data.vipTier,
    vipExpiresAt: data.vipExpiresAt,
    equippedCosmetics: data.equippedCosmetics,
    frozen: Boolean(data.frozen),
    banned: Boolean(data.banned),
    likesReceived: Math.max(0, Math.floor(Number(data.likesReceived) || 0)),
  };
}

export async function followUser(followerId: string, followingId: string): Promise<void> {
  if (followerId === followingId) return;
  await ensureFirebaseAuth();
  await setDoc(doc(db, 'follows', `${followerId}_${followingId}`), {
    followerId,
    followingId,
    createdAt: Date.now(),
  });
}

export async function unfollowUser(followerId: string, followingId: string): Promise<void> {
  await deleteDoc(doc(db, 'follows', `${followerId}_${followingId}`));
}

export function listenIsFollowing(
  followerId: string,
  followingId: string,
  callback: (following: boolean) => void
): Unsubscribe {
  return onSnapshot(doc(db, 'follows', `${followerId}_${followingId}`), (snap) => {
    callback(snap.exists());
  });
}

export function listenFollowingIds(
  userId: string,
  callback: (ids: string[]) => void
): Unsubscribe {
  const q = query(collection(db, 'follows'), where('followerId', '==', userId));
  return onSnapshot(q, (snap) => {
    const ids: string[] = [];
    snap.forEach((d) => ids.push(d.data().followingId as string));
    callback(ids);
  });
}

export function listenFollowerIds(
  userId: string,
  callback: (ids: string[]) => void
): Unsubscribe {
  const q = query(collection(db, 'follows'), where('followingId', '==', userId));
  return onSnapshot(q, (snap) => {
    const ids: string[] = [];
    snap.forEach((d) => ids.push(d.data().followerId as string));
    callback(ids);
  });
}

export async function isFollowing(followerId: string, followingId: string): Promise<boolean> {
  const snap = await getDoc(doc(db, 'follows', `${followerId}_${followingId}`));
  return snap.exists();
}

export function listenFollowCounts(
  userId: string,
  callback: (followers: number, following: number) => void
): Unsubscribe {
  let followers = 0;
  let following = 0;

  const unsub1 = onSnapshot(query(collection(db, 'follows'), where('followingId', '==', userId)), (snap) => {
    followers = snap.size;
    callback(followers, following);
  });

  const unsub2 = onSnapshot(query(collection(db, 'follows'), where('followerId', '==', userId)), (snap) => {
    following = snap.size;
    callback(followers, following);
  });

  return () => {
    unsub1();
    unsub2();
  };
}

export async function blockUser(blockerId: string, blockedId: string): Promise<void> {
  await ensureFirebaseAuth();
  await setDoc(doc(db, 'blocks', `${blockerId}_${blockedId}`), {
    blockerId,
    blockedId,
    createdAt: Date.now(),
  });
}

export async function unblockUser(blockerId: string, blockedId: string): Promise<void> {
  await setDoc(doc(db, 'blocks', `${blockerId}_${blockedId}`), {
    blockerId,
    blockedId,
    removed: true,
    createdAt: Date.now(),
  });
}

export function listenBlockedUsers(
  userId: string,
  callback: (blockedIds: string[]) => void
): Unsubscribe {
  const q = query(collection(db, 'blocks'), where('blockerId', '==', userId));
  return onSnapshot(q, (snap) => {
    const ids: string[] = [];
    snap.forEach((d) => {
      const data = d.data();
      if (!data.removed) ids.push(data.blockedId as string);
    });
    callback(ids);
  });
}

export async function reportContent(payload: {
  reporterId: string;
  targetUserId: string;
  targetPostId?: string;
  reason: string;
  type: 'user' | 'post' | 'message';
}): Promise<void> {
  if (!payload.reporterId?.trim() || !payload.targetUserId?.trim() || !payload.reason?.trim()) {
    throw new Error('Şikayət məlumatları natamamdır.');
  }

  void ensureFirebaseAuth();

  await addDoc(collection(db, 'reports'), {
    reporterId: payload.reporterId.trim(),
    targetUserId: payload.targetUserId.trim(),
    targetPostId: payload.targetPostId?.trim() || null,
    reason: payload.reason.trim(),
    type: payload.type,
    createdAt: Date.now(),
    status: 'pending',
  });
}

export function isBlocked(blockedIds: string[], userId: string): boolean {
  return blockedIds.includes(userId);
}

/** @deprecated use sendPrivateMessage from messageService */
export async function mirrorPrivateMessage(msg: {
  senderId: string;
  recipientId: string;
  text?: string;
}): Promise<void> {
  const { sendPrivateMessage } = await import('./messageService');
  await sendPrivateMessage({
    senderId: msg.senderId,
    recipientId: msg.recipientId,
    text: msg.text || '',
  });
}
