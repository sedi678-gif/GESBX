"use client";

import { useEffect } from 'react';
import { useSettings } from '@/context/SettingsContext';
import { titleForPath } from '@/app/lib/appI18n';
import { ensureFirebaseAuth } from '@/app/lib/firebaseAuth';
import AccountAccessGate from '@/app/components/AccountAccessGate';
import AllianceNotifyToast from '@/app/components/alliance/AllianceNotifyToast';

function resolveTheme(theme: 'dark' | 'light' | 'system'): 'dark' | 'light' {
  if (theme === 'system' && typeof window !== 'undefined') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return theme === 'light' ? 'light' : 'dark';
}

function isNativeShell() {
  const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  return typeof cap?.isNativePlatform === 'function' ? cap.isNativePlatform() : !!cap;
}

function detectPlatform() {
  if (typeof window === 'undefined') return;
  const ua = navigator.userAgent;
  const isIOS =
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isAndroid = /Android/i.test(ua);
  const isCapacitor = isNativeShell();

  document.documentElement.classList.toggle('platform-ios', isIOS);
  document.documentElement.classList.toggle('platform-android', isAndroid);
  document.documentElement.classList.toggle('platform-capacitor', isCapacitor);

  if (isIOS || isCapacitor) {
    document.documentElement.style.setProperty('--app-touch-min', '44px');
  }
}

function listenNativeKeyboard() {
  const viewport = window.visualViewport;
  if (!viewport) return () => {};

  const sync = () => {
    const inset = Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop);
    const open = inset > 80;
    document.documentElement.classList.toggle('keyboard-open', open);
    document.documentElement.style.setProperty('--keyboard-inset', `${open ? inset : 0}px`);
    document.documentElement.style.setProperty('--vv-height', `${viewport.height}px`);
  };

  sync();
  viewport.addEventListener('resize', sync);
  viewport.addEventListener('scroll', sync);
  return () => {
    viewport.removeEventListener('resize', sync);
    viewport.removeEventListener('scroll', sync);
  };
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const { settings, language } = useSettings();

  useEffect(() => {
    detectPlatform();
    const stopKeyboard = listenNativeKeyboard();
    void ensureFirebaseAuth().then((user) => {
      if (!user) {
        console.warn('Firebase Anonymous Auth aktiv deyil — Console-da yandırın.');
      }
    });
    return stopKeyboard;
  }, []);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.documentElement.lang = language;
    const title = titleForPath(language, window.location.pathname);
    if (title) document.title = title;
  }, [language]);

  useEffect(() => {
    if (typeof document === 'undefined' || !settings) return;

    const resolved = resolveTheme(settings.appearance.theme);
    document.documentElement.setAttribute('data-theme', resolved);
    document.documentElement.style.colorScheme = resolved;
    document.body.classList.toggle('theme-light', resolved === 'light');
    document.body.classList.toggle('theme-dark', resolved === 'dark');

    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', resolved === 'light' ? '#f1f5f9' : '#020617');
  }, [settings?.appearance.theme]);

  useEffect(() => {
    if (!settings || settings.appearance.theme !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => {
      const resolved = mq.matches ? 'dark' : 'light';
      document.documentElement.setAttribute('data-theme', resolved);
      document.documentElement.style.colorScheme = resolved;
      document.body.classList.toggle('theme-light', resolved === 'light');
      document.body.classList.toggle('theme-dark', resolved === 'dark');
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [settings?.appearance.theme]);

  return (
    <div className="appViewport">
      {children}
      <AllianceNotifyToast />
      <AccountAccessGate />
    </div>
  );
}
