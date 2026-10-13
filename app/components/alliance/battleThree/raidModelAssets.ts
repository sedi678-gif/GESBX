/**
 * Next.js static fayllar yalnız `public/` altındadır:
 *   public/models/**  →  https://origin/models/**
 *   public/model/**   →  https://origin/model/**  (alias)
 *
 * `trailingSlash: true` səhifələrdə nisbi URL 404 verir —
 * ona görə bütün yükləmələr origin-absolute olmalıdır.
 */
const MODEL_DIR_CANDIDATES = ['/models', '/model'] as const;

function encodePathSegments(rel: string): string {
  return rel
    .replace(/^\/+/, '')
    .split('/')
    .map((seg) => encodeURIComponent(seg))
    .join('/');
}

export function toAbsoluteStaticUrl(pathname: string): string {
  const path = pathname.startsWith('/') ? pathname : `/${pathname}`;
  if (typeof window === 'undefined') return path;
  return new URL(path, window.location.origin).href;
}

export function toPublicModelsUrl(relFromModelsFolder: string): string {
  return toAbsoluteStaticUrl(`/models/${encodePathSegments(relFromModelsFolder)}`);
}

export function publicModelUrlCandidates(relFromModelsFolder: string): string[] {
  const encoded = encodePathSegments(relFromModelsFolder);
  return MODEL_DIR_CANDIDATES.map((root) => toAbsoluteStaticUrl(`${root}/${encoded}`));
}

export async function loadFromPublicModels<T>(
  relFromModelsFolder: string,
  loadUrl: (url: string) => Promise<T>
): Promise<T> {
  const urls = publicModelUrlCandidates(relFromModelsFolder);
  let lastErr: unknown;
  for (const url of urls) {
    try {
      return await loadUrl(url);
    } catch (err) {
      lastErr = err;
      console.warn('[raid-model] static asset 404/yüklənmədi:', url);
    }
  }
  throw lastErr instanceof Error
    ? lastErr
    : new Error(`Static model tapılmadı: ${relFromModelsFolder}`);
}
