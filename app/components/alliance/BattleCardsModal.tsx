"use client";

import React from 'react';
import { BattleCard } from './types';
import BattleCardArt from './BattleCardArt';
import { formatCardTotal } from './battleCardsConfig';
import styles from './alliance.module.css';

interface BattleCardsModalProps {
  open: boolean;
  onClose: () => void;
  cards: BattleCard[];
  onAttack?: () => void;
  canAttack?: boolean;
}

export default function BattleCardsModal({ open, onClose, cards, onAttack, canAttack }: BattleCardsModalProps) {
  if (!open) return null;

  const total = formatCardTotal(cards);

  return (
    <div className={styles.searchModalOverlay} onClick={onClose} role="presentation">
      <div
        className={`${styles.battleCardsModal} ${styles.glass}`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Döyüş kartları"
      >
        <div className={styles.searchModalHeader}>
          <span>⚔️ DÖYÜŞ KARTLARI (3D)</span>
          <button type="button" className={styles.searchModalClose} onClick={onClose} aria-label="Bağla">
            ✕
          </button>
        </div>

        <div className={styles.battleCardsGrid}>
          {cards.map((card) => (
            <div key={card.id} className={styles.battleCardItem}>
              <BattleCardArt id={card.id} size="md" count={card.count} />
              <div className={styles.battleCardName}>{card.name}</div>
            </div>
          ))}
        </div>

        <div className={styles.battleCardsTotal}>
          Cəmi kart: <strong>{total}</strong>
        </div>

        {canAttack && onAttack && (total === '∞' || Number(total) > 0) && (
          <button type="button" className={styles.searchModalJoinBtn} onClick={onAttack}>
            🚀 İttifaq hücumu başlat
          </button>
        )}
      </div>
    </div>
  );
}
