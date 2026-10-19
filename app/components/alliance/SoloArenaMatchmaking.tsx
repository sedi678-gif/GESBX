"use client";

import { useCallback, useEffect, useState } from 'react';
import { useAllianceBrain } from './AllianceBrainContext';
import GameTable from '@/app/game/table/GameTable';
import { listenArenaMatch, type ArenaMatchState } from '@/app/game/arena/match';
import {
  cancelSoloArenaQueue,
  listenSoloArenaQueue,
  queueSoloArenaMatch,
  type SoloArenaQueueState,
} from '@/app/lib/soloArenaQueueService';
import styles from './alliance.module.css';

const IDLE_QUEUE: SoloArenaQueueState = { state: 'idle', matchId: null, opponentName: null, updatedAt: 0 };

export default function SoloArenaMatchmaking() {
  const { userId, activeAlliance } = useAllianceBrain();
  const [queue, setQueue] = useState<SoloArenaQueueState>(IDLE_QUEUE);
  const [match, setMatch] = useState<ArenaMatchState | null>(null);
  const [tableOpen, setTableOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return undefined;
    return listenSoloArenaQueue(setQueue, (reason) => {
      setError(reason.message || 'Döyüş axtarışı açıla bilmədi.');
    });
  }, [userId]);

  useEffect(() => {
    if (queue.state !== 'waiting' || !userId) return undefined;
    let running = false;
    const timer = window.setInterval(() => {
      if (running) return;
      running = true;
      void queueSoloArenaMatch(userId)
        .then((next) => setQueue((current) => next.state === 'waiting' ? { ...current, ...next } : next))
        .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Rəqib axtarışı davam edə bilmədi.'))
        .finally(() => { running = false; });
    }, 8_000);
    return () => window.clearInterval(timer);
  }, [queue.state, userId]);

  useEffect(() => {
    if (!queue.matchId) {
      setMatch(null);
      return undefined;
    }
    return listenArenaMatch(queue.matchId, (next) => {
      setMatch(next);
      if (next.status !== 'closed') setTableOpen(true);
    }, (reason) => setError(reason.message || 'Döyüş məlumatı yüklənmədi.'));
  }, [queue.matchId]);

  const startSearch = useCallback(async () => {
    if (!userId || activeAlliance || busy) return;
    setBusy(true);
    setError(null);
    try {
      const next = await queueSoloArenaMatch(userId);
      setQueue((current) => ({ ...current, ...next }));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Döyüş axtarışı baş tutmadı.');
    } finally {
      setBusy(false);
    }
  }, [activeAlliance, busy, userId]);

  const cancelSearch = useCallback(async () => {
    if (!userId || busy) return;
    setBusy(true);
    setError(null);
    try {
      await cancelSoloArenaQueue(userId);
      setQueue(IDLE_QUEUE);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Axtarış dayandırılmadı.');
    } finally {
      setBusy(false);
    }
  }, [busy, userId]);

  const closeTable = useCallback(() => {
    setTableOpen(false);
    if (match?.status !== 'closed' || !userId) return;
    void cancelSoloArenaQueue(userId).catch(() => undefined);
    setQueue(IDLE_QUEUE);
    setMatch(null);
  }, [match?.status, userId]);

  if (!userId) return null;

  return (
    <>
      <section className={styles.soloArenaDock} aria-label="İttifaqsız XP döyüşü">
        {queue.state === 'waiting' ? (
          <div className={styles.soloArenaPanel}>
            <strong>Rəqib axtarılır…</strong>
            <span>Yalnız ittifaqsız oyunçular · 1v1 · XP</span>
            <button type="button" className={styles.soloArenaCancel} disabled={busy} onClick={() => void cancelSearch()}>
              Axtarışı dayandır
            </button>
          </div>
        ) : queue.state === 'matched' && queue.matchId ? (
          <div className={styles.soloArenaPanel}>
            <strong>Rəqib tapıldı: {queue.opponentName || 'Oyunçu'}</strong>
              <span>{match?.status === 'closed'
                ? 'Döyüş bitdi. XP təkrar döyüş və gündəlik limit qaydasına görə hesablanır.'
                : '1v1 XP döyüşü hazırdır.'}</span>
            {match?.status === 'closed' ? (
              <button type="button" className={styles.soloArenaButton} onClick={() => void cancelSearch()}>
                Bağla
              </button>
            ) : (
              <button type="button" className={styles.soloArenaButton} onClick={() => setTableOpen(true)}>
                Döyüşə qayıt
              </button>
            )}
          </div>
        ) : (
          <div className={styles.soloArenaPanel}>
            <div>
              <strong>Təsadüfi 1v1 XP döyüşü</strong>
              <span>İttifaqsız oyunçular: qalib 50, digər oyunçu 10 XP. Gündə maksimum 100 XP.</span>
            </div>
            {activeAlliance ? (
              <button type="button" className={styles.soloArenaButton} disabled>
                Yalnız ittifaqsız oyunçular
              </button>
            ) : (
              <button type="button" className={styles.soloArenaButton} disabled={busy} onClick={() => void startSearch()}>
                {busy ? 'Axtarılır…' : 'Rəqib tap və döyüş'}
              </button>
            )}
          </div>
        )}
        {error ? <p className={styles.soloArenaError}>{error}</p> : null}
      </section>
      <GameTable open={tableOpen} onClose={closeTable} matchId={queue.matchId} playerId={userId} />
    </>
  );
}
