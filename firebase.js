// Import the functions you need from the SDKs you need
import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getAnalytics, isSupported } from "firebase/analytics";

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
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

// Auth və DB-ni buradan export edirik ki, səhifələr istifadə edə bilsin
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

// Analitikanı təhlükəsiz şəkildə yalnız brauzerdə işə salırıq
export let analytics = null;
if (typeof window !== 'undefined') {
  isSupported().then((supported) => {
    if (supported) {
      analytics = getAnalytics(app);
    }
  });
}