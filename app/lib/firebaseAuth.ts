import {
  EmailAuthProvider,
  linkWithCredential,
  sendEmailVerification,
  signInAnonymously,
  connectAuthEmulator,
  User,
} from 'firebase/auth';
import { connectFirestoreEmulator } from 'firebase/firestore';
import { connectStorageEmulator } from 'firebase/storage';
import { auth, db, storage } from '@/firebase';

let emulatorsConnected = false;

function connectFirebaseEmulators() {
  if (emulatorsConnected || typeof window === 'undefined') return;
  if (process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR !== '1') return;

  // Never route a deployed visitor's browser to their own localhost. This env
  // flag is public/compile-time in a static Next build and can be accidentally
  // enabled in Vercel; Auth then hangs until the sign-in timeout.
  const host = window.location.hostname;
  if (host !== 'localhost' && host !== '127.0.0.1' && host !== '::1') {
    console.warn('[Firebase] Emulator flag ignored outside localhost.');
    return;
  }

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
let authFailure: string | null = null;
const AUTH_TIMEOUT_MS = 12_000;
const ANONYMOUS_AUTH_TIMEOUT_MS = 20_000;

/** Anonim Firebase auth — vaxt bitərsə null qaytarır, prosesi bloklamır. */
export function ensureFirebaseAuth(): Promise<User | null> {
  connectFirebaseEmulators();

  if (auth.currentUser) {
    authFailure = null;
    return Promise.resolve(auth.currentUser);
  }

  if (!authReady) {
    const pending = (async () => {
      // Wait for Firebase's persisted session to restore before creating a
      // temporary anonymous one. Otherwise the first protected action after
      // a cold load can race Auth initialization and look like a signed-out user.
      await withTimeout(
        auth.authStateReady(),
        AUTH_TIMEOUT_MS,
        'Firebase saxlanmış hesab sessiyasını bərpa edə bilmədi.'
      );
      if (auth.currentUser) {
        authFailure = null;
        return auth.currentUser;
      }
      const credential = await withTimeout(
        signInAnonymously(auth),
        ANONYMOUS_AUTH_TIMEOUT_MS,
        'Firebase anonim giriş sorğusuna cavab vermədi.'
      );
      authFailure = null;
      return credential.user;
    })().catch((err) => {
      console.warn('Anon auth:', err);
      authFailure = err instanceof Error ? err.message : String(err);
      authReady = null;
      return null;
    });
    authReady = pending;
    void pending.finally(() => {
      if (authReady === pending) authReady = null;
    });
  }

  return authReady;
}

/** Auth tələb edir; uğursuz olsa aydın xəta atır. */
export async function requireFirebaseAuth(): Promise<User> {
  const user = await ensureFirebaseAuth();
  if (!user) {
    const detail = authFailure ? ` (${authFailure})` : '';
    throw new Error(`Firebase hesabı bərpa olunmadı. Anonim girişin Firebase Console-da aktiv olduğunu və Auth domeninin icazəli olduğunu yoxlayın.${detail}`);
  }
  return user;
}

/** Attach email/password to the current anonymous account without changing its UID. */
export async function linkCurrentAccountToEmail(email: string, password: string): Promise<User> {
  const user = await requireFirebaseAuth();
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail || password.length < 6) {
    throw new Error('Email və ən azı 6 simvolluq şifrə daxil edin.');
  }

  if (!user.isAnonymous) {
    if (user.email?.toLowerCase() !== normalizedEmail) {
      throw new Error('Bu Firebase hesabı artıq başqa emailə bağlıdır.');
    }
    if (!user.emailVerified) await sendEmailVerification(user);
    return user;
  }

  const credential = EmailAuthProvider.credential(normalizedEmail, password);
  const linked = await linkWithCredential(user, credential);
  await sendEmailVerification(linked.user);
  return linked.user;
}

export async function refreshEmailVerification(): Promise<{ email: string | null; verified: boolean }> {
  const user = await requireFirebaseAuth();
  await user.reload();
  const refreshed = await requireFirebaseAuth();
  await refreshed.getIdToken(true);
  return { email: refreshed.email, verified: refreshed.emailVerified };
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
