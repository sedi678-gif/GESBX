"use client";

import React, { useCallback, useEffect, useState } from 'react';
import styles from './alliance.module.css';
import { useUser } from '@/context/UserContext';
import { normalizeUserPlanState, shouldShowAds } from '@/app/lib/userPlan';
import { useAllianceScreenHold } from './AllianceScreenBusy';

declare global {
  interface Window {
    adsbygoogle?: unknown[];
    showYolustuRewardedAd?: () => Promise<boolean>;
  }
}

interface GoogleAdButtonProps {
  onReward?: () => void | Promise<void>;
  variant?: 'pill' | 'nav' | 'xp' | 'bolt';
  label?: string;
  className?: string;
}

function LightningIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M13.2 2.1 4.4 13.4h6.3l-1.2 8.5 9.6-12.2h-6.5l1.6-7.6z" />
    </svg>
  );
}

/**
 * Google AdMob / AdSense inteqrasiyası üçün hazır düymə.
 * .env: NEXT_PUBLIC_GOOGLE_ADS_CLIENT, NEXT_PUBLIC_GOOGLE_ADS_SLOT
 */
export default function GoogleAdButton({ onReward, variant = 'pill', label, className }: GoogleAdButtonProps) {
  const { playerProfile } = useUser();
  const hideAds = !shouldShowAds(normalizeUserPlanState(playerProfile as unknown as Record<string, unknown> | null));
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  useAllianceScreenHold(open);
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_ADS_CLIENT;
  const slotId = process.env.NEXT_PUBLIC_GOOGLE_ADS_SLOT;

  useEffect(() => {
    if (!open || !clientId || !slotId) return;

    const existing = document.querySelector('script[data-yolustu-ads="1"]');
    if (!existing) {
      const script = document.createElement('script');
      script.async = true;
      script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${clientId}`;
      script.crossOrigin = 'anonymous';
      script.dataset.yolustuAds = '1';
      document.head.appendChild(script);
    }

    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch {
      /* AdSense yüklənməyibsə placeholder qalır */
    }
  }, [open, clientId, slotId]);

  const grantReward = useCallback(async () => {
    await onReward?.();
    setOpen(false);
  }, [onReward]);

  const handleWatchAd = useCallback(async () => {
    setLoading(true);
    try {
      if (typeof window.showYolustuRewardedAd === 'function') {
        const ok = await window.showYolustuRewardedAd();
        if (ok) await grantReward();
        return;
      }
      setOpen(true);
    } finally {
      setLoading(false);
    }
  }, [grantReward]);

  if (hideAds) return null;

  const btnClass = [
    variant === 'nav'
      ? `${styles.epAdBtn} ${styles.epAdBtnNav}`
      : variant === 'xp'
        ? styles.mapAdXpBtn
        : variant === 'bolt'
          ? styles.adBoltBtn
          : styles.epAdBtn,
    className,
  ]
    .filter(Boolean)
    .join(' ');

  const btnLabel = label ?? (variant === 'bolt' ? 'Kəşf boost' : variant === 'xp' ? '+500 XP' : 'REKLAM');

  return (
    <>
      <button
        type="button"
        className={btnClass}
        onClick={() => void handleWatchAd()}
        disabled={loading}
        title="Reklam izlə — videoların və şəkillərin 2 dəqiqə kəşfdə öndə olsun"
        aria-label={btnLabel}
      >
        <span className={styles.epAdBtnIcon}>
          <LightningIcon />
        </span>
        {variant !== 'bolt' ? <span>{loading ? '...' : btnLabel}</span> : null}
      </button>

      {open && (
        <div className={styles.adModalOverlay} onClick={() => setOpen(false)}>
          <div className={styles.adModal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.adModalHeader}>
              <span>📺 Google Ads</span>
              <button type="button" className={styles.epChatClose} onClick={() => setOpen(false)}>
                ✕
              </button>
            </div>
            <p className={styles.adModalHint}>
              Reklamı izləyəndən sonra videoların və paylaşdığın şəkillər 2 dəqiqə kəşf lentinin əvvəlinə düşür.
            </p>
            {clientId && slotId ? (
              <ins
                className="adsbygoogle"
                style={{ display: 'block', minHeight: 250, width: '100%' }}
                data-ad-client={clientId}
                data-ad-slot={slotId}
                data-ad-format="auto"
                data-full-width-responsive="true"
              />
            ) : (
              <div className={styles.adPlaceholder}>
                NEXT_PUBLIC_GOOGLE_ADS_CLIENT və NEXT_PUBLIC_GOOGLE_ADS_SLOT təyin edin
              </div>
            )}
            <button
              type="button"
              className={styles.adBoostConfirmBtn}
              onClick={() => void grantReward()}
            >
              Reklamı izlədim — kəşfə düş
            </button>
          </div>
        </div>
      )}
    </>
  );
}
