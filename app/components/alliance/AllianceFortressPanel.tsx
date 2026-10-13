'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { useAllianceBrain } from './AllianceBrainContext';
import {
  FORTRESS_UPGRADE_REQUIRED_MS,
  formatFortressProgress,
  getFortressHubBgUrl,
} from '@/app/lib/allianceFortressConfig';
import { evaluateFortressEligibility } from '@/app/lib/allianceFortressService';
import AllianceMapSheet from './AllianceMapSheet';
import { IconMapFortress } from './AllianceMapIcons';
import styles from './alliance.module.css';

interface AllianceFortressPanelProps {
  open: boolean;
  onClose: () => void;
}

export default function AllianceFortressPanel({ open, onClose }: AllianceFortressPanelProps) {
  const {
    activeAlliance,
    fortressHub,
    handleUpgradeFortress,
  } = useAllianceBrain();
  const [loading, setLoading] = useState(false);

  const eligibility = useMemo(() => {
    if (!activeAlliance) return null;
    return evaluateFortressEligibility(activeAlliance, fortressHub.onlineInAlliance);
  }, [activeAlliance, fortressHub.onlineInAlliance]);

  const handleUpgrade = async () => {
    if (!eligibility?.canUpgradeFree) return;
    setLoading(true);
    try {
      await handleUpgradeFortress();
      alert(`✅ Qala ${fortressHub.nextLevelLabel ?? ''} oldu!`);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Xəta');
    } finally {
      setLoading(false);
    }
  };

  if (!activeAlliance || !eligibility) {
    return (
      <AllianceMapSheet open={open} onClose={onClose} title="Qala səviyyəsi" icon={<IconMapFortress />}>
        <p className={styles.attackModalHint}>Qala idarəetməsi üçün ittifaqda olmalısan.</p>
      </AllianceMapSheet>
    );
  }

  const req =
    eligibility.currentLevel < 6
      ? FORTRESS_UPGRADE_REQUIRED_MS[eligibility.currentLevel as 1 | 2 | 3 | 4 | 5]
      : null;

  return (
    <AllianceMapSheet open={open} onClose={onClose} title="İttifaq qalası" icon={<IconMapFortress />}>
      <div className={styles.fortressPanel}>
        <div className={styles.fortressPreviewRow}>
          <img
            src={getFortressHubBgUrl(fortressHub.level)}
            alt=""
            className={styles.fortressPreviewImg}
            width={160}
          />
          <div>
            <p className={styles.fortressLevelTitle}>
              Hazırkı səviyyə: <strong>Lv.{fortressHub.level}</strong>
            </p>
            {fortressHub.nextLevelLabel && (
              <p className={styles.fortressLevelSub}>
                Növbəti: {fortressHub.nextLevelLabel}
                {req ? ` · ${req.label} (5 nəfər onlayn)` : ''}
              </p>
            )}
          </div>
        </div>

        <ul className={styles.fortressCheckList}>
          <li className={eligibility.membersOk ? styles.fortressCheckOk : styles.fortressCheckBad}>
            {eligibility.membersOk ? '✅' : '❌'} Üzv sayı: {eligibility.memberCount} / 5
          </li>
          <li className={eligibility.onlineOk ? styles.fortressCheckOk : styles.fortressCheckBad}>
            {eligibility.onlineOk ? '✅' : '⏳'} İndi onlayn: {fortressHub.onlineInAlliance} / 5
          </li>
          {req && (
            <li className={eligibility.timeOk ? styles.fortressCheckOk : styles.fortressCheckBad}>
              {eligibility.timeOk ? '✅' : '⏳'} Aktivlik:{' '}
              {formatFortressProgress(eligibility.qualifyingMs, eligibility.requiredMs)}
            </li>
          )}
        </ul>

        {req && (
          <div className={styles.clickRaidHpTrack}>
            <div
              className={styles.clickRaidHpFill}
              style={{ width: `${fortressHub.eligibilityProgressPct}%` }}
            />
          </div>
        )}

        {fortressHub.canManage && eligibility.canUpgradeFree && eligibility.nextLevel && (
          <button
            type="button"
            className={styles.attackModalSubmitBtn}
            disabled={loading}
            onClick={handleUpgrade}
          >
            {loading ? 'Yüksəldilir...' : `⬆️ ${fortressHub.nextLevelLabel} — pulsuz yüksəlt`}
          </button>
        )}

        <Link href="/shop?tab=fortress" className={styles.fortressShopLink} onClick={onClose}>
          🛒 Mağazadan qala səviyyəsi al
        </Link>
      </div>
    </AllianceMapSheet>
  );
}
