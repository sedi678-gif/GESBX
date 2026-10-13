"use client";

import React from 'react';
import { AllianceData, PlayerProfile } from './types';
import styles from './alliance.module.css';

interface AllianceCastleHudProps {
  alliances: AllianceData[];
  players: PlayerProfile[];
  currentUserId: string;
  currentUserName: string;
  activeAlliance: AllianceData | null;
  onAdReward?: () => void;
}

export default function AllianceCastleHud(_props: AllianceCastleHudProps) {
  return (
    <div className={styles.castleHudLayer}>
      <div className={styles.castleHudLeft}>
        <h1 className={styles.castleBrandTitle}>YOLÜSTÜ</h1>
      </div>
    </div>
  );
}
