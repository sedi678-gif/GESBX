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
        avatar: data.avatar || (data as Record<string, unknown>).photoURL as string || (data as Record<string, unknown>).photoUrl as string || (data as Record<string, unknown>).userAvatar as string || (data as Record<string, unknown>).avatarUrl as string || (data as Record<string, unknown>).profileImage as string || (data as Record<string, unknown>).profilePhoto as string,
        region: data.region,
      });
    }
  });

  return results.slice(0, 30);
}

function mapPublicUserProfile(userId: string, data: Record<string, unknown>): AppUserProfile {
  return {
    id: userId,
    name: String(data.name || ''),
    surname: data.surname ? String(data.surname) : undefined,
    handle: String(data.handle || ''),
    gender: data.gender ? String(data.gender) : undefined,
    avatar: data.avatar ? String(data.avatar) : undefined,
    region: data.region ? String(data.region) : undefined,
    bio: data.bio ? String(data.bio) : undefined,
    bannerGradient: data.bannerGradient ? String(data.bannerGradient) : undefined,
    bannerImage: data.bannerImage ? String(data.bannerImage) : undefined,
    vipTier: data.vipTier === 'gold' || data.vipTier === 'platinum' ? data.vipTier : 'none',
    vipExpiresAt: Number(data.vipExpiresAt) || undefined,
    equippedCosmetics: data.equippedCosmetics as AppUserProfile['equippedCosmetics'],
    frozen: Boolean(data.frozen),
    banned: Boolean(data.banned),
    likesReceived: Math.max(0, Math.floor(Number(data.likesReceived) || 0)),
    viewsReceived: Math.max(0, Math.floor(Number(data.viewsReceived) || 0)),
  };
}

export async function getUserProfile(userId: string): Promise<AppUserProfile | null> {
  if (!userId) return null;
  let localProfile: AppUserProfile | null = null;
  try {
    const snap = await getDoc(doc(db, 'users', userId));
    if (snap.exists()) {
      localProfile = mapPublicUserProfile(userId, snap.data() as Record<string, unknown>);
      // An existing users document with an empty avatar must not prevent the
      // server from checking the legacy players document.
      if (localProfile.avatar) return localProfile;
    }
  } catch (error) {
    // Older user documents may contain private fields that intentionally block
    // direct public Firestore reads. Resolve the same public profile server-side.
    console.warn('[socialService] direct public profile read denied; using safe profile endpoint:', error);
  }

  const firebaseUser = await ensureFirebaseAuth();
  if (!firebaseUser) return localProfile;
  const token = await firebaseUser.getIdToken();
  const response = await fetch(`/api/paypal?handler=social-likes&profileId=${encodeURIComponent(userId)}`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  if (response.status === 404) return null;
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.profile || typeof payload.profile !== 'object') {
    throw new Error(String(payload.error || 'İstifadəçi profili yüklənmədi.'));
  }
  return mapPublicUserProfile(userId, payload.profile as Record<string, unknown>);
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

  const authUser = await ensureFirebaseAuth();
  if (!authUser) throw new Error('Şikayət göndərmək üçün hesaba daxil olun.');

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
