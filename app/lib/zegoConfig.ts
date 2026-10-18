'use client';

/**
 * ZegoCloud UIKit — çoxqatlı konfiqurasiya (env, JSON, Firestore, cache).
 *
 * TƏHLÜKƏSİZLİK: serverSecret bu faylda YALNIZ serverdə işləyən yollarla alına bilər.
 * Klientə (bundle, public/*.json, Firestore) heç vaxt secret yazılmamalıdır — o,
 * token imzalama açarıdır. Token serverdə imzalanmalı və klientə hazır token verilməlidir.
 */

export interface ZegoRuntimeConfig {
  appId: number;
}

/** Klientdə icazə verilən maksimum: yalnız public açarlar. */
export interface ZegoPublicConfig {
  appId: number;
}

const CACHE_KEY = 'gesbx_zego_config_v4';
const LEGACY_CACHE_KEY = 'gesbx_zego_config_v3';

/**
 * Klient heç bir halda serverSecret qəbul etmir. Brauzerdə yalnız public açarlar saxlanılır;
 * secret lazımdırsa, token serverdə imzalanıb klientə verilməlidir.
 */
let resolved: ZegoRuntimeConfig | null = null;
let loadPromise: Promise<boolean> | null = null;
let lastLoadError: string | null = null;

function applyConfig(appId: number): boolean {
  if (!Number.isFinite(appId) || appId <= 0) return false;
  resolved = { appId };
  if (typeof window !== 'undefined') {
    try {
      sessionStorage.removeItem(LEGACY_CACHE_KEY);
      sessionStorage.setItem(CACHE_KEY, JSON.stringify({ appId }));
    } catch {
      /* ignore */
    }
  }
  return true;
}

function readFromProcessEnv(): boolean {
  const rawId =
    process.env.NEXT_PUBLIC_ZEGO_APP_ID ??
    process.env.ZEGO_APP_ID ??
    '';
  const id = Number(rawId);
  return applyConfig(id);
}

function readFromSessionCache(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return false;
    const data = JSON.parse(raw) as ZegoRuntimeConfig;
    return applyConfig(data.appId);
  } catch {
    return false;
  }
}

async function fetchJsonConfig(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return false;
    const data = (await res.json()) as Partial<ZegoPublicConfig>;
    const id = Number(data.appId);
    // public/*.json yalnız public açarları daşıyır — serverSecret qəsdən oxunmur.
    return applyConfig(id);
  } catch {
    return false;
  }
}

async function loadFromRuntimeJson(): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  const origin = window.location.origin.replace(/\/$/, '');
  const paths = [
    `${origin}/zego-runtime-config.json`,
    `${origin}/zego-runtime-config.json/`,
    '/zego-runtime-config.json',
    './zego-runtime-config.json',
  ];
  for (const url of paths) {
    if (await fetchJsonConfig(url)) return true;
  }
  return false;
}

async function loadFromFirestore(): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  try {
    const { doc, getDoc } = await import('firebase/firestore');
    const { db } = await import('@/firebase');
    const { ensureFirebaseAuth } = await import('@/app/lib/firebaseAuth');
    await ensureFirebaseAuth();
    const snap = await getDoc(doc(db, 'app_config', 'zego_public'));
    if (!snap.exists()) return false;
    const data = snap.data() as {
      appId?: number;
    };
    const id = Number(data.appId);
    // Firestore-daki app_config yalnız public açarları saxlayır; secret ora da yazılmamalıdır.
    return applyConfig(id);
  } catch (err) {
    lastLoadError = err instanceof Error ? err.message : 'Firestore xətası';
    console.warn('[Zego] Firestore config:', err);
    return false;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Bütün mənbələrdən konfiqurasiya yükləyir (retry ilə) */
export async function ensureZegoConfig(): Promise<boolean> {
  if (resolved?.appId) return true;
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    lastLoadError = null;

    if (readFromSessionCache()) return true;
    if (readFromProcessEnv()) return true;
    if (await loadFromRuntimeJson()) return true;

    for (let attempt = 0; attempt < 4; attempt += 1) {
      if (await loadFromFirestore()) return true;
      if (attempt < 3) await sleep(800 * (attempt + 1));
    }

    if (await loadFromRuntimeJson()) return true;
    if (readFromProcessEnv()) return true;

    return false;
  })().finally(() => {
    loadPromise = null;
  });

  return loadPromise;
}

export function getZegoRuntimeConfig(): ZegoRuntimeConfig | null {
  return resolved;
}

export function getZegoAppId(): number {
  if (resolved?.appId) return resolved.appId;
  readFromProcessEnv();
  return resolved?.appId ?? 0;
}

export function isZegoConfigured(): boolean {
  if (getZegoAppId() <= 0) return false;
  // Brauzerdə token serverdə imzalanır — secret tələb olunmur.
  return true;
}

export function getZegoConfigErrorMessage(): string {
  const detail = lastLoadError ? ` (${lastLoadError})` : '';
  return `ZegoCloud konfiqurasiyası yüklənmədi${detail}. Səhifəni yeniləyin və ya bir neçə saniyə gözləyib təkrar cəhd edin.`;
}

export function resetZegoConfigCache(): void {
  resolved = null;
  if (typeof window !== 'undefined') {
    try {
      sessionStorage.removeItem(CACHE_KEY);
      sessionStorage.removeItem(LEGACY_CACHE_KEY);
    } catch {
      /* ignore */
    }
  }
}
