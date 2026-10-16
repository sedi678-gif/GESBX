"use client";

import React, { useId } from 'react';
import { AllianceFlagConfig } from './types';
import styles from './alliance.module.css';

interface AllianceFlagPreviewProps {
  flag: AllianceFlagConfig;
  size?: 'sm' | 'md' | 'lg' | 'hub';
  wave?: boolean;
}

function FlagFace({
  flag,
  sizeClass,
  extraClass,
  filterId,
}: {
  flag: AllianceFlagConfig;
  sizeClass: string;
  extraClass?: string;
  filterId?: string;
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
          ...(filterId ? { filter: `url(#${filterId}) saturate(1.12) contrast(1.04)` } : {}),
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
  const filterId = `allianceFlagWave-${useId().replace(/:/g, '')}`;
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
      <svg className={styles.allianceFlagFilterDefs} aria-hidden="true" focusable="false">
        <defs>
          <filter id={filterId} x="-16%" y="-16%" width="132%" height="132%" colorInterpolationFilters="sRGB">
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.018 0.042"
              numOctaves="1"
              seed="7"
              result="flagWind"
            >
              <animate
                attributeName="baseFrequency"
                values="0.018 0.042;0.012 0.054;0.018 0.042"
                dur="2.8s"
                repeatCount="indefinite"
              />
            </feTurbulence>
            <feDisplacementMap in="SourceGraphic" in2="flagWind" scale="8" xChannelSelector="R" yChannelSelector="G" />
          </filter>
        </defs>
      </svg>
      <span className={styles.allianceFlagPole} aria-hidden />
      <div className={styles.allianceFlagCloth} data-shape={shape}>
        <FlagFace flag={flag} sizeClass={sizeClass} extraClass={styles.allianceFlagClothFace} filterId={filterId} />
        <span className={styles.allianceFlagClothShade} aria-hidden />
      </div>
    </div>
  );
}
