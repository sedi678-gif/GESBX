"use client";

import { useEffect, useState } from 'react';
import type { BattleRecord } from '@/app/lib/battleEventLog/battleEventTypes';
import { listenPlayerBattleScore, officialBattleLeader } from '@/app/lib/battleScore';
import { listenBattleResult, type BattleFinishResult } from '@/app/lib/battleFinish';
import styles from './alliance.module.css';

function resultLabel(result: { reason: string; winnerSide: string | null }) {
  if (result.reason === 'join_failed') return 'Qoşulma alınmadı';
  if (result.winnerSide == null) return 'Bərabər';
  return result.winnerSide === 'attacker' ? 'Hücum qalib' : 'Müdafiə qalib';
}

export default function BattleScorePanel({
  battle,
  playerId,
}: {
  battle: BattleRecord;
  playerId: string;
}) {
  const [mine, setMine] = useState<number | null>(null);
  const [result, setResult] = useState<BattleFinishResult | null>(null);

  useEffect(() => {
    return listenPlayerBattleScore(battle.id, playerId, (score) => {
      setMine(score?.score ?? 0);
    });
  }, [battle.id, playerId]);

  useEffect(() => {
    return listenBattleResult(battle.id, setResult);
  }, [battle.id]);

  const lead = officialBattleLeader(battle);
  const finished = battle.status === 'finished';
  const official = result ?? (finished
    ? {
        reason: battle.finishReason === 'score_reached' || battle.finishReason === 'turn_limit' ? battle.finishReason : 'join_failed',
        winnerSide: lead.leaderSide,
        winnerAllianceId: lead.winnerAllianceId,
        attackerScore: lead.attackerScore,
        defenderScore: lead.defenderScore,
        playerDeltas: {} as Record<string, number>,
      }
    : null);

  return (
    <section className={styles.scoreBox} aria-label="Battle score">
      <div className={styles.scoreHead}>
        <strong>Xal</strong>
        <span>
          {official
            ? resultLabel(official)
            : lead.reason === 'draw'
              ? 'bərabər'
              : lead.leaderSide === 'attacker'
                ? 'hücum irəlidə'
                : 'müdafiə irəlidə'}
        </span>
      </div>
      <div className={styles.scoreGrid}>
        <div>
          <small>⚔ {battle.attackerAllianceName ?? 'Hücum'}</small>
          <strong>{lead.attackerScore}</strong>
        </div>
        <div>
          <small>🛡 {battle.defenderAllianceName ?? 'Müdafiə'}</small>
          <strong>{lead.defenderScore}</strong>
        </div>
      </div>
      {official && finished ? (
        <p className={styles.scoreResult} data-reason={official.reason}>
          {official.reason === 'join_failed'
            ? 'Nəticə: döyüş başlamadı. Qalib yoxdur.'
            : official.winnerSide == null
              ? `Nəticə serverdə bağlandı · ${official.attackerScore}–${official.defenderScore} bərabər`
              : `Nəticə serverdə bağlandı · qalib yalnız score ilə seçildi (${official.attackerScore}–${official.defenderScore})`}
          {result && playerId in result.playerDeltas
            ? ` · sənin ranking: +${result.playerDeltas[playerId]}`
            : ''}
        </p>
      ) : (
        <p className={styles.scoreHint}>
          Sənin xalın: {mine ?? '…'} · damage, xal və qalib yalnız serverdə hesablanır.
        </p>
      )}
    </section>
  );
}
