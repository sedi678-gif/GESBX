"use client";

import type { ArenaHandCardView } from './types';
import styles from '../table/gameTable.module.css';

interface CardPlaceholderProps {
  card: ArenaHandCardView;
  onPlay?: (cardId: string) => void;
}

export default function CardPlaceholder({ card, onPlay }: CardPlaceholderProps) {
  const disabled = Boolean(card.disabled);
  const playable = Boolean(onPlay) && !disabled;
  const showCost = card.energyCostLabel && card.energyCostLabel !== '--';
  const showUses = card.remainingUsesLabel && card.remainingUsesLabel !== '--';

  return (
    <article className={`${styles.card} ${playable ? styles.cardPlayable : ''} ${disabled ? styles.cardDisabled : ''}`}>
      <button
        type="button"
        disabled={!playable}
        onClick={() => onPlay?.(card.id)}
        className={styles.cardBtn}
      >
        <div className={styles.cardArt}>
          {card.image ? (
            <img src={card.image} alt="" draggable={false} />
          ) : (
            <div className="flex h-full items-center justify-center text-xl">{card.emoji ?? '🃏'}</div>
          )}
        </div>
        <div className={styles.cardMeta}>
          <p className={styles.cardTitle}>{card.title.replace(/ kartı$/i, '')}</p>
          <span className={styles.cardCost}>
            {showCost ? card.energyCostLabel : ''}
            {showCost && showUses ? ' · ' : ''}
            {showUses ? card.remainingUsesLabel : ''}
          </span>
        </div>
      </button>
    </article>
  );
}
