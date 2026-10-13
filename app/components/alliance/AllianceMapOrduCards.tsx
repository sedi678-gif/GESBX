"use client";

import React, { useState } from 'react';
import { useAllianceBrain } from './AllianceBrainContext';
import ModelCardsGrid from './ModelCardsGrid';
import AllianceMapRoundBtn from './AllianceMapRoundBtn';
import AllianceMapSheet from './AllianceMapSheet';
import { IconMapCards } from './AllianceMapIcons';
import styles from './alliance.module.css';

interface AllianceMapOrduCardsProps {
  variant?: 'inline' | 'sheet';
}

export function AllianceMapOrduCardsContent({ sheetMode = false }: { sheetMode?: boolean }) {
  const { activeAlliance } = useAllianceBrain();

  if (!activeAlliance) {
    return <p className={styles.mapOrduCardsEmpty}>Kartlar üçün ittifaqda olmalısan.</p>;
  }

  return (
    <div className={`${styles.mapOrduCardsBody} ${sheetMode ? styles.mapOrduCardsBodySheet : ''}`}>
      <ModelCardsGrid />
    </div>
  );
}

export default function AllianceMapOrduCards({ variant = 'inline' }: AllianceMapOrduCardsProps) {
  const { activeAlliance } = useAllianceBrain();
  const [sheetOpen, setSheetOpen] = useState(false);

  if (variant === 'sheet') {
    return (
      <>
        <AllianceMapRoundBtn
          icon={<IconMapCards />}
          label="Kartlar"
          onClick={() => setSheetOpen(true)}
          disabled={!activeAlliance}
          title={!activeAlliance ? 'Kartlar üçün ittifaqda olmalısan' : 'Kartlar'}
          active={sheetOpen}
        />
        <AllianceMapSheet
          open={sheetOpen}
          onClose={() => setSheetOpen(false)}
          title="Kartlar"
          icon={<IconMapCards />}
        >
          <AllianceMapOrduCardsContent sheetMode />
        </AllianceMapSheet>
      </>
    );
  }

  if (!activeAlliance) {
    return (
      <div className={`${styles.mapOrduCardsPanel} ${styles.glass}`}>
        <p className={styles.mapOrduCardsEmpty}>Kartlar üçün ittifaqda olmalısan.</p>
      </div>
    );
  }

  return (
    <div className={`${styles.mapOrduCardsPanel} ${styles.glass}`}>
      <AllianceMapOrduCardsContent />
    </div>
  );
}
