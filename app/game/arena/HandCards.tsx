"use client";

import CardPlaceholder from './CardPlaceholder';
import type { ArenaHandCardView } from './types';
import styles from '../table/gameTable.module.css';

interface HandCardsProps {
  cards: ArenaHandCardView[];
  onPlay?: (cardId: string) => void;
}

export default function HandCards({ cards, onPlay }: HandCardsProps) {
  const shown = cards.slice(0, 5);
  const empties = Math.max(0, 5 - shown.length);

  return (
    <section className={styles.cards} aria-label="Kart əli">
      {shown.map((card) => (
        <CardPlaceholder key={card.id} card={card} onPlay={onPlay} />
      ))}
      {Array.from({ length: empties }, (_, index) => (
        <div key={`empty-hand-${index}`} className={styles.emptyCard} />
      ))}
    </section>
  );
}
