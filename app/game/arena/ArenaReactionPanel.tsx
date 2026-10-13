"use client";

import styles from '../table/gameTable.module.css';

export default function ArenaReactionPanel({
  cardTitle,
  modeLabel,
  remainingSeconds,
  currentClicks,
  requiredClicks,
  canClick,
  onClick,
}: {
  cardTitle: string;
  modeLabel: string;
  remainingSeconds: number;
  currentClicks: number;
  requiredClicks: number;
  canClick: boolean;
  onClick: () => void;
}) {
  const pct = requiredClicks > 0 ? Math.min(100, Math.round((currentClicks / requiredClicks) * 100)) : 0;
  return (
    <section className={styles.overlayPanel}>
      <p className={styles.overlayTitle}>{cardTitle}</p>
      {modeLabel ? <p className={styles.overlayText}>{modeLabel}</p> : null}
      <p className={styles.overlayText}>
        {currentClicks} / {requiredClicks} · {remainingSeconds}s
      </p>
      <div className={styles.energyTrack} style={{ marginTop: 6 }}>
        <div className={styles.energyFill} style={{ width: `${pct}%` }} />
      </div>
      <button type="button" disabled={!canClick} className={styles.primaryBtn} style={{ marginTop: 8 }} onClick={onClick}>
        Klik
      </button>
    </section>
  );
}
