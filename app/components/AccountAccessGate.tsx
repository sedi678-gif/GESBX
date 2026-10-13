"use client";

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useUser } from '@/context/UserContext';
import { useSettings } from '@/context/SettingsContext';
import { getSettingsStrings } from '@/app/lib/settingsI18n';
import {
  isRealAccountId,
  listenAccountStatus,
} from '@/app/lib/accountLifecycleService';
import styles from './social/social.module.css';

const AUTH_PREFIXES = ['/login', '/register', '/forgot-password'];

export default function AccountAccessGate() {
  const { userId } = useUser();
  const { language } = useSettings();
  const pathname = usePathname() ?? '';
  const router = useRouter();
  const t = getSettingsStrings(language);
  const [banned, setBanned] = useState(false);
  const [frozen, setFrozen] = useState(false);

  useEffect(() => {
    if (!isRealAccountId(userId)) {
      setBanned(false);
      setFrozen(false);
      return;
    }
    return listenAccountStatus(userId, (status) => {
      setBanned(status.banned);
      setFrozen(status.frozen);
    });
  }, [userId]);

  const onAuthPage = AUTH_PREFIXES.some((p) => pathname.startsWith(p));
  const onSettings = pathname.startsWith('/settings');

  useEffect(() => {
    if (banned || onAuthPage) return;
    if (frozen && !onSettings) {
      router.replace('/settings');
    }
  }, [banned, frozen, onAuthPage, onSettings, router]);

  if (banned && !onAuthPage) {
    return (
      <div className={styles.accountLockOverlay} role="alertdialog" aria-modal="true">
        <div className={styles.accountLockCard}>
          <h2>{t.bannedOverlayTitle}</h2>
          <p>{t.bannedOverlayText}</p>
          <p className={styles.settingsContact}>{t.phone}</p>
          <p className={styles.settingsContact}>{t.email}</p>
        </div>
      </div>
    );
  }

  return null;
}
