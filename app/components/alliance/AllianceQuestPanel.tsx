"use client";

import React, { useEffect, useState } from 'react';
import { DAILY_ALLIANCE_QUESTS } from '@/app/lib/allianceQuestConfig';
import { getQuestProgress, claimQuestReward, AllianceQuestProgress } from '@/app/lib/allianceQuestService';
import styles from './alliance.module.css';

interface AllianceQuestPanelProps {
  allianceId: string;
  userId: string;
  collapsed?: boolean;
  embedded?: boolean;
}

export default function AllianceQuestPanel({
  allianceId,
  userId,
  collapsed = false,
  embedded = false,
}: AllianceQuestPanelProps) {
  const [open, setOpen] = useState(!collapsed);
  const [progress, setProgress] = useState<AllianceQuestProgress | null>(null);

  useEffect(() => {
    if (!allianceId) return;
    const load = () => void getQuestProgress(allianceId).then(setProgress);
    load();
    const interval = setInterval(load, 15000);
    return () => clearInterval(interval);
  }, [allianceId]);

  if (!allianceId) return null;

  const handleClaim = async (questId: string) => {
    try {
      const reward = await claimQuestReward(allianceId, userId, questId);
      alert(`+${reward} ₼ manat qazandın!`);
      setProgress(await getQuestProgress(allianceId));
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Xəta');
    }
  };

  const list = (
    <div className={embedded ? styles.questListEmbedded : styles.questList}>
      {DAILY_ALLIANCE_QUESTS.map((q) => {
        const cur = progress?.progress[q.id] ?? 0;
        const done = cur >= q.target;
        const claimed = progress?.claimed[q.id];
        return (
          <div key={q.id} className={styles.questItem}>
            <div>
              <div className={styles.questTitle}>{q.title}</div>
              <div className={styles.questDesc}>{q.desc}</div>
              <div className={styles.questProgress}>{cur}/{q.target} · ₼{q.rewardManat}</div>
            </div>
            {done && !claimed && (
              <button type="button" className={styles.questClaimBtn} onClick={() => handleClaim(q.id)}>Götür</button>
            )}
            {claimed && <span style={{ fontSize: 10, color: '#34d399' }}>✓</span>}
          </div>
        );
      })}
    </div>
  );

  if (embedded) return list;

  return (
    <div className={`${styles.questPanel} ${styles.glass}`}>
      <button type="button" className={styles.questPanelToggle} onClick={() => setOpen(!open)}>
        📋 Gündəlik tapşırıqlar {open ? '▾' : '▸'}
      </button>
      {open && list}
    </div>
  );
}
