"use client";

import { useCallback, useEffect, useRef, useState } from 'react';
import type { BattleRecord } from '@/app/lib/battleEventLog/battleEventTypes';
import {
  BATTLE_ENERGY_MAX,
  listenBattleEnergy,
  makeEnergyRequestId,
  officialCardEnergyCost,
  playBattleCard,
  type BattleEnergy,
} from '@/app/lib/battleEnergy';
import {
  BATTLE_CARD_MAX_USES,
  BATTLE_TURN_DURATION_MS,
  canPlayOnTurn,
  cardUsageCount,
  listenServerClock,
  timeoutBattleTurn,
  viewTurnTimer,
} from '@/app/lib/battlePlay';
import { BATTLE_LOADOUT_CARD_METAS, listenOwnLoadout } from '@/app/lib/battleLoadout';
import { viewCardEffectLabel } from '@/app/lib/battleEffects';
import {
  clearPendingBattleRequest,
  readPendingBattleRequest,
  rememberPendingBattleRequest,
} from '@/app/lib/battleReconnect';
import styles from './alliance.module.css';

function isTransientPlayError(err: unknown) {
  const msg = err instanceof Error ? err.message : String(err);
  return /vaxtı|timeout|network|offline|unavailable|oynanılmadı|Failed to|internet/i.test(msg);
}

