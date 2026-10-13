"use client";

import React from 'react';
import { BattleCardId } from './types';
import styles from './alliance.module.css';

interface BattleCardIconProps {
  id: BattleCardId;
  size?: number;
  threeD?: boolean;
}

export default function BattleCardIcon({ id, size = 40, threeD = false }: BattleCardIconProps) {
  const common = { width: size, height: size, viewBox: '0 0 48 48', fill: 'none' as const };

  const svg = (() => {
    switch (id) {
      case 'zombi':
        return (
          <svg {...common} className={`${styles.liveCardIcon} ${styles.liveCardZombi}`} aria-hidden="true">
            <ellipse cx="24" cy="28" rx="15" ry="17" fill="#4ade80" />
            <circle cx="18" cy="22" r="3.5" fill="#14532d" />
            <circle cx="30" cy="22" r="3.5" fill="#14532d" />
          </svg>
        );
      case 'yarasa':
        return (
          <svg {...common} className={`${styles.liveCardIcon} ${styles.liveCardYarasa}`} aria-hidden="true">
            <path
              d="M24 28 C18 22 8 18 6 26 C10 24 14 26 16 30 C12 28 8 30 6 34 C12 32 18 34 24 38 C30 34 36 32 42 34 C40 30 36 28 32 30 C34 26 38 24 42 26 C40 18 30 22 24 28 Z"
              fill="#818cf8"
            />
            <circle cx="24" cy="26" r="4.5" fill="#312e81" />
          </svg>
        );
      case 'duman':
        return (
          <svg {...common} className={`${styles.liveCardIcon} ${styles.liveCardDuman}`} aria-hidden="true">
            <circle cx="18" cy="30" r="9" fill="#94a3b8" opacity="0.65" />
            <circle cx="28" cy="25" r="11" fill="#e2e8f0" opacity="0.75" />
            <circle cx="34" cy="32" r="8" fill="#94a3b8" opacity="0.55" />
          </svg>
        );
      case 'mutant':
        return (
          <svg {...common} className={styles.liveCardIcon} aria-hidden="true">
            <circle cx="24" cy="24" r="18" fill="#166534" />
            <text x="24" y="30" textAnchor="middle" fontSize="16">
              ☢
            </text>
          </svg>
        );
      case 'standing':
        return (
          <svg {...common} className={styles.liveCardIcon} aria-hidden="true">
            <circle cx="24" cy="24" r="18" fill="#312e81" />
            <text x="24" y="30" textAnchor="middle" fontSize="16">
              🧙
            </text>
          </svg>
        );
      case 'it':
        return (
          <svg {...common} className={`${styles.liveCardIcon} ${styles.liveCardIt}`} aria-hidden="true">
            <ellipse cx="24" cy="29" rx="13" ry="11" fill="#d97706" />
            <circle cx="24" cy="17" r="10" fill="#fbbf24" />
            <circle cx="20" cy="15" r="2.5" fill="#451a03" />
            <circle cx="28" cy="15" r="2.5" fill="#451a03" />
          </svg>
        );
      default:
        return null;
    }
  })();

  if (threeD) {
    return (
      <div className={styles.card3dScene}>
        <div className={styles.card3dInner}>{svg}</div>
      </div>
    );
  }

  return svg;
}
