"use client";

import { useEffect, useState } from 'react';
import AppBottomNav from '@/app/components/AppBottomNav';
import { useAllianceBrain } from './AllianceBrainContext';
import AllianceCastleHome from './AllianceCastleHome';
import AzerbaijanAllianceMap from './AzerbaijanAllianceMap';
import AllianceMapSidebar from './AllianceMapSidebar';
import AllianceMapRightPanel from './AllianceMapRightPanel';
import AllianceChatDock from './AllianceChatDock';
import AllianceMapBattleHost from './AllianceMapBattleHost';
import { AllianceScreenBusyProvider } from './AllianceScreenBusy';
import styles from './alliance.module.css';

function AlliancePageInner() {
  const { alliances, activeAlliance, liveBattleAttacks } = useAllianceBrain();
  const [mapOpen, setMapOpen] = useState(false);
  const [selectedAllianceId, setSelectedAllianceId] = useState<string | null>(null);

  useEffect(() => {
    const latest = liveBattleAttacks[0];
    if (!latest) return;
    if (Date.now() - latest.createdAt < 5000) setMapOpen(true);
  }, [liveBattleAttacks]);

  return (
    <div
      className={`${styles.world} ${styles.worldAllianceMap} ${styles.worldCastleHub} ${
        mapOpen ? styles.worldMapOpen : ''
      }`}
    >
      <div className={styles.allianceMapLayout}>
        <AllianceCastleHome />
        <AllianceMapSidebar />
        <AllianceMapRightPanel mapOpen={mapOpen} onToggleMap={() => setMapOpen((open) => !open)} />
        <AllianceChatDock />

        <div
          className={`${styles.allianceMapOverlay} ${mapOpen ? styles.allianceMapOverlayOpen : ''}`}
          aria-hidden={!mapOpen}
        >
          <AzerbaijanAllianceMap
            alliances={alliances}
            activeAlliance={activeAlliance}
            active={mapOpen}
            onAllianceSelect={(alliance) => {
              setMapOpen(true);
              setSelectedAllianceId(alliance.id);
            }}
          />
        </div>
      </div>
      <AllianceMapBattleHost
        selectedAllianceId={selectedAllianceId}
        onClearSelected={() => setSelectedAllianceId(null)}
      />
      <AppBottomNav activeTab="alliance" />
    </div>
  );
}

export default function AlliancePage() {
  return (
    <AllianceScreenBusyProvider>
      <AlliancePageInner />
    </AllianceScreenBusyProvider>
  );
}
