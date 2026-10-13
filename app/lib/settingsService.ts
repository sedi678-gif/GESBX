import { doc, onSnapshot, setDoc, Unsubscribe, addDoc, collection } from 'firebase/firestore';
import { db } from '@/firebase';
import { AppLanguage, DEFAULT_SETTINGS, UserSettings } from './settingsTypes';

const CACHE_KEY = 'yolustu_user_settings_v1';

export function getCachedSettings(userId: string): UserSettings | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(`${CACHE_KEY}_${userId}`);
    return raw ? (JSON.parse(raw) as UserSettings) : null;
  } catch {
    return null;
  }
}

function cacheSettings(settings: UserSettings) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(`${CACHE_KEY}_${settings.userId}`, JSON.stringify(settings));
}

export function listenUserSettings(
  userId: string,
  callback: (settings: UserSettings) => void
): Unsubscribe {
  const cached = getCachedSettings(userId);
  if (cached) callback(cached);

  const ref = doc(db, 'user_settings', userId);
  return onSnapshot(ref, (snap) => {
    if (snap.exists()) {
      const data = { ...DEFAULT_SETTINGS(userId), ...(snap.data() as UserSettings) };
      cacheSettings(data);
      callback(data);
    } else {
      const defaults = DEFAULT_SETTINGS(userId);
      cacheSettings(defaults);
      callback(defaults);
    }
  });
}

export async function saveUserSettings(
  userId: string,
  patch: Partial<Omit<UserSettings, 'userId'>>
): Promise<void> {
  const ref = doc(db, 'user_settings', userId);
  const next = { ...patch, userId, updatedAt: Date.now() };
  await setDoc(ref, next, { merge: true });
  const cached = getCachedSettings(userId) || DEFAULT_SETTINGS(userId);
  cacheSettings({ ...cached, ...next } as UserSettings);
}

export async function setUserLanguage(userId: string, language: AppLanguage): Promise<void> {
  await saveUserSettings(userId, { language });
}

export async function submitFeedback(payload: {
  userId: string;
  text: string;
  category?: string;
}): Promise<void> {
  await addDoc(collection(db, 'feedback'), {
    ...payload,
    createdAt: Date.now(),
  });
}

export async function submitSupportRequest(payload: {
  userId: string;
  subject: string;
  message: string;
}): Promise<void> {
  await addDoc(collection(db, 'support_requests'), {
    ...payload,
    status: 'open',
    createdAt: Date.now(),
  });
}
