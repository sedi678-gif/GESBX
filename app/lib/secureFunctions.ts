import { httpsCallable } from 'firebase/functions';
import { getToken } from 'firebase/app-check';
import { getId, getInstallations } from 'firebase/installations';
import { Capacitor } from '@capacitor/core';
import { app, appCheck, auth, functions, requestPlayIntegrityToken } from '@/firebase';
import { requireFirebaseAuth } from './firebaseAuth';

type SecureEnvelope<T> = {
  operationId: string;
  payload: T;
  installationId: string;
  integrityToken?: string;
};

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.keys(value as Record<string, unknown>)
      .sort()
      .map((key) => [key, stableValue((value as Record<string, unknown>)[key])]),
  );
}

function stableJson(value: unknown): string {
  return JSON.stringify(stableValue(value));
}

function createOperationId(): string {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(20));
  return Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
}

async function hashRequest(value: unknown): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(stableJson(value)));
  const bytes = new Uint8Array(digest);
  let binary = '';
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

/**
 * Server callable wrapper. Auth and App Check are attached by Firebase SDK;
 * Android additionally attaches a fresh Play Integrity token bound to this request.
 */
export async function callSecureFunction<TPayload extends Record<string, unknown>, TResult>(
  action: string,
  payload: TPayload,
  operationId = createOperationId(),
): Promise<TResult> {
  const user = await requireFirebaseAuth();
  if (!appCheck && process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR !== '1') {
    throw new Error('Firebase App Check qurulmayıb: Vercel Production mühitində NEXT_PUBLIC_FIREBASE_APP_CHECK_SITE_KEY adlı dəyişənə Google Cloud Fraud Defense-də yaradılmış reCAPTCHA Enterprise SITE KEY yazın, Firebase Console → App Check → Apps bölməsində Fraud Defense provider-i ilə qeydiyyatdan keçirin və yenidən deploy edin.');
  }
  if (appCheck) {
    try {
      await getToken(appCheck);
    } catch (error) {
      const reason = error instanceof Error ? ` (${error.message})` : '';
      throw new Error(`Firebase App Check tokeni alınmadı. Firebase Console-da Fraud Defense provider qeydiyyatında olan Enterprise site key-in Vercel Production-dakı NEXT_PUBLIC_FIREBASE_APP_CHECK_SITE_KEY ilə eyni olduğunu yoxlayın${reason}`);
    }
  }
  const uid = auth.currentUser?.uid || user.uid;
  const installationId = await getFirebaseInstallationId();
  const request: SecureEnvelope<TPayload> = { operationId, payload, installationId };

  if (Capacitor.isNativePlatform()) {
    const requestHash = await hashRequest({ uid, action, operationId, payload, installationId });
    const integrityToken = await requestPlayIntegrityToken(requestHash);
    if (!integrityToken) throw new Error('Play Integrity bu cihazda aktiv deyil.');
    request.integrityToken = integrityToken;
  }

  const callable = httpsCallable<SecureEnvelope<TPayload>, TResult>(functions, action, {
    timeout: 30_000,
  });
  try {
    const result = await callable(request);
    return result.data;
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error
      ? String((error as { code?: unknown }).code || '')
      : '';
    const message = error instanceof Error ? error.message : String(error);
    const operation = code ? `${action} (${code})` : action;
    throw new Error(`${operation} uğursuz oldu: ${message}`, { cause: error });
  }
}

export function createSecureOperationId(): string {
  return createOperationId();
}

export function getFirebaseInstallationId(): Promise<string> {
  return getId(getInstallations(app));
}
