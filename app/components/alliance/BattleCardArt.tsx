"use client";

import React, { useEffect, useState } from 'react';
import { BattleCardId } from './types';
import { getBattleCardAsset } from './battleCardAssets';
import { formatCardCount, isUnlimitedStock } from './battleCardsConfig';
import { CANVAS_RENDERED_CARDS, renderBattleCardCanvas } from './battleCardCanvasRenderer';
import BattleCardIcon from './BattleCardIcon';
import styles from './battleCardArt.module.css';

type BattleCardArtSize = 'thumb' | 'md' | 'full';

interface BattleCardArtProps {
  id: BattleCardId;
  size?: BattleCardArtSize;
  count?: number;
  selected?: boolean;
  disabled?: boolean;
  selectable?: boolean;
  className?: string;
  onClick?: () => void;
}

export default function BattleCardArt({
  id,
  size = 'thumb',
  count,
  selected = false,
  disabled = false,
  selectable = false,
  className = '',
  onClick,
}: BattleCardArtProps) {
  const asset = getBattleCardAsset(id);
  const useCanvas = CANVAS_RENDERED_CARDS.includes(id);
  const [src, setSrc] = useState<string>(useCanvas ? '' : asset.image);
  const [imgFailed, setImgFailed] = useState(false);

  useEffect(() => {
    if (useCanvas) {
      const dataUrl = renderBattleCardCanvas(id);
      if (dataUrl) setSrc(dataUrl);
      return;
    }
    setSrc(asset.image);
    setImgFailed(false);
  }, [id, useCanvas, asset.image]);

  const sizeClass =
    size === 'full' ? styles.cardArtFull : size === 'md' ? styles.cardArtMd : styles.cardArtThumb;

  const artClasses = [
    styles.cardArt,
    sizeClass,
    selectable ? styles.cardArtSelectable : '',
    selected ? styles.cardArtSelected : '',
    disabled ? styles.cardArtDisabled : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  const imageNode =
    !src || imgFailed ? (
      <div className={`${styles.cardArtFallback} ${sizeClass}`}>
        <BattleCardIcon id={id} size={size === 'full' ? 64 : size === 'md' ? 52 : 48} threeD />
      </div>
    ) : (
      <img
        src={src}
        alt={asset.title}
        className={artClasses}
        loading="lazy"
        onError={() => setImgFailed(true)}
      />
    );

  const badge =
    typeof count === 'number' && count > 0 ? (
      <span className={styles.cardArtBadge}>{isUnlimitedStock(count) ? '∞' : `×${formatCardCount(count)}`}</span>
    ) : null;

  if (onClick || selectable) {
    return (
      <div className={styles.cardArtWrap}>
        {badge}
        <button
          type="button"
          onClick={onClick}
          disabled={disabled}
          aria-label={asset.title}
          style={{ border: 'none', background: 'none', padding: 0, cursor: disabled ? 'not-allowed' : 'pointer', width: '100%' }}
        >
          {imageNode}
        </button>
      </div>
    );
  }

  return (
    <div className={styles.cardArtWrap}>
      {badge}
      {imageNode}
    </div>
  );
}
