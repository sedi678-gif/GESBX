"use client";

import React, { useEffect, useState } from 'react';
import { AllianceData, BattleCardId } from './types';
import { BATTLE_CARD_DEFS, isUnlimitedStock } from './battleCardsConfig';
import BattleCardArt from './BattleCardArt';
import { getBattleCardAsset } from './battleCardAssets';
import { launchAllianceAttack, CARD_POWER } from '@/app/lib/allianceBattleService';
import {
  computeClickRaidClicksRequired,
  computeClickRaidDamage,
  getClickRaidConfig,
  isClickRaidCard,
  type ClickRaidCardId,
} from '@/app/lib/clickRaidLogic';
import { incrementQuestProgress } from '@/app/lib/allianceQuestService';
import { withAllianceMapCoords } from './regionCoords';
import { useAllianceBrain } from './AllianceBrainContext';
import styles from './alliance.module.css';

interface AllianceAttackModalProps {
  open: boolean;
  onClose: () => void;
  alliances: AllianceData[];
  myAlliance: AllianceData;
  userId: string;
  userName: string;
  battleCards: Record<BattleCardId, number>;
  onSuccess: (msg: string, target?: AllianceData) => void;
  onTargetChange?: (targetId: string | null) => void;
}

type CardSelection = Partial<Record<BattleCardId, number>>;

const MAX_PER_CARD = 10;

