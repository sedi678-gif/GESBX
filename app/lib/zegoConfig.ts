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
  appSign: string;
  serverSecret: string;
}

/** Klientdə icazə verilən maksimum: yalnız public açarlar. */
export interface ZegoPublicConfig {
  appId: number;
  appSign: string;
}

const CACHE_KEY = 'yolustu_zego_config_v3';

/** AppSign (adətən 64 hex) token üçün ServerSecret deyil — 1002011/1002033. */
function pickServerSecret(appSign: string, serverSecret?: string): string {
  const sign = (appSign ?? '').trim();
  const secret = (serverSecret ?? '').trim();
  if (secret && secret !== sign) return secret;
  if (secret && secret.length === 32) return secret;
  return '';
}

/**
 * Klient heç bir halda serverSecret qəbul etmir. Brauzerdə yalnız public açarlar saxlanılır;
 * secret lazımdırsa, token serverdə imzalanıb klientə verilməlidir.
 */
function isServerRuntime(): boolean {
  return typeof window === 'undefined';
}

let resolved: ZegoRuntimeConfig | null = null;
let loadPromise: Promise<boolean> | null = null;
let lastLoadError: string | null = null;

function applyConfig(appId: number, appSign: string, serverSecret?: string): boolean {
  const sign = (appSign ?? '').trim();
  // Brauzerdə secret qəbul edilmir: yalnız server runtime-ında oxunur.
  const secret = isServerRuntime() ? pickServerSecret(sign, serverSecret) : '';
  if (!Number.isFinite(appId) || appId <= 0) return false;
  if (isServerRuntime() && !secret) return false;
  resolved = { appId, appSign: sign, serverSecret: secret };
  if (typeof window !== 'undefined') {
    try {
      sessionStorage.setItem(CACHE_KEY, JSON.stringify(resolved));
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
  const sign =
    process.env.NEXT_PUBLIC_ZEGO_APP_SIGN ??
    process.env.ZEGO_APP_SIGN ??
    '';
  const secret =
    process.env.ZEGO_SERVER_SECRET ?? process.env.NEXT_PUBLIC_ZEGO_SERVER_SECRET ?? '';
  const id = Number(rawId);
  return applyConfig(id, sign, secret);
}

function readFromSessionCache(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return false;
    const data = JSON.parse(raw) as ZegoRuntimeConfig;
    return applyConfig(data.appId, data.appSign, data.serverSecret);
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
    const sign = (data.appSign ?? '').trim();
    // public/*.json yalnız public açarları daşıyır — serverSecret qəsdən oxunmur.
    return applyConfig(id, sign, '');
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
    const snap = await getDoc(doc(db, 'app_config', 'zego'));
    if (!snap.exists()) return false;
    const data = snap.data() as {
      appId?: number;
      appSign?: string;
    };
    const id = Number(data.appId);
    const sign = (data.appSign ?? '').trim();
    // Firestore-daki app_config yalnız public açarları saxlayır; secret ora da yazılmamalıdır.
    return applyConfig(id, sign, '');
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
  if (resolved?.appId && resolved.serverSecret) return true;
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

export function getZegoAppSign(): string {
  return resolved?.appSign ?? '';
}

export function getZegoServerSecret(): string {
  if (resolved?.serverSecret) return resolved.serverSecret;
  readFromProcessEnv();
  return resolved?.serverSecret ?? '';
}

export function isZegoConfigured(): boolean {
  if (getZegoAppId() <= 0) return false;
  // Brauzerdə token serverdə imzalanır — secret tələb olunmur.
  if (!isServerRuntime()) return true;
  return getZegoServerSecret().length > 0;
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
    } catch {
      /* ignore */
    }
  }
}
