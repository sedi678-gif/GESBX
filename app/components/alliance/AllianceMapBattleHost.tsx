"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import AllianceMapSheet from './AllianceMapSheet';
import { useAllianceBrain } from './AllianceBrainContext';
import type { AllianceData, PlayerProfile } from './types';
import { setAllianceAssistantLeader } from './allianceService';
import { canStartAllianceBattle } from '@/app/lib/allianceBattleAccess';
import {
  ALLIANCE_BATTLE_MAX_PER_SIDE,
  identifyAlliance,
  joinAllianceMapBattle,
  listenAllianceBattleGate,
  listenAllianceMapBattle,
  listenMyJoiningBattle,
  activateAllianceBattle,
  seatOfflineDefenders,
  lockAllianceMapBattle,
  officialJoinEndsAt,
  startAllianceMapBattle,
  viewAllianceBattleGate,
  viewAllianceBattle,
  type AllianceBattleGate,
  type AllianceBattleView,
} from '@/app/lib/allianceBattleMatchService';
import {
  rememberLiveBattleHint,
  clearLiveBattleHint,
} from '@/app/lib/battleReconnect';
import { finishBattle, officialFinishReason } from '@/app/lib/battleFinish';
import { listenServerClock } from '@/app/lib/battlePlay/battleServerClock';
import { GameTable } from '@/app/game/table';
import { createArenaMatch, listenArenaMatch, type ArenaMatchState } from '@/app/game/arena/match';
import ArenaLoadoutPicker from '@/app/game/arena/ArenaLoadoutPicker';
import styles from './alliance.module.css';

function playerName(players: PlayerProfile[], id: string) {
  return players.find((item) => item.odId === id)?.displayName || `ID ${id}`;
}

