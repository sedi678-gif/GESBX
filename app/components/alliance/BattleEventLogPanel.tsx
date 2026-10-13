"use client";

import { useEffect, useMemo, useState } from 'react';
import {
  auditBattleEvents,
  listenBattleEvents,
} from '@/app/lib/battleEventLog';
import type { BattleEvent, BattleEventType } from '@/app/lib/battleEventLog/battleEventTypes';
import styles from './alliance.module.css';

const EVENT_LABELS: Record<BattleEventType, string> = {
  battle_created: 'Battle yaradıldı',
  player_joined: 'Oyunçu qoşuldu',
  player_left: 'Oyunçu çıxdı',
  loadout_locked: 'Loadout kilitləndi',
  card_played: 'Kart oynandı',
  energy_changed: 'Enerji dəyişdi',
  card_blocked: 'Kart bloklandı',
  card_countered: 'Kart əks olundu',
  click_started: 'Klik başladı',
  click_completed: 'Klik bitdi',
  damage_applied: 'Zərər tətbiq olundu',
  score_changed: 'Xal dəyişdi',
  turn_started: 'Növbə başladı',
  turn_timeout: 'Növbə vaxtı bitdi',
  battle_finished: 'Battle bitdi',
};

function formatTime(ms: number) {
  if (!ms) return 'server…';
  const date = new Date(ms);
  return date.toLocaleTimeString('az-AZ', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function formatMeta(meta: Record<string, unknown>) {
  const parts = Object.entries(meta)
    .filter(([, value]) => value != null && value !== '')
    .map(([key, value]) => `${key}:${Array.isArray(value) ? value.join(',') : String(value)}`);
  return parts.join(' · ');
}

export default function BattleEventLogPanel({ battleId }: { battleId: string }) {
  const [events, setEvents] = useState<BattleEvent[]>([]);

  useEffect(() => {
    if (!battleId) return;
    return listenBattleEvents(battleId, setEvents);
  }, [battleId]);

  const audit = useMemo(
    () => auditBattleEvents(battleId, battleId ? events : []),
    [battleId, events]
  );

  return (
    <section className={styles.eventLogBox} aria-label="Battle event log">
      <div className={styles.eventLogHead}>
        <strong>Event log</strong>
        <span data-ok={audit.contiguous ? '1' : '0'}>
          {audit.contiguous
            ? `seq 1–${audit.lastSeq ?? 0} · ${audit.eventCount}`
            : audit.duplicateSeq.length
              ? `təkrar seq · ${audit.duplicateSeq.join(',')}`
              : `seq qırıq · ${audit.missingSeq.join(',') || 'yox'}`}
        </span>
      </div>
      <p className={styles.eventLogHint}>Yalnız server yazır. Client dəyişdirə və silə bilməz.</p>
      {audit.events.length === 0 ? (
        <p className={styles.eventLogEmpty}>Hələ event yoxdur</p>
      ) : (
        <ol className={styles.eventLogList}>
          {audit.events.map((event) => {
            const meta = formatMeta(event.meta as Record<string, unknown>);
            return (
              <li key={event.eventId} className={styles.eventLogRow}>
                <div className={styles.eventLogMeta}>
                  <span className={styles.eventLogSeq}>#{event.seq}</span>
                  <span className={styles.eventLogType}>{EVENT_LABELS[event.type]}</span>
                  <time dateTime={event.createdAt ? new Date(event.createdAt).toISOString() : undefined}>
                    {formatTime(event.createdAt)}
                  </time>
                </div>
                <div className={styles.eventLogDetail}>
                  {event.playerId}
                  {meta ? ` · ${meta}` : ''}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
