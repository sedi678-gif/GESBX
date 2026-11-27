import { collection, doc, getDoc, getDocs, limit, query, where } from 'firebase/firestore';
import { db } from '@/firebase';
import { ensureFirebaseAuth } from '@/app/lib/firebaseAuth';
import type { AppUserProfile } from '@/app/lib/socialTypes';

export async function getSuggestedProfiles(userId: string, max = 12): Promise<AppUserProfile[]> {
  if (!userId || userId === 'guest' || userId === 'anonim_user_id') return [];
  await ensureFirebaseAuth();
  const [followingSnap, followerSnap] = await Promise.all([
    getDocs(query(collection(db, 'follows'), where('followerId', '==', userId), limit(200))),
    getDocs(query(collection(db, 'follows'), where('followingId', '==', userId), limit(100))),
  ]);
  const following = new Set(followingSnap.docs.map(d => String(d.data().followingId || '')).filter(Boolean));
  const excluded = new Set([...following, userId]);
  const mutualCandidates = new Map<string, number>();
  const followedIds = [...following].slice(0, 10);
  if (followedIds.length) {
    const mutualSnap = await getDocs(query(collection(db, 'follows'), where('followerId', 'in', followedIds)));
    mutualSnap.forEach(d => {
      const id = String(d.data().followingId || '');
      if (id && !excluded.has(id)) mutualCandidates.set(id, (mutualCandidates.get(id) || 0) + 1);
    });
  }
  followerSnap.forEach(d => {
    const id = String(d.data().followerId || '');
    if (id && !excluded.has(id)) mutualCandidates.set(id, (mutualCandidates.get(id) || 0) + 1);
  });
  const ranked = [...mutualCandidates.entries()].sort((a,b) => b[1]-a[1]).slice(0, max * 2);
  const profiles = await Promise.all(ranked.map(async ([id]) => {
    const snap = await getDoc(doc(db, 'users', id));
    if (!snap.exists()) return null;
    const d = snap.data();
    if (d.frozen || d.banned) return null;
    return { id, name: String(d.name || ''), surname: d.surname ? String(d.surname) : undefined,
      handle: String(d.handle || ''), avatar: d.avatar ? String(d.avatar) : undefined,
      region: d.region ? String(d.region) : undefined } as AppUserProfile;
  }));
  return profiles.filter((p): p is AppUserProfile => Boolean(p)).slice(0, max);
}

export async function getFollowingProfiles(userId: string, max = 100): Promise<AppUserProfile[]> {
  if (!userId || userId === 'guest' || userId === 'anonim_user_id') return [];
  await ensureFirebaseAuth();
  const links = await getDocs(query(collection(db, 'follows'), where('followerId', '==', userId), limit(max)));
  const ids = [...new Set(links.docs.map(d => String(d.data().followingId || '')).filter(id => id && id !== userId))];
  const rows = await Promise.all(ids.map(async id => {
    const snap = await getDoc(doc(db, 'users', id));
    if (!snap.exists()) return null;
    const d = snap.data();
    if (d.frozen || d.banned) return null;
    return { id, name: String(d.name || ''), surname: d.surname ? String(d.surname) : undefined,
      handle: String(d.handle || ''), avatar: d.avatar ? String(d.avatar) : undefined } as AppUserProfile;
  }));
  return rows.filter((p): p is AppUserProfile => Boolean(p));
}
