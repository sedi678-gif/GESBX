"use client";

import { shareArenaClickEvent } from './match/matchService';
import styles from '../table/gameTable.module.css';

export default function ArenaClickerPanel({
  matchId,
  playerId,
  cardTitle,
  shareable,
  chatText,
}: {
  matchId: string;
  playerId: string;
  cardTitle: string;
  shareable: boolean;
  chatText?: string;
}) {
  return (
    <section className={styles.overlayPanel}>
      <p className={styles.overlayTitle}>{cardTitle}</p>
      <p className={styles.overlayText}>Əlinizdə həmişə Üsyan kartı var. Qul edənə qarşı oynayın.</p>
      {chatText ? <p className={styles.overlayText}>{chatText}</p> : null}
      <button
        type="button"
        disabled={!shareable}
        className={styles.primaryBtn}
        style={{ marginTop: 8 }}
        onClick={() => {
          void shareArenaClickEvent({ matchId, playerId }).catch(() => {});
        }}
      >
        İttifaq çatına göndər
      </button>
    </section>
  );
}
