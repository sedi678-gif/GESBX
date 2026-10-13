"use client";

import { useMemo } from 'react';
import { useSettings } from '@/context/SettingsContext';
import { getAppStrings } from '@/app/lib/appI18n';

export function useAppStrings() {
  const { language } = useSettings();
  return useMemo(() => getAppStrings(language), [language]);
}
