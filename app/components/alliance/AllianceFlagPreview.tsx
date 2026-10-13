"use client";

import React from 'react';
import { AllianceFlagConfig } from './types';
import styles from './alliance.module.css';

interface AllianceFlagPreviewProps {
  flag: AllianceFlagConfig;
  size?: 'sm' | 'md' | 'lg' | 'hub';
  wave?: boolean;
}

const WAVE_STRIPS = 16;

function FlagFace({
  flag,
  sizeClass,
  extraClass,
}: {
  flag: AllianceFlagConfig;
  sizeClass: string;
  extraClass?: string;
}) {
  const hasImage = Boolean(flag.imageUrl);
  const shape = flag.shape ?? 'rect';
  return (
    <div
      className={`${styles.allianceFlagPreview} ${sizeClass} ${hasImage ? styles.allianceFlagPreviewImage : ''} ${extraClass ?? ''}`}
      style={
        {
          '--flag-bg': flag.backgroundColor,
          '--flag-accent': flag.accentColor,
          '--flag-third': flag.thirdColor || '#f8fafc',
        } as React.CSSProperties
      }
      data-pattern={hasImage ? undefined : flag.pattern}
      data-shape={shape}
      aria-hidden
    >
      {hasImage ? (
        <img src={flag.imageUrl} alt="" className={styles.allianceFlagPreviewImg} draggable={false} />
      ) : (
        <span className={styles.allianceFlagPreviewEmblem}>{flag.emblem}</span>
      )}
    </div>
  );
}

export default function AllianceFlagPreview({ flag, size = 'md', wave = false }: AllianceFlagPreviewProps) {
  const sizeClass =
    size === 'lg'
      ? styles.allianceFlagPreviewLg
      : size === 'sm'
        ? styles.allianceFlagPreviewSm
        : size === 'hub'
          ? styles.allianceFlagPreviewHub
          : '';

  if (!wave) {
    return <FlagFace flag={flag} sizeClass={sizeClass} />;
  }

  const shape = flag.shape ?? 'rect';

  return (
    <div className={`${styles.allianceFlagWaveMount} ${sizeClass}`} data-shape={shape}>
      <span className={styles.allianceFlagPole} aria-hidden />
      <div className={styles.allianceFlagCloth} data-shape={shape} style={{ '--n': WAVE_STRIPS } as React.CSSProperties}>
        {Array.from({ length: WAVE_STRIPS }, (_, i) => (
          <div
            key={i}
            className={styles.allianceFlagStrip}
            style={{ '--i': i, '--n': WAVE_STRIPS } as React.CSSProperties}
          >
            <div className={styles.allianceFlagStripFace}>
              <FlagFace flag={flag} sizeClass={sizeClass} extraClass={styles.allianceFlagStripFlag} />
            </div>
            <span className={styles.allianceFlagStripShade} />
          </div>
        ))}
      </div>
    </div>
  );
}
