import { AppLanguage } from './settingsTypes';

export const APP_LANGUAGES: AppLanguage[] = ['az', 'en', 'ru', 'tr'];
export const APP_LANGUAGE_KEY = 'yolustu_app_language_v1';
export const APP_LANGUAGE_EVENT = 'yolustu-language';

const SETTINGS_PREFIX = 'yolustu_user_settings_v1_';

export function isAppLanguage(value: unknown): value is AppLanguage {
  return value === 'az' || value === 'en' || value === 'ru' || value === 'tr';
}

export function parseAppLanguage(value: unknown, fallback: AppLanguage = 'az'): AppLanguage {
  return isAppLanguage(value) ? value : fallback;
}

function languageFromSettingsRaw(raw: string | null): AppLanguage | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { language?: unknown; updatedAt?: unknown };
    if (!isAppLanguage(parsed.language)) return null;
    return parsed.language;
  } catch {
    return null;
  }
}

/** Latest language written by the user — survives full page reloads and userId hydration. */
export function readStoredLanguage(): AppLanguage | null {
  if (typeof window === 'undefined') return null;
  try {
    const direct = localStorage.getItem(APP_LANGUAGE_KEY);
    if (isAppLanguage(direct)) return direct;

    let bestLang: AppLanguage | null = null;
    let bestAt = -1;
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith(SETTINGS_PREFIX)) continue;
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      try {
        const parsed = JSON.parse(raw) as { language?: unknown; updatedAt?: unknown };
        if (!isAppLanguage(parsed.language)) continue;
        const at = typeof parsed.updatedAt === 'number' ? parsed.updatedAt : 0;
        if (at >= bestAt) {
          bestAt = at;
          bestLang = parsed.language;
        }
      } catch {
        /* skip corrupt cache */
      }
    }
    return bestLang;
  } catch {
    return null;
  }
}

export function persistAppLanguage(lang: AppLanguage): void {
  if (typeof window === 'undefined') return;
  const next = parseAppLanguage(lang);
  try {
    localStorage.setItem(APP_LANGUAGE_KEY, next);
  } catch {
    /* quota / private mode */
  }
  document.documentElement.lang = next;
  window.dispatchEvent(new CustomEvent(APP_LANGUAGE_EVENT, { detail: next }));
}

export function bootstrapLanguage(): AppLanguage {
  return readStoredLanguage() ?? 'az';
}

export function subscribeAppLanguage(onChange: (lang: AppLanguage) => void): () => void {
  if (typeof window === 'undefined') return () => undefined;

  const fromCustom = (event: Event) => {
    const detail = (event as CustomEvent).detail;
    if (isAppLanguage(detail)) onChange(detail);
  };
  const fromStorage = (event: StorageEvent) => {
    if (event.key === APP_LANGUAGE_KEY && isAppLanguage(event.newValue)) {
      onChange(event.newValue);
      return;
    }
    if (event.key && event.key.startsWith(SETTINGS_PREFIX)) {
      const lang = languageFromSettingsRaw(event.newValue);
      if (lang) onChange(lang);
    }
  };

  window.addEventListener(APP_LANGUAGE_EVENT, fromCustom);
  window.addEventListener('storage', fromStorage);
  return () => {
    window.removeEventListener(APP_LANGUAGE_EVENT, fromCustom);
    window.removeEventListener('storage', fromStorage);
  };
}
