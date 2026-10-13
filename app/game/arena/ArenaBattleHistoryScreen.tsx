"use client";

import { useCallback, useEffect, useState } from 'react';
import AppBottomNav from '@/app/components/AppBottomNav';
import AppLink from '@/app/components/AppLink';
import { useUser } from '@/context/UserContext';
import { listArenaBattleHistory, type ArenaHistoryCursor, type ArenaHistoryEntry } from './match/history';
import styles from './history.module.css';

export default function ArenaBattleHistoryScreen() {
  const { userId } = useUser();
  const [entries, setEntries] = useState<ArenaHistoryEntry[]>([]);
  const [cursor, setCursor] = useState<ArenaHistoryCursor | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const load = useCallback(
    async (next: ArenaHistoryCursor | null, append: boolean) => {
      if (!userId || userId === 'anonim_user_id') {
        setLoading(false);
        setError('Hesab tapılmadı');
        return;
      }
      try {
        if (append) setLoadingMore(true);
        else setLoading(true);
        const page = await listArenaBattleHistory({ playerId: userId, cursor: next });
        setEntries((prev) => (append ? [...prev, ...page.entries] : page.entries));
        setCursor(page.nextCursor);
        setError('');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Tarixçə yüklənmədi');
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [userId]
  );

  useEffect(() => {
    void load(null, false);
  }, [load]);

  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <p className={styles.eyebrow}>FlameFelix Arena</p>
        <h1 className={styles.title}>Döyüş tarixçəsi</h1>
        <AppLink href="/ranking" className={styles.back}>
          Reytinqə qayıt
        </AppLink>
      </header>
      {loading ? <p className={styles.status}>Yüklənir…</p> : null}
      {!loading && error ? <p className={styles.status}>{error}</p> : null}
      {!loading && !error && entries.length === 0 ? <p className={styles.status}>Hələ tamamlanmış döyüş yoxdur.</p> : null}
      <div className={styles.list}>
        {entries.map((entry) => (
          <AppLink
            key={entry.resultId}
            href={`/arena/history/details/?matchId=${encodeURIComponent(entry.matchId)}`}
            className={styles.row}
          >
            <p className={styles.outcome}>{entry.viewerOutcome}</p>
            <div>
              <p className={styles.opp}>{entry.opponentLabel}</p>
              <p className={styles.meta}>{`${entry.winnerScore} — ${entry.loserScore} · ${new Date(entry.completedAt).toLocaleString()}`}</p>
            </div>
            <span className={styles.details}>Detal</span>
          </AppLink>
        ))}
      </div>
      {cursor && !loading ? (
        <button type="button" className={styles.more} disabled={loadingMore} onClick={() => void load(cursor, true)}>
          {loadingMore ? 'Yüklənir…' : 'Daha çox'}
        </button>
      ) : null}
      <AppBottomNav activeTab="alliance" />
    </div>
  );
}
