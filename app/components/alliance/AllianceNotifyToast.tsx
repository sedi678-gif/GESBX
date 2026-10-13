"use client";

import { useEffect } from 'react';
import { useSettings } from '@/context/SettingsContext';
import { useAllianceBrain } from './AllianceBrainContext';
import styles from './alliance.module.css';

export default function AllianceNotifyToast() {
  const { allianceNotifyToast } = useAllianceBrain();
  const { settings } = useSettings();
  const enabled = settings?.notifications.alliance !== false;

  useEffect(() => {
    if (!enabled || !allianceNotifyToast) return;
    if (typeof document === 'undefined' || document.visibilityState === 'visible') return;
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    if (Notification.permission !== 'granted') return;
    try {
      new Notification('İttifaq bildirişi', {
        body: allianceNotifyToast,
        icon: '/favicon.ico',
        tag: 'yolustu-alliance-view',
      });
    } catch {
      /* brauzer bildirişi dəstəklənmirsə */
    }
  }, [allianceNotifyToast, enabled]);

  if (!enabled || !allianceNotifyToast) return null;

  return (
    <div className={styles.allianceViewToast} role="status">
      {allianceNotifyToast}
    </div>
  );
}
