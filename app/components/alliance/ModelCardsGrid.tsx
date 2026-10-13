"use client";

import React, { useMemo, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { MODEL_CARD_DEFS, ModelCardDef, modelCardImageUrl } from './modelCardsCatalog';
import styles from './alliance.module.css';

interface LoadedCard {
  def: ModelCardDef;
  title: string;
  body: string;
  image: string;
}

function ModelCardFace({ card }: { card: LoadedCard }) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div className={styles.modelCardFallback} style={{ ['--card-accent' as string]: card.def.accent }}>
        <span className={styles.modelCardFallbackEmoji}>{card.def.emoji}</span>
      </div>
    );
  }

  return (
    <img
      src={card.image}
      alt={card.title}
      className={styles.modelCardImg}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}

function ModelCardInfoModal({
  card,
  onClose,
}: {
  card: LoadedCard;
  onClose: () => void;
}) {
  const [target, setTarget] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setTarget(document.body);
  }, []);

  if (!target) return null;

  return createPortal(
    <div className={styles.modelCardInfoOverlay} onClick={onClose} role="presentation">
      <div
        className={styles.modelCardInfoSheet}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={card.title}
      >
        <div className={styles.modelCardInfoHead}>
          <h3>{card.title}</h3>
          <button type="button" className={styles.modelCardInfoClose} onClick={onClose} aria-label="Bağla">
            ✕
          </button>
        </div>
        <p className={styles.modelCardInfoBody}>{card.body}</p>
      </div>
    </div>,
    target
  );
}

function toLoadedCard(def: ModelCardDef): LoadedCard {
  return {
    def,
    title: def.title,
    body: def.info,
    image: modelCardImageUrl(def),
  };
}

export default function ModelCardsGrid() {
  const cards = useMemo(() => MODEL_CARD_DEFS.map(toLoadedCard), []);
  const [infoId, setInfoId] = useState<string | null>(null);
  const infoCard = infoId ? cards.find((card) => card.def.id === infoId) ?? null : null;

  return (
    <>
      <div className={styles.mapCardsGrid}>
        {cards.map((card) => (
          <div key={card.def.id} className={styles.mapCardItem}>
            <div className={styles.modelCardArtWrap}>
              <ModelCardFace card={card} />
              <button
                type="button"
                className={styles.modelCardInfoBtn}
                onClick={() => setInfoId(card.def.id)}
                title={`${card.title} məlumatı`}
                aria-label={`${card.title} məlumatı`}
              >
                i
              </button>
            </div>
            <span className={styles.mapCardName}>{card.title}</span>
          </div>
        ))}
      </div>
      {infoCard ? <ModelCardInfoModal card={infoCard} onClose={() => setInfoId(null)} /> : null}
    </>
  );
}
