"use client";

import AllianceMapRoundBtn from './AllianceMapRoundBtn';
import { IconMapFortress, IconMapGlobe } from './AllianceMapIcons';
import styles from './alliance.module.css';

interface AllianceMapRightPanelProps {
  mapOpen: boolean;
  onToggleMap: () => void;
}

export default function AllianceMapRightPanel({ mapOpen, onToggleMap }: AllianceMapRightPanelProps) {
  return (
    <aside className={styles.allianceMapRight}>
      <div className={styles.mapRoundBtnRow}>
        <AllianceMapRoundBtn
          icon={mapOpen ? <IconMapFortress /> : <IconMapGlobe />}
          label={mapOpen ? 'Qala' : 'Xəritə'}
          onClick={onToggleMap}
          active={mapOpen}
          title={mapOpen ? 'Qalaya qayıt' : 'Xəritəni aç'}
        />
      </div>
    </aside>
  );
}
