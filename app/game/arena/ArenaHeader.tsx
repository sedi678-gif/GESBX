"use client";

import type { ArenaViewModel } from './types';
import styles from '../table/gameTable.module.css';

interface ArenaHeaderProps {
  view: ArenaViewModel;
  onClose: () => void;
}

export default function ArenaHeader({ view, onClose }: ArenaHeaderProps) {
  return (
    <header className={styles.header}>
      <button type="button" onClick={onClose} className={styles.close} aria-label="Bağla">
        ✕
      </button>
      <div className={styles.vsLine}>
        <span className={styles.awayName}>{view.awayAllianceName}</span>
        <span className={styles.vsChip}>VS</span>
        <span className={styles.homeName}>{view.homeAllianceName}</span>
      </div>
      <div className={styles.meta}>
        <div className={styles.chip}>{view.timer.label}</div>
        <div className={styles.chip}>{view.energy.label}</div>
      </div>
    </header>
  );
}
