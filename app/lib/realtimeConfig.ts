/**
 * Real-time server URL — Vercel-də yalnız NEXT_PUBLIC_SOCKET_URL ilə (xarici host).
 * Local dev: avtomatik localhost:4000
 */
export function resolveSocketUrl(): string {
  const fromEnv = process.env.NEXT_PUBLIC_SOCKET_URL?.trim();
  const isDev = process.env.NODE_ENV === 'development';

  if (fromEnv) {
    if (typeof window !== 'undefined' && window.location.protocol === 'https:') {
      return fromEnv.replace(/^http:\/\//i, 'https://');
    }
    return fromEnv;
  }

  if (isDev) return 'http://localhost:4000';
  return '';
}

export function isSocketConfigured(): boolean {
  return Boolean(resolveSocketUrl());
}

export function isSecurePage(): boolean {
  return typeof window !== 'undefined' && window.location.protocol === 'https:';
}
