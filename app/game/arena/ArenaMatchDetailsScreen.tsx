"use client";

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import AppBottomNav from '@/app/components/AppBottomNav';
import AppLink from '@/app/components/AppLink';
import { useUser } from '@/context/UserContext';
import { getArenaMatchDetails, type ArenaMatchDetails } from './match/history';
import styles from './history.module.css';

export default function ArenaMatchDetailsScreen() {
  const { userId } = useUser();
  const search = useSearchParams();
  const matchId = search.get('matchId') ?? '';
  const resultId = search.get('resultId') ?? '';
  const [details, setDetails] = useState<ArenaMatchDetails | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!matchId) {
      setLoading(false);
      setError('Match tapılmadı');
      return;
    }
    if (!userId || userId === 'anonim_user_id') {
      setLoading(false);
      setError('Hesab tapılmadı');
      return;
    }
    let cancelled = false;
    setLoading(true);
    void getArenaMatchDetails({ matchId, playerId: userId, resultId: resultId || undefined })
      .then((next) => {
        if (!cancelled) {
          setDetails(next);
          setError('');
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Döyüş detalları yüklənmədi');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [matchId, resultId, userId]);

  const completed = details?.kind === 'completed' ? details : null;
  const title = useMemo(() => {
    if (details?.kind === 'active') return 'Döyüş hələ bitməyib';
    if (completed?.result.status === 'CANCELLED') return 'Ləğv edildi';
    if (completed?.result.status === 'EXPIRED') return 'Vaxtı bitdi';
    return completed?.entry.viewerOutcome ?? 'Detal';
  }, [completed, details]);

  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <p className={styles.eyebrow}>FlameFelix Arena</p>
        <h1 className={styles.title}>{title}</h1>
        <AppLink href="/arena/history" className={styles.back}>
          Tarixçəyə qayıt
        </AppLink>
      </header>
      {loading ? <p className={styles.status}>Yüklənir…</p> : null}
      {!loading && error ? <p className={styles.status}>{error}</p> : null}
      {!loading && details?.kind === 'active' ? (
        <p className={styles.status}>Bu döyüş hələ aktivdir. Tamamlanmış nəticə yoxdur.</p>
      ) : null}
      {completed ? (
        <>
          <section className={styles.panel}>
            <p className={styles.outcome}>{completed.entry.viewerOutcome}</p>
            <p className={styles.opp}>{completed.entry.opponentLabel}</p>
            <p className={styles.score}>{`${completed.result.winnerScore} — ${completed.result.loserScore}`}</p>
            <p className={styles.meta}>{`Zərər: ${completed.result.finalDamage}`}</p>
            <p className={styles.meta}>{`Rejim: ${completed.result.gameMode}`}</p>
            <p className={styles.meta}>{new Date(completed.result.completedAt).toLocaleString()}</p>
          </section>
          {completed.cardSummary.length ? (
            <div className={styles.summary}>
              {completed.cardSummary.map((item) => (
                <span key={item.cardId} className={styles.chip}>{`${item.title} ×${item.count}`}</span>
              ))}
            </div>
          ) : null}
          <ul className={styles.timeline}>
            {completed.timeline.map((event) => (
              <li key={event.id} className={styles.event}>
                {event.label}
              </li>
            ))}
          </ul>
        </>
      ) : null}
      <AppBottomNav activeTab="alliance" />
    </div>
  );
}
