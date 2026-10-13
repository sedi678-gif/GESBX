import { doc, onSnapshot, setDoc, Unsubscribe } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '@/firebase';
import {
  ensureFirebaseAuth,
  blobToDataUrl,
  compressImageSafe,
  withTimeout,
} from './firebaseAuth';

const AVATAR_MAX_WIDTH = 320;
const BANNER_MAX_WIDTH = 880;
const AVATAR_QUALITY = 0.68;
const BANNER_QUALITY = 0.58;
const MAX_INLINE_CHARS = 850_000;
const STORAGE_TRY_MS = 10_000;

export interface ProfileMediaSnapshot {
  avatar?: string;
  bannerImage?: string;
  bannerGradient?: string;
  avatarUpdatedAt?: number;
  bannerUpdatedAt?: number;
}

export async function prepareProfileAvatarFile(file: File): Promise<File> {
  const blob = await compressImageSafe(file, AVATAR_MAX_WIDTH, AVATAR_QUALITY);
  return new File([blob], 'avatar.jpg', { type: 'image/jpeg', lastModified: Date.now() });
}

export async function prepareProfileBannerFile(file: File): Promise<File> {
  const blob = await compressImageSafe(file, BANNER_MAX_WIDTH, BANNER_QUALITY);
  return new File([blob], 'banner.jpg', { type: 'image/jpeg', lastModified: Date.now() });
}

async function buildInlineUrl(file: File, kind: 'avatar' | 'banner'): Promise<string> {
  const tightMax = kind === 'avatar' ? 240 : 640;
  const tightQuality = kind === 'avatar' ? 0.58 : 0.5;

  let payload: Blob = file;
  if (file.size > 180_000) {
    payload = await compressImageSafe(file, tightMax, tightQuality);
  }

  let dataUrl = await blobToDataUrl(payload);
  if (dataUrl.length <= MAX_INLINE_CHARS) return dataUrl;

  const tiny = await compressImageSafe(file, kind === 'avatar' ? 180 : 520, 0.45);
  dataUrl = await blobToDataUrl(tiny);
  if (dataUrl.length > MAX_INLINE_CHARS) {
    throw new Error('Şəkil çox böyükdür. Daha kiçik fayl seçin.');
  }
  return dataUrl;
}

async function tryStorageUrl(file: File, userId: string, kind: string): Promise<string | null> {
  try {
    await ensureFirebaseAuth();
    const path = `profiles/${userId}/${kind}_${Date.now()}.jpg`;
    const storageRef = ref(storage, path);
    await withTimeout(
      uploadBytes(storageRef, file, { contentType: 'image/jpeg' }),
      STORAGE_TRY_MS,
      'storage skip'
    );
    return await getDownloadURL(storageRef);
  } catch {
    return null;
  }
}

function scheduleStorageUpgrade(
  file: File,
  userId: string,
  kind: 'avatar' | 'banner',
  patchPlayer: boolean
) {
  void tryStorageUrl(file, userId, kind).then((remote) => {
    if (!remote || remote.startsWith('data:')) return;
    const now = Date.now();
    const userPatch =
      kind === 'avatar'
        ? { avatar: remote, avatarUpdatedAt: now, updatedAt: now }
        : { bannerImage: remote, bannerUpdatedAt: now, updatedAt: now };
    void setDoc(doc(db, 'users', userId), userPatch, { merge: true });
    if (patchPlayer && kind === 'avatar') {
      void setDoc(doc(db, 'players', userId), { avatar: remote, updatedAt: now }, { merge: true });
    }
  });
}

export async function updateProfileAvatar(userId: string, file: File): Promise<string> {
  if (!userId?.trim()) {
    throw new Error('Profil tapılmadı. Əvvəlcə qeydiyyatdan keçin.');
  }

  await ensureFirebaseAuth();

  const prepared =
    file.name === 'avatar.jpg' && file.type === 'image/jpeg'
      ? file
      : await prepareProfileAvatarFile(file);

  const url = await buildInlineUrl(prepared, 'avatar');
  const now = Date.now();

  await Promise.all([
    setDoc(
      doc(db, 'users', userId),
      { id: userId, avatar: url, avatarUpdatedAt: now, updatedAt: now },
      { merge: true }
    ),
    setDoc(doc(db, 'players', userId), { avatar: url, updatedAt: now }, { merge: true }),
  ]);

  scheduleStorageUpgrade(prepared, userId, 'avatar', true);
  return url;
}

export async function updateProfileBanner(userId: string, file: File): Promise<string> {
  if (!userId?.trim()) {
    throw new Error('Profil tapılmadı. Əvvəlcə qeydiyyatdan keçin.');
  }

  await ensureFirebaseAuth();

  const prepared =
    file.name === 'banner.jpg' && file.type === 'image/jpeg'
      ? file
      : await prepareProfileBannerFile(file);

  const url = await buildInlineUrl(prepared, 'banner');
  const now = Date.now();

  await setDoc(
    doc(db, 'users', userId),
    { id: userId, bannerImage: url, bannerUpdatedAt: now, updatedAt: now },
    { merge: true }
  );

  scheduleStorageUpgrade(prepared, userId, 'banner', false);
  return url;
}

export function listenUserProfileMedia(
  userId: string,
  callback: (data: ProfileMediaSnapshot) => void,
  options?: { paused?: () => boolean }
): Unsubscribe {
  return onSnapshot(doc(db, 'users', userId), (snap) => {
    if (!snap.exists()) return;
    if (options?.paused?.()) return;
    const data = snap.data() as Record<string, unknown>;
    callback({
      avatar: data.avatar as string | undefined,
      bannerImage: data.bannerImage as string | undefined,
      bannerGradient: data.bannerGradient as string | undefined,
      avatarUpdatedAt: data.avatarUpdatedAt as number | undefined,
      bannerUpdatedAt: data.bannerUpdatedAt as number | undefined,
    });
  });
}
