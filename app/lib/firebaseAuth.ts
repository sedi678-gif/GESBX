import { signInAnonymously, connectAuthEmulator, User } from 'firebase/auth';
import { connectFirestoreEmulator } from 'firebase/firestore';
import { connectStorageEmulator } from 'firebase/storage';
import { auth, db, storage } from '@/firebase';

let emulatorsConnected = false;

function connectFirebaseEmulators() {
  if (emulatorsConnected || typeof window === 'undefined') return;
  if (process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR !== '1') return;

  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
  connectStorageEmulator(storage, '127.0.0.1', 9199);
  emulatorsConnected = true;
}

export function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

let authReady: Promise<User | null> | null = null;
const AUTH_TIMEOUT_MS = 12_000;

/** Anonim Firebase auth — vaxt bitərsə null qaytarır, prosesi bloklamır. */
export function ensureFirebaseAuth(): Promise<User | null> {
  connectFirebaseEmulators();

  if (auth.currentUser) return Promise.resolve(auth.currentUser);

  if (!authReady) {
    authReady = withTimeout(
      signInAnonymously(auth).then((cred) => cred.user),
      AUTH_TIMEOUT_MS,
/** Auth vaxtı bitdikdə (yalnız server log) */
      'Auth vaxtı bitdi.'
    ).catch((err) => {
      console.warn('Anon auth:', err);
      authReady = null;
      return null;
    });
  }

  return authReady;
}

/** Auth tələb edir; uğursuz olsa aydın xəta atır. */
export async function requireFirebaseAuth(): Promise<User> {
  const user = await ensureFirebaseAuth();
  if (!user) {
    throw new Error('Hesab sinxronizasiyası aktiv deyil. İnternet bağlantısını yoxlayın.');
  }
  return user;
}

export async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export async function compressImage(file: File, maxWidth = 1280, quality = 0.82): Promise<Blob> {
  if (!file.type.startsWith('image/')) return file;

  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxWidth / bitmap.width);
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    bitmap.close();
    return file;
  }
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  return new Promise((resolve) => {
    canvas.toBlob((b) => resolve(b || file), 'image/jpeg', quality);
  });
}

/** Sıxılma uğursuz olsa orijinal faylı qaytarır. */
export async function compressImageSafe(file: File, maxWidth = 1280, quality = 0.82): Promise<Blob> {
  try {
    return await withTimeout(
      compressImage(file, maxWidth, quality),
      8_000,
      'Şəkil emalı vaxtı bitdi.'
    );
  } catch {
    if (file.size <= 400_000) return file;
    try {
      return await withTimeout(compressImage(file, Math.min(maxWidth, 640), 0.55), 6_000, 'retry');
    } catch {
      return file;
    }
  }
}
