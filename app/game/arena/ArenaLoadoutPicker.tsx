"use client";

import { useEffect, useMemo, useState } from 'react';
import { ARENA_CARD_CATALOG, ARENA_LOADOUT_SIZE } from './match/catalog';
import { lockArenaLoadout } from './match/matchService';
import { listenServerClock } from '@/app/lib/battlePlay/battleServerClock';
import styles from '../table/gameTable.module.css';

export default function ArenaLoadoutPicker({
  matchId,
  playerId,
  submitLabel = 'Hücum',
  onLocked,
}: {
  matchId: string;
  playerId: string;
  submitLabel?: string;
  onLocked?: () => void;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const ready = selected.length === ARENA_LOADOUT_SIZE && !busy;

  useEffect(() => listenServerClock(() => {}), []);

  function toggle(id: string) {
    setError(null);
    setSelected((prev) => {
      if (prev.includes(id)) return prev.filter((item) => item !== id);
      if (prev.length >= ARENA_LOADOUT_SIZE) return prev;
      return [...prev, id];
    });
  }

  async function confirm() {
    if (!ready) return;
    setBusy(true);
    setError(null);
    try {
      await lockArenaLoadout({ matchId, playerId, cardIds: selected });
      onLocked?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kartlar saxlanılmadı');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={styles.loadout} aria-label="5 kart seçimi">
      <p className={styles.loadoutTitle}>
        13 kartdan {ARENA_LOADOUT_SIZE} seç ({selected.length}/{ARENA_LOADOUT_SIZE})
      </p>
      <div className={styles.loadoutGrid}>
        {ARENA_CARD_CATALOG.map((card) => {
          const on = selectedSet.has(card.id);
          return (
            <button
              key={card.id}
              type="button"
              onClick={() => toggle(card.id)}
              className={`${styles.loadoutCard} ${on ? styles.loadoutCardOn : ''}`}
            >
              <div className={styles.loadoutArt}>
                {card.image ? (
                  <img src={card.image} alt="" draggable={false} />
                ) : (
                  <span>{card.emoji}</span>
                )}
              </div>
              <span className={styles.loadoutName}>{card.title}</span>
              <span className={styles.loadoutCost}>⚡ {card.cost}</span>
            </button>
          );
        })}
      </div>
      {error ? <p className={styles.loadoutError}>{error}</p> : null}
      <button type="button" disabled={!ready} onClick={() => void confirm()} className={styles.primaryBtn}>
        {busy ? 'Yazılır…' : submitLabel}
      </button>
    </section>
  );
}
