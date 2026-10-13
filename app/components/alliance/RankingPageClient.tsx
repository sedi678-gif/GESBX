"use client";

import { useEffect } from 'react';
import AppLink from '@/app/components/AppLink';
import { AllianceRankingBoard } from '@/app/components/alliance/AllianceRankTables';
import { requireLeaderboardPeriod } from '@/app/lib/leaderboard';
import { useAppStrings } from '@/app/lib/useAppStrings';
import styles from '@/app/components/alliance/alliance.module.css';

export default function RankingPageClient() {
  const t = useAppStrings();
  useEffect(() => {
    void requireLeaderboardPeriod().catch(() => {});
    const onVisible = () => {
      if (document.visibilityState === 'visible') void requireLeaderboardPeriod().catch(() => {});
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  return (
    <div className={styles.rankingPage}>
      <header className={styles.rankingPageHead}>
        <p className={styles.rankingPageEyebrow}>{t.ranking.eyebrow}</p>
        <h1 className={styles.rankingPageTitle}>{t.ranking.title}</h1>
        <AppLink href="/arena/history" className={styles.rankingPageEyebrow}>
          {t.ranking.history}
        </AppLink>
      </header>
      <AllianceRankingBoard />
    </div>
  );
}