function formatRemain(ms: number) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}s ${m}dəq`;
  if (m > 0) return `${m}dəq ${s}san`;
  return `${s} san`;
}

function SideList({
  title,
  ids,
  players,
  you,
}: {
  title: string;
  ids: string[];
  players: PlayerProfile[];
  you: string;
}) {
  return (
    <div className={styles.battleJoinSide}>
      <div className={styles.battleJoinSideHead}>
        {title}{' '}
        <span>
          {ids.length}/{ALLIANCE_BATTLE_MAX_PER_SIDE}
        </span>
      </div>
      {ids.length === 0 ? (
        <p className={styles.battleJoinEmpty}>Hələ heç kim yoxdur</p>
      ) : (
        ids.map((id) => (
          <div key={id} className={styles.battleJoinRow}>
            {id === you ? 'Sən' : playerName(players, id)}
          </div>
        ))
      )}
    </div>
  );
}

export default function AllianceMapBattleHost({
  selectedAllianceId,
  onClearSelected,
}: {
  selectedAllianceId: string | null;
  onClearSelected: () => void;
}) {
  const { userId, activeAlliance, alliances, players } = useAllianceBrain();
  const [identified, setIdentified] = useState<AllianceData | null>(null);
  const [identifyError, setIdentifyError] = useState<string | null>(null);
  const [gate, setGate] = useState<AllianceBattleGate | null>(null);
  const [lobbyId, setLobbyId] = useState<string | null>(null);
  const [view, setView] = useState<AllianceBattleView | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [assistantLeaderBusy, setAssistantLeaderBusy] = useState<string | null>(null);
  const [assistantLeaderError, setAssistantLeaderError] = useState<string | null>(null);
  const [tableOpen, setTableOpen] = useState(false);
  const [arenaMatch, setArenaMatch] = useState<ArenaMatchState | null>(null);
  const attackLock = useRef(false);
  const autoJoinRef = useRef<string | null>(null);
  const seatedRef = useRef<string | null>(null);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => listenServerClock(() => {}), []);

  useEffect(() => {
    if (!selectedAllianceId) return;
    let cancelled = false;
    void identifyAlliance(selectedAllianceId)
      .then((alliance) => {
        if (!cancelled) {
          setIdentified(alliance);
          setIdentifyError(null);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setIdentified(null);
          setIdentifyError(err instanceof Error ? err.message : 'İttifaq tapılmadı');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [selectedAllianceId]);

  useEffect(() => {
    if (!selectedAllianceId) return;
    return listenAllianceBattleGate(selectedAllianceId, setGate);
  }, [selectedAllianceId]);

  useEffect(() => {
    if (!selectedAllianceId) {
      setLobbyId(null);
      setView(null);
      return;
    }
    return listenMyJoiningBattle(
      selectedAllianceId,
      (id) => {
        setLobbyId(id);
      },
      { playerId: userId, allianceId: activeAlliance?.id ?? '' }
    );
  }, [selectedAllianceId, userId, activeAlliance?.id]);

  useEffect(() => {
    if (!lobbyId) {
      setArenaMatch(null);
      return undefined;
    }
    return listenArenaMatch(lobbyId, setArenaMatch);
  }, [lobbyId]);

  useEffect(() => {
    if (!userId || !view || !arenaMatch) return;
    if (arenaMatch.status !== 'closed') return;
    if (view.battle.status !== 'finished') {
      void finishBattle({ battleId: view.battle.id, playerId: userId }).catch((error) => { console.warn('Background task failed', error); });
    }
    if (tableOpen) return;
    clearLiveBattleHint(userId);
    setLobbyId(null);
    setView(null);
  }, [arenaMatch, view, userId, tableOpen]);

  useEffect(() => {
    if (!lobbyId) return;
    return listenAllianceMapBattle(lobbyId, setView);
  }, [lobbyId]);

  useEffect(() => {
    if (!view || !userId) return;
    const inBattle = [...(view.battle.attackerPlayerIds ?? []), ...(view.battle.defenderPlayerIds ?? [])].includes(
      userId
    );
    if (!inBattle) return;
    if (view.battle.status === 'locked') {
      const attackers = view.battle.attackerPlayerIds ?? [];
      const open = () => {
        void activateAllianceBattle(view.battle.id, userId).catch((error) => { console.warn('Background task failed', error); });
      };
      if (attackers.includes(userId) && seatedRef.current !== view.battle.id) {
        seatedRef.current = view.battle.id;
        void seatOfflineDefenders(view.battle.id, userId).catch((error) => { console.warn('Background task failed', error); }).finally(open);
      } else {
        open();
      }
    }
  }, [view, userId]);

  useEffect(() => {
    if (!view) return;
    if (view.battle.status !== 'joining') return;
    const endsAt = officialJoinEndsAt(view.battle, now);
    if (now < endsAt) return;
    void lockAllianceMapBattle(view.battle.id, userId).catch((error) => { console.warn('Background task failed', error); });
  }, [view, userId, now]);

  useEffect(() => {
    if (!view || !userId) return;
    if (view.battle.status !== 'active') return;
    if (!officialFinishReason(view.battle)) return;
    void finishBattle({ battleId: view.battle.id, playerId: userId }).catch((error) => { console.warn('Background task failed', error); });
  }, [view, userId]);

  useEffect(() => {
    if (!userId || !view) return;
    const inBattle = [...(view.battle.attackerPlayerIds ?? []), ...(view.battle.defenderPlayerIds ?? [])].includes(
      userId
    );
    if (!inBattle) return;
    if (view.battle.status === 'finished') {
      clearLiveBattleHint(userId);
      return;
    }
    if (view.battle.status === 'joining' || view.battle.status === 'locked' || view.battle.status === 'active') {
      rememberLiveBattleHint(userId, view.battle.id);
    }
  }, [userId, view]);

  const resolvedIdentified = selectedAllianceId ? identified : null;
  const resolvedIdentifyError = selectedAllianceId ? identifyError : null;
  const resolvedGate = selectedAllianceId ? gate : null;

  const liveGate = useMemo(
    () => (selectedAllianceId ? viewAllianceBattleGate(selectedAllianceId, resolvedGate, now) : null),
    [selectedAllianceId, resolvedGate, now]
  );

  const liveView = useMemo(() => {
    if (!lobbyId || !view) return null;
    return viewAllianceBattle(view.battle, now);
  }, [lobbyId, view, now]);

  const ownTarget = Boolean(resolvedIdentified && activeAlliance && resolvedIdentified.id === activeAlliance.id);
  const canStartAttack = Boolean(activeAlliance && canStartAllianceBattle(activeAlliance, userId));
  const showAttack = Boolean(liveGate?.canAttack && resolvedIdentified && !ownTarget && canStartAttack);
  const alreadyIn =
    liveView &&
    [...(liveView.battle.attackerPlayerIds ?? []), ...(liveView.battle.defenderPlayerIds ?? [])].includes(userId);

  const onToggleAssistantLeader = useCallback(async (assistantLeaderId: string, promote: boolean) => {
    if (!activeAlliance || userId !== activeAlliance.leaderId || assistantLeaderBusy) return;
    setAssistantLeaderBusy(assistantLeaderId);
    setAssistantLeaderError(null);
    try {
      await setAllianceAssistantLeader(activeAlliance.id, userId, assistantLeaderId, promote);
    } catch (err) {
      setAssistantLeaderError(err instanceof Error ? err.message : 'Köməkçi lider statusu dəyişdirilmədi.');
    } finally {
      setAssistantLeaderBusy(null);
    }
  }, [activeAlliance, assistantLeaderBusy, userId]);

  const onAttack = useCallback(async () => {
    if (!resolvedIdentified || !activeAlliance || !canStartAllianceBattle(activeAlliance, userId) || attackLock.current || busy) return;
    attackLock.current = true;
    setBusy(true);
    setError(null);
    try {
      const battle = await startAllianceMapBattle({
        playerId: userId,
        defenderAllianceId: resolvedIdentified.id,
      });
      rememberLiveBattleHint(userId, battle.id);
      setLobbyId(battle.id);
      try {
        await createArenaMatch({
          matchId: battle.id,
          createdBy: userId,
          gameMode: '5v5',
          homeAllianceId: activeAlliance.id,
          awayAllianceId: resolvedIdentified.id,
          homePlayerIds: [userId, null, null, null, null],
          awayPlayerIds: [null, null, null, null, null],
          displayNames: { [userId]: playerName(players, userId) },
        });
      } catch (arenaErr) {
        setError(arenaErr instanceof Error ? arenaErr.message : 'Arena match yazılmadı');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Hücum başlamadı');
    } finally {
      setBusy(false);
      window.setTimeout(() => {
        attackLock.current = false;
      }, 800);
    }
  }, [resolvedIdentified, busy, userId, players, activeAlliance]);

  const onJoin = useCallback(async () => {
    if (!liveView || busy) return;
    setBusy(true);
    setError(null);
    try {
      await joinAllianceMapBattle({ battleId: liveView.battle.id, playerId: userId });
      rememberLiveBattleHint(userId, liveView.battle.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Qoşulmaq olmadı');
    } finally {
      setBusy(false);
    }
  }, [liveView, busy, userId]);

  const localAlliance = resolvedIdentified || alliances.find((item) => item.id === selectedAllianceId) || null;
  const showInfo = Boolean(selectedAllianceId) && !lobbyId;

  useEffect(() => {
    if (!liveView || !userId || !activeAlliance?.id || busy) return;
    if (!liveView.canJoin) return;
    const inBattle = [...(liveView.battle.attackerPlayerIds ?? []), ...(liveView.battle.defenderPlayerIds ?? [])].includes(
      userId
    );
    if (inBattle) return;
    const myAlliance = activeAlliance.id;
    if (myAlliance !== liveView.battle.attackerAllianceId && myAlliance !== liveView.battle.defenderAllianceId) {
      return;
    }
    if (autoJoinRef.current === liveView.battle.id) return;
    autoJoinRef.current = liveView.battle.id;
    void onJoin();
  }, [activeAlliance?.id, busy, liveView, onJoin, userId]);

  const loadoutReady = Boolean(userId && arenaMatch?.loadouts[userId]);
  const matchClosed = arenaMatch?.status === 'closed';
  const tableReady = Boolean(
    alreadyIn && !matchClosed && (loadoutReady || arenaMatch?.phase === 'combat')
  );
  const showLobby = Boolean(
    lobbyId && liveView && liveView.phase !== 'finished' && !matchClosed && !tableOpen
  );

  return (
    <>
      <AllianceMapSheet
        open={showInfo && !tableOpen}
        onClose={onClearSelected}
        title={localAlliance ? localAlliance.name : 'İttifaq'}
      >
        {resolvedIdentifyError ? <p className={styles.battleJoinWarn}>{resolvedIdentifyError}</p> : null}
        {localAlliance ? (
          <div className={styles.battleTargetInfo}>
            <p>📍 {localAlliance.region}</p>
            <p>👑 {localAlliance.leader}</p>
            <p>⭐ {localAlliance.score || 50} xal</p>
            <p>👥 {(localAlliance.members ?? []).length} üzv</p>
            <p>🏰 Qala Lv.{localAlliance.fortressLevel ?? 1}</p>
          </div>
        ) : (
          <p>İttifaq yoxlanır…</p>
        )}

        {ownTarget ? (
          <>
            <p className={styles.battleJoinHint}>Bu sənin ittifaqındır.</p>
            {userId === activeAlliance?.leaderId && activeAlliance ? (
              <div className={styles.battleTargetInfo}>
                <strong>Hücum səlahiyyəti</strong>
                <p>Lider və təyin etdiyi köməkçi liderlər hücum başlada bilər.</p>
                {(activeAlliance.members ?? []).filter((id) => id !== activeAlliance.leaderId).map((id) => {
                  const isAssistant = (activeAlliance.assistantLeaderIds ?? []).includes(id);
                  return (
                    <button
                      key={id}
                      type="button"
                      className={styles.searchModalJoinBtn}
                      disabled={assistantLeaderBusy !== null}
                      onClick={() => void onToggleAssistantLeader(id, !isAssistant)}
                    >
                      {assistantLeaderBusy === id ? 'Saxlanır…' : `${isAssistant ? 'Köməkçi lideri ləğv et' : 'Köməkçi lider təyin et'} · ${playerName(players, id)}`}
                    </button>
                  );
                })}
                {assistantLeaderError ? <p className={styles.battleJoinWarn}>{assistantLeaderError}</p> : null}
              </div>
            ) : null}
          </>
        ) : null}
        {!activeAlliance ? <p className={styles.battleJoinWarn}>Hücum üçün öz ittifaqın olmalıdır.</p> : null}
        {activeAlliance && !canStartAttack && !ownTarget ? (
          <p className={styles.battleJoinHint}>Hücum başlatmaq üçün ittifaq lideri və ya təyin olunmuş köməkçi lider olmalısan.</p>
        ) : null}
        {liveGate && !liveGate.canAttack ? (
          <p className={styles.battleJoinHint}>
            Bu ittifaqa son 3 saat ərzində hücum edilib. Yenidən:{' '}
            {formatRemain(liveGate.cooldownUntil - now)}
          </p>
        ) : null}

        {error ? <p className={styles.battleJoinWarn}>{error}</p> : null}

        {showAttack ? (
          <button
            type="button"
            className={styles.battleAttackBtn}
            disabled={busy}
            onClick={() => void onAttack()}
          >
            {busy ? 'Göndərilir…' : 'Hücum et'}
          </button>
        ) : null}
      </AllianceMapSheet>

      <AllianceMapSheet
        open={showLobby && !tableOpen}
        onClose={() => {
          setLobbyId(null);
          onClearSelected();
        }}
        title={
          liveView
            ? `${liveView.battle.attackerAllianceName} vs ${liveView.battle.defenderAllianceName}`
            : 'Döyüş'
        }
      >
        {liveView ? (
          <>
            <div className={styles.battleJoinTimer} data-phase={liveView.phase}>
              {liveView.phase === 'joining'
                ? `Qoşulma: ${formatRemain(liveView.joinRemainingMs)}`
                : liveView.phase === 'locked'
                  ? 'Döyüş açılır — sonradan qoşulmaq olar'
                  : liveView.phase === 'active'
                    ? `Döyüş aktiv · növbə: ${liveView.battle.turnPlayerId || 'gözlənilir'}`
                    : liveView.phase === 'finished'
                    ? 'Döyüş bitdi / qoşulma alınmadı'
                    : liveView.phase}
            </div>
            <div className={styles.battleJoinGrid}>
              <SideList
                title={`⚔ ${liveView.battle.attackerAllianceName ?? 'Hücum'}`}
                ids={liveView.battle.attackerPlayerIds ?? []}
                players={players}
                you={userId}
              />
              <SideList
                title={`🛡 ${liveView.battle.defenderAllianceName ?? 'Müdafiə'}`}
                ids={liveView.battle.defenderPlayerIds ?? []}
                players={players}
                you={userId}
              />
            </div>
            {error ? <p className={styles.battleJoinWarn}>{error}</p> : null}
            {liveView.canJoin && !alreadyIn ? (
              <button type="button" className={styles.battleAttackBtn} disabled={busy} onClick={() => void onJoin()}>
                {busy ? 'Qoşulur…' : 'Döyüşə qoşul'}
              </button>
            ) : null}
            {alreadyIn && liveView.phase === 'joining' ? (
              <p className={styles.battleJoinHint}>Qoşuldun. 5 kartını seç, sonra Hücum ilə masanı aç.</p>
            ) : null}
            {alreadyIn && lobbyId && userId && !loadoutReady && arenaMatch ? (
              <ArenaLoadoutPicker
                matchId={lobbyId}
                playerId={userId}
                submitLabel="Hücum"
                onLocked={() => setTableOpen(true)}
              />
            ) : null}
            {tableReady ? (
              <button type="button" className={styles.battleAttackBtn} onClick={() => setTableOpen(true)}>
                Hücum
              </button>
            ) : null}
          </>
        ) : (
          <p>Döyüş yüklənir…</p>
        )}
      </AllianceMapSheet>
      <GameTable
        open={tableOpen}
        onClose={() => {
          setTableOpen(false);
          if (arenaMatch?.status === 'closed') {
            if (userId) clearLiveBattleHint(userId);
            setLobbyId(null);
            setView(null);
          }
        }}
        matchId={lobbyId}
        playerId={userId}
      />
    </>
  );
}
