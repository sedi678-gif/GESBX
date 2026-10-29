import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth, signInAnonymously } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getId, getInstallations } from "firebase/installations";
import { getAnalytics, isSupported } from "firebase/analytics";
import { getFunctions } from "firebase/functions";
import { Capacitor, registerPlugin } from "@capacitor/core";
import {
  initializeAppCheck,
  CustomProvider,
  ReCaptchaEnterpriseProvider,
} from "firebase/app-check";

// The client and Vercel Admin SDK must use the same Firebase project.
const pinnedFirebaseConfig = {
  apiKey: "AIzaSyAtzdvcXXrcP_tyglI0JIFIW55nSV26EC0",
  authDomain: "gesbx-c4312.firebaseapp.com",
  projectId: "gesbx-c4312",
  storageBucket: "gesbx-c4312.firebasestorage.app",
  messagingSenderId: "810938425668",
  appId: "1:810938425668:web:26ba3c20e68d049dd6f711",
  measurementId: "G-HYQ93TJJHR",
};

const configuredFirebaseIdentity = {
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: [
    process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    pinnedFirebaseConfig.authDomain,
  ],
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: [
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    pinnedFirebaseConfig.projectId,
  ],
  NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: [
    process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    pinnedFirebaseConfig.storageBucket,
  ],
  NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: [
    process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    pinnedFirebaseConfig.messagingSenderId,
  ],
  NEXT_PUBLIC_FIREBASE_APP_ID: [
    process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
    pinnedFirebaseConfig.appId,
  ],
};

for (const [key, [rawConfigured, expected]] of Object.entries(configuredFirebaseIdentity)) {
  const configured = rawConfigured?.trim();
  if (configured && configured !== expected) {
    console.error(`[Firebase] Ignoring mismatched ${key}; this build is pinned to gesbx-c4312.`);
  }
}

// Do not allow stale Vercel build variables to issue tokens for another project.
const firebaseConfig = {
  ...pinnedFirebaseConfig,
};

export const apiBaseUrl = (
  process.env.NEXT_PUBLIC_API_BASE_URL || "https://gesbx.vercel.app"
).replace(/\/+$/, "");

// Firebase tətbiqini başladırıq
export const app = !getApps().length
  ? initializeApp(firebaseConfig)
  : getApp();

const PlayIntegrity = registerPlugin("PlayIntegrity");

async function sha256Base64Url(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  const binary = Array.from(new Uint8Array(digest), (byte) =>
    String.fromCharCode(byte)
  ).join("");

  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function randomChallenge() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));

  return Array.from(bytes, (value) =>
    value.toString(16).padStart(2, "0")
  ).join("");
}

export async function requestPlayIntegrityToken(requestHash) {
  if (!Capacitor.isNativePlatform()) return null;

  const result = await PlayIntegrity.requestToken({ requestHash });

  if (!result?.token) {
    throw new Error("Play Integrity tokeni alınmadı.");
  }

  return result.token;
}

export const auth = getAuth(app);

export let appCheck = null;

if (typeof window !== "undefined") {
  const siteKey =
    process.env.NEXT_PUBLIC_FIREBASE_APP_CHECK_SITE_KEY || "";

  if (Capacitor.isNativePlatform()) {
    appCheck = initializeAppCheck(app, {
      provider: new CustomProvider({
        getToken: async () => {
          let current = auth.currentUser;

          if (!current) {
            current = (await signInAnonymously(auth)).user;
          }

          const challenge = randomChallenge();
          const installationId = await getId(getInstallations(app));

          const requestHash = await sha256Base64Url(
            `${current.uid}|app-check|${challenge}|${installationId}`
          );

          const integrityToken =
            await requestPlayIntegrityToken(requestHash);

          const idToken = await current.getIdToken();

          const endpoint = `${apiBaseUrl}/api/mint-mobile-app-check-token`;

          const response = await fetch(endpoint, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${idToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              challenge,
              integrityToken,
              installationId,
            }),
          });

          if (!response.ok) {
            throw new Error(
              `App Check tokeni alınmadı (${response.status}).`
            );
          }

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

// Firebase xidmətləri
export const db = getFirestore(app);
export const storage = getStorage(app);
export const functions = getFunctions(app, "us-central1");

// Analitika yalnız brauzerdə başladılır
export let analytics = null;

if (typeof window !== "undefined") {
  isSupported()
    .then((supported) => {
      if (supported) {
        analytics = getAnalytics(app);
      }
    })
    .catch((error) => {
      console.error("Firebase Analytics başladılmadı:", error);
    });
}
