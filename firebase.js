// Import the functions you need from the SDKs you need
import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getId, getInstallations } from "firebase/installations";
import { getAnalytics, isSupported } from "firebase/analytics";
import { signInAnonymously } from "firebase/auth";
import { getFunctions } from "firebase/functions";
import { Capacitor, registerPlugin } from "@capacitor/core";
import {
  initializeAppCheck,
  CustomProvider,
  ReCaptchaEnterpriseProvider,
} from "firebase/app-check";

// Firebase konfiqurasiyası — env (.env.local) və ya default (youstu-cab15)
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? 'AIzaSyBcRbbdNYaLV_Ym1trKPmjcmuyIppU5X20',
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? 'youstu-cab15.firebaseapp.com',
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? 'youstu-cab15',
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ?? 'youstu-cab15.firebasestorage.app',
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? '213802937871',
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID ?? '1:213802937871:web:affc17228f042761533d7a',
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID ?? 'G-VEH2WZ3ES1',
};

// Initialize Firebase (təkrar inisializasiya xətasının qarşısını almaq üçün şərtlə)
export const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

const PlayIntegrity = registerPlugin('PlayIntegrity');

async function sha256Base64Url(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  const binary = Array.from(new Uint8Array(digest), (byte) => String.fromCharCode(byte)).join('');
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function randomChallenge() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
}

export async function requestPlayIntegrityToken(requestHash) {
  if (!Capacitor.isNativePlatform()) return null;
  const result = await PlayIntegrity.requestToken({ requestHash });
  if (!result?.token) throw new Error('Play Integrity tokeni alınmadı.');
  return result.token;
}

export let appCheck = null;
if (typeof window !== 'undefined') {
  const siteKey = process.env.NEXT_PUBLIC_FIREBASE_APP_CHECK_SITE_KEY || '';
  if (Capacitor.isNativePlatform()) {
    appCheck = initializeAppCheck(app, {
      provider: new CustomProvider({
        getToken: async () => {
          let current = auth.currentUser;
          if (!current) current = (await signInAnonymously(auth)).user;
          const challenge = randomChallenge();
          const installationId = await getId(getInstallations(app));
          const requestHash = await sha256Base64Url(`${current.uid}|app-check|${challenge}|${installationId}`);
          const integrityToken = await requestPlayIntegrityToken(requestHash);
          const idToken = await current.getIdToken();
          const endpoint = `https://us-central1-${firebaseConfig.projectId}.cloudfunctions.net/mintMobileAppCheckToken`;
          const response = await fetch(endpoint, {
            method: 'POST',
            headers: { Authorization: `Bearer ${idToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ challenge, integrityToken, installationId }),
          });
          if (!response.ok) throw new Error(`App Check tokeni alınmadı (${response.status}).`);
          return response.json();
        },
      }),
      isTokenAutoRefreshEnabled: true,
    });
  } else if (siteKey) {
    appCheck = initializeAppCheck(app, {
      provider: new ReCaptchaEnterpriseProvider(siteKey),
      isTokenAutoRefreshEnabled: true,
    });
  }
}

// App Check must be registered before Firebase services are initialized so
// Auth, Firestore, Storage, and Functions all receive its token provider.
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const functions = getFunctions(app, 'us-central1');

// Analitikanı təhlükəsiz şəkildə yalnız brauzerdə işə salırıq
export let analytics = null;
if (typeof window !== 'undefined') {
  isSupported().then((supported) => {
    if (supported) {
      analytics = getAnalytics(app);
    }
  });
}
