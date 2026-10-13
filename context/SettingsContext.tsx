"use client";

import React, { createContext, useCallback, useContext, useEffect, useLayoutEffect, useState } from 'react';
import { useUser } from '@/context/UserContext';
import { getLocalProfileUserId } from '@/app/lib/userId';
import {
  listenUserSettings,
  saveUserSettings,
  getCachedSettings,
} from '@/app/lib/settingsService';
import {
  bootstrapLanguage,
  persistAppLanguage,
  readStoredLanguage,
  subscribeAppLanguage,
} from '@/app/lib/appLanguage';
import { AppLanguage, DEFAULT_SETTINGS, UserSettings } from '@/app/lib/settingsTypes';

interface SettingsContextType {
  settings: UserSettings | null;
  language: AppLanguage;
  setLanguage: (lang: AppLanguage) => void;
  updateSettings: (patch: Partial<Omit<UserSettings, 'userId'>>) => Promise<void>;
  ready: boolean;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

function withLanguage(base: UserSettings, language: AppLanguage): UserSettings {
  if (base.language === language) return base;
  return { ...base, language, updatedAt: Date.now() };
}

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const { userId } = useUser();
  const resolvedId =
    userId !== 'anonim_user_id' ? userId : getLocalProfileUserId() || '';

  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [ready, setReady] = useState(false);

  useLayoutEffect(() => {
    const lang = bootstrapLanguage();
    persistAppLanguage(lang);
    const cached =
      (resolvedId ? getCachedSettings(resolvedId) : null) || getCachedSettings('guest');
    const base = cached || DEFAULT_SETTINGS(resolvedId || 'guest');
    setSettings(withLanguage(base, lang));
  }, [resolvedId]);

  useEffect(() => {
    return subscribeAppLanguage((lang) => {
      setSettings((prev) => {
        const base = prev || DEFAULT_SETTINGS(resolvedId || 'guest');
        return withLanguage(base, lang);
      });
      if (typeof document !== 'undefined') {
        document.documentElement.lang = lang;
      }
    });
  }, [resolvedId]);

  useEffect(() => {
    const lang = bootstrapLanguage();
    persistAppLanguage(lang);

    if (!resolvedId) {
      const guest = getCachedSettings('guest') || DEFAULT_SETTINGS('guest');
      setSettings(withLanguage(guest, lang));
      setReady(true);
      return;
    }

    const cached = getCachedSettings(resolvedId);
    if (cached) {
      setSettings(withLanguage(cached, lang));
      setReady(true);
    }

    const unsub = listenUserSettings(resolvedId, (remote) => {
      const keep = readStoredLanguage() || lang || remote.language;
      setSettings(withLanguage(remote, keep));
      setReady(true);
      persistAppLanguage(keep);
      if (remote.language !== keep) {
        void saveUserSettings(resolvedId, { language: keep });
      }
    });

    return unsub;
  }, [resolvedId]);

  const updateSettings = useCallback(
    async (patch: Partial<Omit<UserSettings, 'userId'>>) => {
      const effectiveId = resolvedId || 'guest';
      if (patch.language) {
        persistAppLanguage(patch.language);
      }

      setSettings((prev) => {
        const base = prev || getCachedSettings(effectiveId) || DEFAULT_SETTINGS(effectiveId);
        const next = { ...base, ...patch, updatedAt: Date.now() } as UserSettings;
        if (typeof window !== 'undefined') {
          localStorage.setItem(`yolustu_user_settings_v1_${effectiveId}`, JSON.stringify(next));
        }
        return next;
      });

      if (!resolvedId) return;
      void saveUserSettings(resolvedId, patch);
    },
    [resolvedId]
  );

  const setLanguage = useCallback(
    (lang: AppLanguage) => {
      persistAppLanguage(lang);
      void updateSettings({ language: lang });
    },
    [updateSettings]
  );

  const language = settings?.language ?? 'az';

  return (
    <SettingsContext.Provider value={{ settings, language, setLanguage, updateSettings, ready }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used within SettingsProvider');
  return ctx;
}
