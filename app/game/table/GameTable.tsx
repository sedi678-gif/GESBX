"use client";

import { createPortal } from 'react-dom';
import { useEffect, useState } from 'react';
import ArenaScreen from '../arena/ArenaScreen';
import type { GameTableProps } from './types';
import styles from './gameTable.module.css';

export default function GameTable({ open, onClose, matchId, playerId }: GameTableProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!open || !mounted) return null;

  return createPortal(
    <div className={styles.overlay} role="dialog" aria-modal="true" aria-label="Döyüş masası">
      <div className={styles.panel}>
        <ArenaScreen onClose={onClose} matchId={matchId} playerId={playerId} />
      </div>
    </div>,
    document.body
  );
}
