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
  // Əvvəlcə qarşılıqlı əlaqələrə görə sıralanmış profillər. Əlaqə qrafiki boşdursa
  // tövsiyə səhifəsi boş qalmasın deyə ümumi istifadəçi kolleksiyasından ehtiyat namizədlər götür.
  const ranked = [...mutualCandidates.entries()].sort((a,b) => b[1]-a[1]).map(([id]) => id);
  const candidateIds = [...ranked];
  if (candidateIds.length < max) {
    const publicUsers = await getDocs(query(collection(db, 'users'), limit(Math.max(60, max * 8))));
    publicUsers.forEach((snap) => {
      const id = snap.id;
      const data = snap.data();
      if (!excluded.has(id) && !data.frozen && !data.banned && !candidateIds.includes(id)) candidateIds.push(id);
    });
  }
  const profiles = await Promise.all(candidateIds.slice(0, max * 2).map(async (id) => {
    const snap = await getDoc(doc(db, 'users', id));
    if (!snap.exists()) return null;
    const d = snap.data();
    if (d.frozen || d.banned || excluded.has(id)) return null;
    return { id, name: String(d.name || ''), surname: d.surname ? String(d.surname) : undefined,
      handle: String(d.handle || ''), avatar: String(d.avatar || d.photoURL || d.photoUrl || d.userAvatar || d.avatarUrl || d.profileImage || d.profilePhoto || '') || undefined,
      region: d.region ? String(d.region) : undefined } as AppUserProfile;
  }));
  return profiles.filter((profile): profile is AppUserProfile => Boolean(profile)).slice(0, max);
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
      handle: String(d.handle || ''), avatar: String(d.avatar || d.photoURL || d.photoUrl || d.userAvatar || d.avatarUrl || d.profileImage || d.profilePhoto || '') || undefined } as AppUserProfile;
  }));
  return rows.filter((p): p is AppUserProfile => Boolean(p));
}


export async function getFollowerProfiles(userId: string, max = 100): Promise<AppUserProfile[]> {
  if (!userId || userId === 'guest' || userId === 'anonim_user_id') return [];
  await ensureFirebaseAuth();
  // Followers are users whose followingId points to the signed-in user.
  const links = await getDocs(query(
    collection(db, 'follows'),
    where('followingId', '==', userId),
    limit(max)
  ));
  const ids = [...new Set(links.docs
    .map(d => String(d.data().followerId || ''))
    .filter(id => id && id !== userId))];
  const rows = await Promise.all(ids.map(async id => {
    const snap = await getDoc(doc(db, 'users', id));
    if (!snap.exists()) return null;
    const d = snap.data();
    if (d.frozen || d.banned) return null;
    return {
      id,
      name: String(d.name || ''),
      surname: d.surname ? String(d.surname) : undefined,
      handle: String(d.handle || ''),
      avatar: d.avatar ? String(d.avatar) : undefined,
    } as AppUserProfile;
  }));
  return rows.filter((profile): profile is AppUserProfile => Boolean(profile));
}
