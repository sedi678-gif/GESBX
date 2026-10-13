"use client";

import React from 'react';
import { useAllianceBrain } from './AllianceBrainContext';
import styles from './alliance.module.css';

export type CastleNavAction = 'map' | 'chat' | 'attack' | 'ordu' | 'search';

interface AllianceCastleActionBarProps {
  onAction: (action: CastleNavAction) => void;
  hasAlliance: boolean;
}

export default function AllianceCastleActionBar({
  onAction,
  hasAlliance,
}: AllianceCastleActionBarProps) {
  return (
    <nav className={styles.castleActionBar} aria-label="İttifaq naviqasiyası">
      <button type="button" className={styles.castleActionBtn} onClick={() => onAction('map')}>
        <span aria-hidden>🗺️</span>
        <span>Xəritə</span>
      </button>
      <button
        type="button"
        className={styles.castleActionBtn}
        onClick={() => onAction('chat')}
        disabled={!hasAlliance}
      >
        <span aria-hidden>💬</span>
        <span>Söhbət</span>
      </button>
      <button
        type="button"
        className={`${styles.castleActionBtn} ${styles.castleActionBtnAttack}`}
        onClick={() => onAction('attack')}
        disabled={!hasAlliance}
      >
        <span aria-hidden>⚔️</span>
        <span>Hücum</span>
      </button>
      <button
        type="button"
        className={styles.castleActionBtn}
        onClick={() => onAction('ordu')}
        disabled={!hasAlliance}
      >
        <span aria-hidden>🃏</span>
        <span>Ordu</span>
      </button>
      <button type="button" className={styles.castleActionBtn} onClick={() => onAction('search')}>
        <span aria-hidden>🔍</span>
        <span>Axtar</span>
      </button>
    </nav>
  );
}
