"use client";

import React, { useMemo } from 'react';
import Link from 'next/link';
import { AllianceData, BattleCard, PlayerProfile } from './types';
import ModelCardsGrid from './ModelCardsGrid';
import { formatCardTotal } from './battleCardsConfig';
import styles from './alliance.module.css';

interface AllianceOrduCardsPanelProps {
  open: boolean;
  onClose: () => void;
  tab: 'ordu' | 'cards';
  onTabChange: (tab: 'ordu' | 'cards') => void;
  activeAlliance: AllianceData;
  players: PlayerProfile[];
  battleCards: BattleCard[];
  currentUserId: string;
  onAttack?: () => void;
  canAttack?: boolean;
}

export default function AllianceOrduCardsPanel({
  open,
  onClose,
  tab,
  onTabChange,
  activeAlliance,
  players,
  battleCards,
  currentUserId,
  onAttack,
  canAttack,
}: AllianceOrduCardsPanelProps) {
  const orduMembers = useMemo(() => {
    const memberIds = activeAlliance.members ?? [];
    return memberIds.map((id) => {
      const p = players.find((pl) => pl.odId === id);
      return {
        id,
        name: p?.displayName || id,
        score: p?.score ?? 0,
        isLeader: activeAlliance.leaderId === id,
        isMe: id === currentUserId,
      };
    });
  }, [activeAlliance, players, currentUserId]);

  const orduPower = orduMembers.reduce((s, m) => s + m.score, 0);
  const cardTotal = formatCardTotal(battleCards);

  if (!open) return null;

  return (
    <div className={styles.searchModalOverlay} onClick={onClose} role="presentation">
      <div
        className={`${styles.battleCardsModal} ${styles.glass} ${styles.orduCardsModal}`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Ordu və kartlar"
      >
        <div className={styles.searchModalHeader}>
          <span>🛡️ {activeAlliance.name}</span>
          <button type="button" className={styles.searchModalClose} onClick={onClose} aria-label="Bağla">
            ✕
          </button>
        </div>

        <div className={styles.orduCardsTabs}>
          <button
            type="button"
            className={`${styles.orduCardsTab} ${tab === 'ordu' ? styles.orduCardsTabActive : ''}`}
            onClick={() => onTabChange('ordu')}
          >
            ⚔️ Ordu ({orduMembers.length})
          </button>
          <button
            type="button"
            className={`${styles.orduCardsTab} ${tab === 'cards' ? styles.orduCardsTabActive : ''}`}
            onClick={() => onTabChange('cards')}
          >
            🎴 Kartlarım ({cardTotal})
          </button>
        </div>

        {tab === 'ordu' ? (
          <div className={styles.orduPanelBody}>
            <p className={styles.orduPanelIntro}>
              İttifaq ordusu — üzvlər və ümumi güc. Kartlar ayrıca &quot;Kartlarım&quot; bölməsindədir.
            </p>
            <div className={styles.orduStatsRow}>
              <span>👥 {orduMembers.length} döyüşçü</span>
              <span>⚡ {orduPower} ümumi güc</span>
              <span>🏆 {activeAlliance.score} xal</span>
            </div>
            <div className={styles.orduMemberList}>
              {orduMembers.length === 0 ? (
                <p className={styles.orduEmpty}>Ordu boşdur — üzv dəvət et.</p>
              ) : (
                orduMembers.map((m) => (
                  <div key={m.id} className={styles.orduMemberRow}>
                    <div>
                      <strong>
                        {m.isMe ? 'Sən' : m.name}
                        {m.isLeader ? ' 👑' : ''}
                      </strong>
                      <span className={styles.orduMemberMeta}>ID {m.id}</span>
                    </div>
                    <span className={styles.orduMemberScore}>{m.score} güc</span>
                  </div>
                ))
              )}
            </div>
          </div>
        ) : (
          <div className={styles.orduPanelBody}>
            <p className={styles.orduPanelIntro}>
              Şəxsi döyüş kartların — mağazadan al, hücumda istifadə et.
            </p>
            <ModelCardsGrid />
            <div className={styles.battleCardsTotal}>
              Cəmi kart: <strong>{cardTotal}</strong>
            </div>
            {cardTotal === '0' && (
              <Link href="/shop" className={styles.searchModalJoinBtn} style={{ display: 'block', textAlign: 'center', textDecoration: 'none' }}>
                🛒 Mağazadan kart al
              </Link>
            )}
            {canAttack && onAttack && cardTotal !== '0' && (
              <button type="button" className={styles.searchModalJoinBtn} onClick={onAttack}>
                🚀 İttifaq hücumu başlat
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