export default function AllianceAttackModal({
  open,
  onClose,
  alliances,
  myAlliance,
  userId,
  userName,
  battleCards,
  onSuccess,
  onTargetChange,
}: AllianceAttackModalProps) {
  const { registerBattleAttack, setFocusAllianceId } = useAllianceBrain();
  const [targetId, setTargetId] = useState('');
  const [selection, setSelection] = useState<CardSelection>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) {
      setTargetId('');
      setSelection({});
      setLoading(false);
      onTargetChange?.(null);
    }
  }, [open, onTargetChange]);

  const selectedEntries = (Object.entries(selection) as [BattleCardId, number][]).filter(
    ([, count]) => (count ?? 0) > 0
  );

  if (!open) return null;

  const targets = alliances.filter((a) => a.id !== myAlliance.id);
  const targetAlliance = targets.find((a) => a.id === targetId);
  const targetMembers = targetAlliance?.members?.length ?? 1;

  const hasClickRaid = selectedEntries.some(([id]) => isClickRaidCard(id));
  const hasInstant = selectedEntries.some(([id]) => !isClickRaidCard(id));

  const totalPower = selectedEntries.reduce(
    (sum, [id, count]) => sum + CARD_POWER[id] * count,
    0
  );

  const canAttack =
    !!targetId &&
    selectedEntries.length > 0 &&
    selectedEntries.every(([id, count]) => (battleCards[id] ?? 0) >= count) &&
    !loading;

  const toggleCard = (id: BattleCardId) => {
    const owned = battleCards[id] ?? 0;
    if (owned < 1 && !isUnlimitedStock(owned)) return;

    setSelection((prev) => {
      const next = { ...prev };
      if (next[id]) {
        delete next[id];
      } else {
        next[id] = 1;
      }
      return next;
    });
  };

  const setCardCount = (id: BattleCardId, delta: number) => {
    const owned = battleCards[id] ?? 0;
    setSelection((prev) => {
      const current = prev[id] ?? 0;
      const nextCount = Math.min(MAX_PER_CARD, Math.max(0, current + delta), owned);
      const next = { ...prev };
      if (nextCount <= 0) delete next[id];
      else next[id] = nextCount;
      return next;
    });
  };

  const handleAttack = async () => {
    if (!targetId) {
      alert('Hədəf ittifaq seç');
      return;
    }
    if (selectedEntries.length === 0) {
      alert('Ən azı bir kart seç');
      return;
    }

    for (const [id, count] of selectedEntries) {
      if ((battleCards[id] ?? 0) < count) {
        alert(`${getBattleCardAsset(id).title} üçün kifayət qədər kart yoxdur`);
        return;
      }
    }

    setLoading(true);
    try {
      const mapAlliances = withAllianceMapCoords(alliances);
      const myPos = mapAlliances.find((a) => a.id === myAlliance.id);
      const defender = mapAlliances.find((a) => a.id === targetId);
      const coords =
        myPos && defender
          ? {
              attackerLat: myPos.lat,
              attackerLng: myPos.lng,
              defenderLat: defender.lat,
              defenderLng: defender.lng,
            }
          : undefined;

      const launched: string[] = [];
      let totalDamage = 0;

      for (const [cardId, cardCount] of selectedEntries) {
        const { damage, attack } = await launchAllianceAttack(
          userId,
          userName,
          myAlliance.id,
          targetId,
          cardId,
          cardCount,
          coords
        );
        registerBattleAttack(attack);
        totalDamage += damage;

        if (isClickRaidCard(cardId)) {
          const cfg = getClickRaidConfig(cardId);
          launched.push(`${cfg.emoji} ${cfg.label}`);
        }
      }

      if (defender) setFocusAllianceId(defender.id);
      await incrementQuestProgress(myAlliance.id, 'attack', selectedEntries.length);

      let msg: string;
      if (launched.length > 0 && totalDamage > 0) {
        msg = `⚔️ ${totalDamage} zərər + ${launched.length} raid: ${launched.join(', ')}`;
      } else if (launched.length > 0) {
        msg = `🚀 ${launched.length} hücum başladı: ${launched.join(', ')}. Xəritədə personajlar görünəcək.`;
      } else {
        msg = `⚔️ Hücum uğurdu! ${totalDamage} zərər vuruldu.`;
      }

      onSuccess(msg, defender ?? alliances.find((a) => a.id === targetId));
      setSelection({});
      if (!hasClickRaid) onClose();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Xəta');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.searchModalOverlay} onClick={onClose}>
      <div
        className={`${styles.attackModal} ${styles.glass}`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="İttifaq hücumu"
      >
        <div className={styles.searchModalHeader}>
          <span>⚔️ İTTİFAQ HÜCUMU</span>
          <button type="button" className={styles.searchModalClose} onClick={onClose}>
            ✕
          </button>
        </div>

        <div className={styles.attackModalBody}>
          <p className={styles.attackModalHint}>
            🏰 Birdən çox fərqli kart seçə bilərsən — hər biri xəritədə ayrı personaj kimi görünəcək
          </p>

          <label className={styles.attackModalLabel} htmlFor="attack-target">
            Hədəf qala
          </label>
          <select
            id="attack-target"
            value={targetId}
            onChange={(e) => {
              const id = e.target.value || null;
              setTargetId(e.target.value);
              onTargetChange?.(id);
            }}
            className={styles.attackModalSelect}
          >
            <option value="">🎯 Hədəf qala seç...</option>
            {targets.map((a) => (
              <option key={a.id} value={a.id}>
                🏰 {a.name} ({a.region}) — {a.score} xal
              </option>
            ))}
          </select>

          {targetId && (
            <p className={styles.attackModalTargetHint}>🎯 Xəritədə hədəf qala işıqlanır</p>
          )}

          <div className={styles.battleCardsGrid}>
            {BATTLE_CARD_DEFS.map((def) => {
              const cardOwned = battleCards[def.id] ?? 0;
              const asset = getBattleCardAsset(def.id);
              const selectedCount = selection[def.id] ?? 0;
              const isSelected = selectedCount > 0;

              return (
                <div key={def.id} className={styles.battleCardPickWrap}>
                  <BattleCardArt
                    id={def.id}
                    size="md"
                    count={cardOwned}
                    selected={isSelected}
                    selectable
                    disabled={cardOwned < 1}
                    onClick={() => toggleCard(def.id)}
                  />
                  <div className={styles.battleCardName}>{asset.title}</div>
                  <div className={styles.battleCardPower}>
                    {isClickRaidCard(def.id)
                      ? getClickRaidConfig(def.id).emoji
                      : `⚡${CARD_POWER[def.id]}`}
                  </div>
                  {isSelected && (
                    <div className={styles.attackCardCountRow}>
                      <button
                        type="button"
                        className={styles.attackCardCountBtn}
                        onClick={() => setCardCount(def.id, -1)}
                        aria-label="Azalt"
                      >
                        −
                      </button>
                      <span className={styles.attackCardCountVal}>{selectedCount}</span>
                      <button
                        type="button"
                        className={styles.attackCardCountBtn}
                        onClick={() => setCardCount(def.id, 1)}
                        disabled={selectedCount >= Math.min(MAX_PER_CARD, cardOwned)}
                        aria-label="Artır"
                      >
                        +
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {selectedEntries.length > 0 && targetId && (
            <div className={styles.attackModalMutantPreview}>
              <p>
                <strong>{selectedEntries.length}</strong> növ kart seçildi
                {hasInstant && <> · instant güc: <strong>{totalPower}</strong></>}
              </p>
              {selectedEntries
                .filter(([id]) => isClickRaidCard(id))
                .map(([id, count]) => {
                  const cfg = getClickRaidConfig(id as ClickRaidCardId);
                  const dmg = computeClickRaidDamage(id as ClickRaidCardId, targetMembers);
                  const clicks = computeClickRaidClicksRequired(id as ClickRaidCardId, targetMembers);
                  return (
                    <p key={id}>
                      {cfg.emoji} {count}× {cfg.label}: {cfg.amountLabel} {dmg}, {clicks} klik (
                      {Math.round(cfg.raidMs / 1000)}s)
                    </p>
                  );
                })}
            </div>
          )}
        </div>

        <div className={styles.attackModalFooter}>
          {!targetId && <p className={styles.attackModalWarn}>Hədəf qala seçməlisən</p>}
          {targetId && selectedEntries.length === 0 && (
            <p className={styles.attackModalWarn}>Ən azı bir kart seç</p>
          )}
          {selectedEntries.some(([id, count]) => (battleCards[id] ?? 0) < count) && (
            <p className={styles.attackModalWarn}>Seçilmiş kartlardan bəzilərində kifayət qədər yoxdur</p>
          )}
          <button
            type="button"
            className={styles.attackModalSubmitBtn}
            disabled={!canAttack}
            onClick={handleAttack}
          >
            {loading
              ? 'Hücum edilir...'
              : selectedEntries.length > 1
                ? `🚀 ${selectedEntries.length} KARTLA HÜCUM ET`
                : '🚀 HÜCUM ET'}
          </button>
          {hasClickRaid && (
            <p className={styles.attackModalHint} style={{ marginTop: 8, textAlign: 'center' }}>
              Raid kartları göndərdikdən sonra yenidən kart seçib hücum edə bilərsən
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
