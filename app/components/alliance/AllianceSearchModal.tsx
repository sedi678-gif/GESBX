"use client";

import React, { useState } from 'react';
import { AllianceData } from './types';
import { useAllianceBrain } from './AllianceBrainContext';
import styles from './alliance.module.css';

interface AllianceSearchModalProps {
  open: boolean;
  onClose: () => void;
  alliances: AllianceData[];
  activeAlliance: AllianceData | null;
  regions: string[];
  onJoinAlliance: (alliance: AllianceData) => void;
  onSelectAlliance: (alliance: AllianceData) => void;
}

export default function AllianceSearchModal({
  open,
  onClose,
  alliances,
  activeAlliance,
  regions,
  onJoinAlliance,
  onSelectAlliance,
}: AllianceSearchModalProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [regionFilter, setRegionFilter] = useState('Hamısı');
  const { notifyAllianceInfoViewed } = useAllianceBrain();

  if (!open) return null;

  const filteredAlliances = alliances.filter((item) => {
    const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase().trim());
    const matchesRegion = regionFilter === 'Hamısı' || item.region === regionFilter;
    return matchesSearch && matchesRegion;
  });

  const handleSelect = (item: AllianceData) => {
    notifyAllianceInfoViewed(item);
    onSelectAlliance(item);
  };

  return (
    <div className={styles.searchModalOverlay} onClick={onClose} role="presentation">
      <div
        className={`${styles.searchModal} ${styles.glass}`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="İttifaq axtar"
      >
        <div className={styles.searchModalHeader}>
          <span>🔍 İttifaq Axtar</span>
          <button type="button" className={styles.searchModalClose} onClick={onClose} aria-label="Bağla">
            ✕
          </button>
        </div>

        <div className={styles.searchModalBody}>
          <div className={styles.searchModalInputs}>
            <input
              type="search"
              placeholder="Klan adını yazın..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              autoFocus
            />
            <select value={regionFilter} onChange={(e) => setRegionFilter(e.target.value)}>
              <option value="Hamısı">Bütün rayonlar</option>
              {regions.map((reg) => (
                <option key={reg} value={reg}>
                  {reg}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.searchResults}>
            {filteredAlliances.length === 0 ? (
              <p className={styles.searchEmpty}>Heç bir ittifaq tapılmadı.</p>
            ) : (
              filteredAlliances.map((item) => (
                <div key={item.id} className={styles.searchResultItem}>
                  <button
                    type="button"
                    className={styles.searchResultMain}
                    onClick={() => handleSelect(item)}
                  >
                    <strong>🛡️ {item.name}</strong>
                    <span>
                      📍 {item.region} · Lider: {item.leader} · {item.members?.length || 0} üzv
                    </span>
                  </button>
                  {!activeAlliance && (
                    <button
                      type="button"
                      className={styles.searchJoinBtn}
                      onClick={() => onJoinAlliance(item)}
                    >
                      Qoşul
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
