"use client";

import React from 'react';
import { useAllianceBrain } from './AllianceBrainContext';
import { useAllianceHubBgSrc } from './useAllianceHubBg';
import styles from './alliance.module.css';

export default function AllianceCastleHome() {
  const { hubVisuals } = useAllianceBrain();
  const src = useAllianceHubBgSrc();

  return (
    <div
      className={styles.castlePixiWrap}
      style={src ? { backgroundImage: `url('${src}')` } : undefined}
      aria-label={`${hubVisuals.allianceName} qala · Lv.${hubVisuals.fortressLevel}`}
    >
      {src ? (
        <img src={src} alt="" className={styles.castleStaticImg} draggable={false} />
      ) : null}
    </div>
  );
}