export default function BattleEnergyPanel({
  battle,
  playerId,
  restoredEnergy,
}: {
  battle: BattleRecord;
  playerId: string;
  restoredEnergy?: BattleEnergy | null;
}) {
  const battleId = battle.id;
  const [energy, setEnergy] = useState<BattleEnergy | null>(null);
  const [hand, setHand] = useState<string[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastPlay, setLastPlay] = useState<string | null>(null);
  const [serverNow, setServerNow] = useState(0);
  const requestRef = useRef<string | null>(null);
  const timeoutSent = useRef<number | null>(null);
  const replayed = useRef(false);

  useEffect(() => listenServerClock(setServerNow), []);

  useEffect(() => {
    return listenBattleEnergy(battleId, playerId, setEnergy);
  }, [battleId, playerId]);

  useEffect(() => {
    return listenOwnLoadout(battleId, playerId, (loadout) => {
      setHand(loadout?.cardIds ?? []);
    });
  }, [battleId, playerId]);

  const shownEnergy =
    energy ?? (restoredEnergy?.battleId === battleId ? restoredEnergy : null);
  const myTurn = canPlayOnTurn(battle, playerId);
  const timer = viewTurnTimer(battle, serverNow);
  const playable = battle.status === 'active' && myTurn && shownEnergy != null && timer.ready && !timer.expired;

  useEffect(() => {
    if (!timer.ready || !timer.expired) return;
    if (timeoutSent.current === battle.stateVersion) return;
    timeoutSent.current = battle.stateVersion ?? 0;
    void timeoutBattleTurn({
      battleId,
      playerId,
      expectedStateVersion: battle.stateVersion ?? 0,
    }).catch(() => {
      timeoutSent.current = null;
    });
  }, [battle.stateVersion, battleId, playerId, timer.expired, timer.ready]);

  const finishPlay = useCallback(
    (cardId: string, result: { duplicate: boolean; cost: number; damage: number; playerDelta: number; effects: string[] }) => {
      requestRef.current = null;
      clearPendingBattleRequest(playerId, 'play');
      setLastPlay(
        result.duplicate
          ? 'Eyni request təkrarlandı — energy yenidən çıxılmadı'
          : `${cardId} oynandı. −${result.cost} energy · zərər ${result.damage} · xal +${result.playerDelta}${
              result.effects.length ? ` · ${result.effects.join(', ')}` : ''
            }`
      );
    },
    [playerId]
  );

  const onPlay = useCallback(
    async (cardId: string) => {
      if (!shownEnergy) return;
      if (!playable || busyId) return;
      setBusyId(cardId);
      setError(null);
      const requestId = requestRef.current ?? makeEnergyRequestId();
      requestRef.current = requestId;
      rememberPendingBattleRequest(playerId, {
        kind: 'play',
        battleId,
        playerId,
        cardId,
        requestId,
        expectedStateVersion: battle.stateVersion ?? 0,
        expectedEventSeq: battle.eventSeq,
      });
      try {
        const result = await playBattleCard({
          battleId,
          playerId,
          cardId,
          requestId,
          expectedStateVersion: battle.stateVersion ?? 0,
          expectedEventSeq: battle.eventSeq,
        });
        finishPlay(cardId, result);
      } catch (err) {
        if (!isTransientPlayError(err)) {
          requestRef.current = null;
          clearPendingBattleRequest(playerId, 'play');
        }
        setError(err instanceof Error ? err.message : 'Kart oynanılmadı');
      } finally {
        setBusyId(null);
      }
    },
    [battle.eventSeq, battle.stateVersion, battleId, busyId, shownEnergy, finishPlay, playable, playerId]
  );

  useEffect(() => {
    if (replayed.current) return;
    const pending = readPendingBattleRequest(playerId, 'play');
    if (!pending || pending.kind !== 'play') return;
    if (pending.battleId !== battleId) return;
    replayed.current = true;
    requestRef.current = pending.requestId;
    void playBattleCard({
      battleId: pending.battleId,
      playerId: pending.playerId,
      cardId: pending.cardId,
      requestId: pending.requestId,
      expectedStateVersion: pending.expectedStateVersion,
      expectedEventSeq: pending.expectedEventSeq,
    })
      .then((result) => finishPlay(pending.cardId, result))
      .catch((err) => {
        if (!isTransientPlayError(err)) {
          requestRef.current = null;
          clearPendingBattleRequest(playerId, 'play');
        }
        const msg = err instanceof Error ? err.message : 'Kart oynanılmadı';
        if (!/dəyişib|növbən deyil/i.test(msg)) setError(msg);
      });
  }, [battleId, finishPlay, playerId]);

  return (
    <div className={styles.energyBox}>
      <div className={styles.energyHead}>
        <strong>Energy</strong>
        <span>{shownEnergy ? `${shownEnergy.energy}/${shownEnergy.maxEnergy}` : '…'}</span>
      </div>
      <div className={styles.energyTrack} aria-hidden={shownEnergy == null}>
        <div
          className={styles.energyFill}
          style={{ width: `${shownEnergy ? (shownEnergy.energy / BATTLE_ENERGY_MAX) * 100 : 0}%` }}
        />
      </div>
      {battle.status === 'active' ? (
        <div className={styles.turnTimer} data-expired={timer.expired ? '1' : '0'}>
          <strong>Növbə</strong>
          <span>
            {!timer.ready
              ? 'Server saatı gözlənilir…'
              : timer.expired
                ? 'Vaxt bitdi'
                : `${Math.ceil(timer.remainingMs / 1000)} / ${BATTLE_TURN_DURATION_MS / 1000} san`}
          </span>
          <div className={styles.turnTimerTrack}>
            <div
              className={styles.turnTimerFill}
              style={{
                width: timer.ready
                  ? `${Math.min(100, (timer.remainingMs / BATTLE_TURN_DURATION_MS) * 100)}%`
                  : '0%',
              }}
            />
          </div>
        </div>
      ) : null}

      <p className={styles.energyHint}>
        {!shownEnergy
          ? 'Energy serverdən gözlənilir…'
          : battle.status !== 'active'
            ? 'Battle aktiv olanda kart oynana bilər.'
            : myTurn
              ? 'Sənin növbəndir. Cost, usage və cooldown serverdə yoxlanır.'
              : `Növbə: ${battle.turnPlayerId ?? '—'}`}
      </p>

      {battle.status === 'active' && hand.length > 0 ? (
        <div className={styles.energyHand}>
          {hand.map((cardId) => {
            const meta = BATTLE_LOADOUT_CARD_METAS.find((item) => item.id === cardId);
            const cost = officialCardEnergyCost(cardId);
            const used = cardUsageCount(shownEnergy?.cardUsage ?? {}, cardId);
            const readyAt = shownEnergy?.cardCooldownUntil[cardId] ?? 0;
            const cooling = readyAt > serverNow && serverNow > 0;
            const lacking = shownEnergy != null && shownEnergy.energy < cost;
            const maxed = used >= BATTLE_CARD_MAX_USES;
            const blocked = !playable || maxed || cooling || lacking || Boolean(busyId);
            return (
              <button
                key={cardId}
                type="button"
                className={styles.energyPlayBtn}
                disabled={blocked}
                onClick={() => void onPlay(cardId)}
              >
                <span>{meta?.title ?? cardId}</span>
                <span>
                  {viewCardEffectLabel(cardId)} · ⚡ {cost} · {used}/{BATTLE_CARD_MAX_USES}
                  {cooling ? ` · ${Math.ceil((readyAt - serverNow) / 1000)}s` : ''}
                </span>
              </button>
            );
          })}
        </div>
      ) : null}

      {lastPlay ? <p className={styles.battleJoinHint}>{lastPlay}</p> : null}
      {error ? <p className={styles.battleJoinWarn}>{error}</p> : null}
    </div>
  );
}
