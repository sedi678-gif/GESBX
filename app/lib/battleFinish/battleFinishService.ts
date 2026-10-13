import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  type Transaction,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from '@/firebase';
import { requireFirebaseAuth } from '@/app/lib/firebaseAuth';
import { battleEventWrite, battleFromData, battleRef, newBattleEventRef } from '@/app/lib/battleEventLog/battleEventLog';
import type { BattleRecord, BattleSide } from '@/app/lib/battleEventLog/battleEventTypes';
import { sanitizeBattleId, sanitizePlayerId } from '@/app/lib/battleEventLog/sanitizeBattleEventMeta';
import { BATTLE_CHALLENGE_COLLECTION } from '@/app/lib/battleClick/battleClickConfig';
import { replayBattleRequest } from '@/app/lib/battleReconnect/replayBattleRequest';
import {
  addGlobalScore,
  BATTLE_FINISH_ALLIANCE_DRAW,
  BATTLE_FINISH_ALLIANCE_LOSS,
  BATTLE_FINISH_ALLIANCE_WIN,
  BATTLE_FINISH_PLAYER_DRAW,
  BATTLE_FINISH_PLAYER_LOSS,
  BATTLE_FINISH_PLAYER_WIN,
  BATTLE_FINISH_SCHEMA,
  BATTLE_FINISH_SCORE_WIN,
  BATTLE_FINISH_TURN_LIMIT,
  BATTLE_RESULT_COLLECTION,
  BATTLE_RESULT_DOC_ID,
  officialFinishDeltas,
  officialFinishReason,
  officialFinishWinner,
  type BattleFinishReason,
} from './battleFinishConfig';
import { applyBattleLeaderboardAwards, requireLeaderboardPeriod } from '@/app/lib/leaderboard';
import { ARENA_MATCH_COLLECTION } from '@/app/game/arena/match/config';
import {
  LEADERBOARD_AWARDS_COLLECTION,
  LEADERBOARD_WEEKLY_SCORE_BASE,
} from '@/app/lib/leaderboard/leaderboardConfig';

export interface BattleFinishResult {
  battleId: string;
  status: 'finished';
  reason: BattleFinishReason;
  winnerSide: BattleSide | null;
  winnerAllianceId: string | null;
  winnerPlayerId: null;
  attackerScore: number;
  defenderScore: number;
  attackerAllianceId: string | null;
  defenderAllianceId: string | null;
  playerDeltas: Record<string, number>;
  allianceDeltas: Record<string, number>;
  participantIds: string[];
  eventSeq: number;
  duplicate: boolean;
}

const WRITE_MS = 12_000;

export function battleResultRef(battleId: string) {
  return doc(db, 'battles', battleId, BATTLE_RESULT_COLLECTION, BATTLE_RESULT_DOC_ID);
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

function asIntMap(raw: unknown): Record<string, number> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const n = Math.trunc(Number(value));
    if (key && Number.isInteger(n) && n >= 0) out[key] = n;
  }
  return out;
}

export function viewBattleFinishResult(battleId: string, data: Record<string, unknown>): BattleFinishResult {
  const winnerSide =
    data.winnerSide === 'attacker' || data.winnerSide === 'defender' ? data.winnerSide : null;
  const reason: BattleFinishReason =
    data.reason === 'score_reached' || data.reason === 'turn_limit' ? data.reason : 'join_failed';
  return {
    battleId,
    status: 'finished',
    reason,
    winnerSide,
    winnerAllianceId: data.winnerAllianceId ? String(data.winnerAllianceId) : null,
    winnerPlayerId: null,
    attackerScore: Math.max(0, Math.trunc(Number(data.attackerScore) || 0)),
    defenderScore: Math.max(0, Math.trunc(Number(data.defenderScore) || 0)),
    attackerAllianceId: data.attackerAllianceId ? String(data.attackerAllianceId) : null,
    defenderAllianceId: data.defenderAllianceId ? String(data.defenderAllianceId) : null,
    playerDeltas: asIntMap(data.playerDeltas),
    allianceDeltas: asIntMap(data.allianceDeltas),
    participantIds: Array.isArray(data.participantIds) ? data.participantIds.map(String) : [],
    eventSeq: Math.max(0, Math.trunc(Number(data.eventSeq) || 0)),
    duplicate: Boolean(data.duplicate),
  };
}

function resultDoc(input: Omit<BattleFinishResult, 'duplicate'>) {
  return {
    battleId: input.battleId,
    status: 'finished' as const,
    reason: input.reason,
    winnerSide: input.winnerSide,
    winnerAllianceId: input.winnerAllianceId,
    winnerPlayerId: null,
    attackerScore: input.attackerScore,
    defenderScore: input.defenderScore,
    attackerAllianceId: input.attackerAllianceId,
    defenderAllianceId: input.defenderAllianceId,
    playerDeltas: input.playerDeltas,
    allianceDeltas: input.allianceDeltas,
    participantIds: input.participantIds,
    eventSeq: input.eventSeq,
    playerDeltaWin: BATTLE_FINISH_PLAYER_WIN,
    playerDeltaLoss: BATTLE_FINISH_PLAYER_LOSS,
    playerDeltaDraw: BATTLE_FINISH_PLAYER_DRAW,
    allianceDeltaWin: BATTLE_FINISH_ALLIANCE_WIN,
    allianceDeltaLoss: BATTLE_FINISH_ALLIANCE_LOSS,
    allianceDeltaDraw: BATTLE_FINISH_ALLIANCE_DRAW,
    scoreWin: BATTLE_FINISH_SCORE_WIN,
    turnLimit: BATTLE_FINISH_TURN_LIMIT,
    schemaVersion: BATTLE_FINISH_SCHEMA,
    createdAt: serverTimestamp(),
  };
}

function finishText(result: Omit<BattleFinishResult, 'duplicate'>): string {
  if (result.reason === 'join_failed') {
    return 'Döyüş başlamadı — qoşulma alınmadı.';
  }
  const atk = result.attackerScore;
  const def = result.defenderScore;
  if (result.winnerAllianceId == null) {
    return `Döyüş bitdi · bərabər ${atk}–${def}`;
  }
  const name =
    result.winnerSide === 'attacker' ? 'Hücum' : result.winnerSide === 'defender' ? 'Müdafiə' : 'Qalib';
  return `Döyüş bitdi · qalib: ${name} (${atk}–${def})`;
}

function writeNotifications(
  tx: Transaction,
  result: Omit<BattleFinishResult, 'duplicate'>,
  allianceName: Record<string, string>
) {
  const text = finishText(result);
  const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const ids = [result.attackerAllianceId, result.defenderAllianceId].filter(
    (id, index, list): id is string => Boolean(id) && list.indexOf(id) === index
  );
  for (const allianceId of ids) {
    const notifyId = `battle_fin_${result.battleId}_${allianceId}`;
    tx.set(doc(db, 'alliance_notifications', notifyId), {
      kind: 'battle_finished',
      allianceId,
      allianceName: allianceName[allianceId] || '',
      battleId: result.battleId,
      winnerAllianceId: result.winnerAllianceId,
      winnerSide: result.winnerSide,
      reason: result.reason,
      attackerScore: result.attackerScore,
      defenderScore: result.defenderScore,
      text,
      createdAt: Date.now(),
    });
    tx.set(doc(db, 'alliance_chat', notifyId), {
      user: 'Sistem',
      userId: 'system',
      text,
      time,
      createdAt: Date.now(),
      allianceId,
      kind: 'system',
    });
  }
}

export function stampJoinFailedResult(tx: Transaction, battle: BattleRecord) {
  const payload: Omit<BattleFinishResult, 'duplicate'> = {
    battleId: battle.id,
    status: 'finished',
    reason: 'join_failed',
    winnerSide: null,
    winnerAllianceId: null,
    winnerPlayerId: null,
    attackerScore: 0,
    defenderScore: 0,
    attackerAllianceId: battle.attackerAllianceId ?? null,
    defenderAllianceId: battle.defenderAllianceId ?? null,
    playerDeltas: {},
    allianceDeltas: {},
    participantIds: battle.participantIds ?? [],
    eventSeq: battle.eventSeq + 1,
  };
  tx.set(battleResultRef(battle.id), resultDoc(payload));
  writeNotifications(tx, payload, {
    [battle.attackerAllianceId || '']: battle.attackerAllianceName || 'Hücum',
    [battle.defenderAllianceId || '']: battle.defenderAllianceName || 'Müdafiə',
  });
}

async function finishBattleWork(input: { battleId: string; playerId: string }): Promise<BattleFinishResult> {
  await requireFirebaseAuth();
  const playerId = sanitizePlayerId(input.playerId);
  const battleId = sanitizeBattleId(input.battleId);

  const challengeSnaps = await getDocs(collection(db, 'battles', battleId, BATTLE_CHALLENGE_COLLECTION));
  const period = await requireLeaderboardPeriod().catch(() => null);

  const finished = await withTimeout(
    runTransaction(db, async (tx) => {
      const parentRef = battleRef(battleId);
      const resultRef = battleResultRef(battleId);
      const parentSnap = await tx.get(parentRef);
      const resultSnap = await tx.get(resultRef);
      const arenaSnap = await tx.get(doc(db, ARENA_MATCH_COLLECTION, battleId));
      if (!parentSnap.exists()) throw new Error('Battle tapılmadı');
      let battle = battleFromData(parentSnap.id, parentSnap.data());

      if (resultSnap.exists()) {
        return { ...viewBattleFinishResult(battleId, resultSnap.data() as Record<string, unknown>), duplicate: true };
      }

      if (arenaSnap.exists()) {
        const arena = arenaSnap.data() as {
          status?: string;
          turnIndex?: number;
          sideScores?: { home?: number; away?: number };
        };
        const home = Math.max(0, Math.trunc(Number(arena.sideScores?.home) || 0));
        const away = Math.max(0, Math.trunc(Number(arena.sideScores?.away) || 0));
        battle = {
          ...battle,
          attackerScore: home,
          defenderScore: away,
          turn: Math.max(0, Math.trunc(Number(arena.turnIndex) || 0)),
          status:
            arena.status === 'closed' && battle.status !== 'finished'
              ? 'active'
              : battle.status,
        };
      }
      if (battle.status === 'finished') {
        const payload: Omit<BattleFinishResult, 'duplicate'> = {
          battleId,
          status: 'finished',
          reason: battle.finishReason === 'score_reached' || battle.finishReason === 'turn_limit' ? battle.finishReason : 'join_failed',
          winnerSide: null,
          winnerAllianceId: null,
          winnerPlayerId: null,
          attackerScore: officialFinishWinner(battle).attackerScore,
          defenderScore: officialFinishWinner(battle).defenderScore,
          attackerAllianceId: battle.attackerAllianceId ?? null,
          defenderAllianceId: battle.defenderAllianceId ?? null,
          playerDeltas: {},
          allianceDeltas: {},
          participantIds: battle.participantIds ?? [],
          eventSeq: battle.eventSeq,
        };
        const win = officialFinishWinner(battle);
        payload.winnerSide = win.winnerSide;
        payload.winnerAllianceId = win.winnerAllianceId;
        if (payload.reason === 'join_failed') {
          payload.winnerSide = null;
          payload.winnerAllianceId = null;
        }
        tx.set(resultRef, resultDoc(payload));
        writeNotifications(tx, payload, {
          [battle.attackerAllianceId || '']: battle.attackerAllianceName || 'Hücum',
          [battle.defenderAllianceId || '']: battle.defenderAllianceName || 'Müdafiə',
        });
        return { ...payload, duplicate: true };
      }

      if (!(battle.participantIds ?? []).includes(playerId)) {
        throw new Error('Bu döyüşdə deyilsən');
      }

      const reason =
        officialFinishReason(battle) ??
        (arenaSnap.exists() && (arenaSnap.data() as { status?: string }).status === 'closed'
          ? ('turn_limit' as const)
          : null);
      if (!reason) throw new Error('Battle hələ bitməyib');

      const win = officialFinishWinner(battle);
      const attackerPlayerIds = battle.attackerPlayerIds ?? [];
      const defenderPlayerIds = battle.defenderPlayerIds ?? [];
      const deltas = officialFinishDeltas({
        reason,
        winnerSide: win.winnerSide,
        attackerPlayerIds,
        defenderPlayerIds,
        attackerAllianceId: battle.attackerAllianceId ?? null,
        defenderAllianceId: battle.defenderAllianceId ?? null,
      });

      const playerIds = [...new Set([...attackerPlayerIds, ...defenderPlayerIds])];
      const playerSnaps = await Promise.all(playerIds.map((id) => tx.get(doc(db, 'players', id))));
      const atkAllianceRef = battle.attackerAllianceId ? doc(db, 'alliances', battle.attackerAllianceId) : null;
      const defAllianceRef = battle.defenderAllianceId ? doc(db, 'alliances', battle.defenderAllianceId) : null;
      const atkAllianceSnap = atkAllianceRef ? await tx.get(atkAllianceRef) : null;
      const defAllianceSnap = defAllianceRef ? await tx.get(defAllianceRef) : null;

      const challengeGets = await Promise.all(
        challengeSnaps.docs.map((item) => tx.get(item.ref))
      );

      const seq = battle.eventSeq + 1;
      const eventDoc = newBattleEventRef(battleId);
      const payload: Omit<BattleFinishResult, 'duplicate'> = {
        battleId,
        status: 'finished',
        reason,
        winnerSide: win.winnerSide,
        winnerAllianceId: win.winnerAllianceId,
        winnerPlayerId: null,
        attackerScore: win.attackerScore,
        defenderScore: win.defenderScore,
        attackerAllianceId: battle.attackerAllianceId ?? null,
        defenderAllianceId: battle.defenderAllianceId ?? null,
        playerDeltas: deltas.playerDeltas,
        allianceDeltas: deltas.allianceDeltas,
        participantIds: battle.participantIds ?? [],
        eventSeq: seq,
      };

      tx.update(parentRef, {
        eventSeq: seq,
        updatedAt: serverTimestamp(),
        status: 'finished',
        finishReason: reason,
        winnerSide: win.winnerSide,
        winnerAllianceId: win.winnerAllianceId,
        finishedAt: serverTimestamp(),
        attackerScore: win.attackerScore,
        defenderScore: win.defenderScore,
      });
      tx.set(
        eventDoc,
        battleEventWrite({
          eventId: eventDoc.id,
          battleId,
          playerId,
          type: 'battle_finished',
          seq,
          meta: {
            winnerAllianceId: win.winnerAllianceId ?? undefined,
            reason,
            winnerSide: win.winnerSide ?? undefined,
            attackerScore: win.attackerScore,
            defenderScore: win.defenderScore,
          },
        })
      );
      tx.set(resultRef, resultDoc(payload));

      for (const snap of challengeGets) {
        if (!snap.exists()) continue;
        if (String(snap.data()?.status) !== 'active') continue;
        tx.update(snap.ref, { status: 'expired', updatedAt: serverTimestamp() });
      }

      playerSnaps.forEach((snap, index) => {
        const id = playerIds[index];
        const delta = deltas.playerDeltas[id] ?? 0;
        if (!snap.exists() || delta <= 0) return;
        if (snap.data()?.proPanelActive === true) return;
        const sameDay = period != null && String(snap.data()?.dailyKey || '') === period.dayKey;
        const dailyBase = sameDay ? snap.data()?.dailyScore : 0;
        tx.set(
          snap.ref,
          {
            score: addGlobalScore(snap.data()?.score, delta),
            dailyScore: addGlobalScore(dailyBase, delta),
            dailyKey: period?.dayKey ?? null,
            lastScoreBattleId: battle.id,
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
      });

      const writeAllianceWeekly = (
        ref: ReturnType<typeof doc> | null,
        snap: typeof atkAllianceSnap,
        allianceId: string
      ) => {
        if (!ref || !snap?.exists()) return;
        const delta = deltas.allianceDeltas[allianceId] ?? 0;
        if (delta <= 0) return;
        const sameWeek = period != null && String(snap.data()?.weeklyKey || '') === period.weekKey;
        const weeklyBase = sameWeek ? snap.data()?.score : LEADERBOARD_WEEKLY_SCORE_BASE;
        tx.set(
          ref,
          {
            score: addGlobalScore(weeklyBase, delta),
            weeklyKey: period?.weekKey ?? null,
            lifetimeScore: addGlobalScore(snap.data()?.lifetimeScore ?? snap.data()?.score, delta),
            lastScoreBattleId: battle.id,
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
      };
      writeAllianceWeekly(atkAllianceRef, atkAllianceSnap, battle.attackerAllianceId || '');
      if (defAllianceRef?.path !== atkAllianceRef?.path) {
        writeAllianceWeekly(defAllianceRef, defAllianceSnap, battle.defenderAllianceId || '');
      }

      writeNotifications(tx, payload, {
        [battle.attackerAllianceId || '']: battle.attackerAllianceName || 'Hücum',
        [battle.defenderAllianceId || '']: battle.defenderAllianceName || 'Müdafiə',
      });

      return { ...payload, duplicate: false };
    }),
    WRITE_MS,
    'Battle bitirilmədi.'
  );

  if (period && finished.reason !== 'join_failed') {
    await commitLeaderboardAwardsFromFinish(finished, period).catch(() => {});
  }
  return finished;
}

async function commitLeaderboardAwardsFromFinish(
  result: Omit<BattleFinishResult, 'duplicate'> & { duplicate: boolean },
  period: { dayKey: string; weekKey: string }
) {
  const receiptRef = doc(db, LEADERBOARD_AWARDS_COLLECTION, result.battleId);
  return replayBattleRequest(`lb_award:${result.battleId}`, () =>
    withTimeout(
      runTransaction(db, async (tx) => {
        const receiptSnap = await tx.get(receiptRef);
        if (receiptSnap.exists()) return;
        const battleSnap = await tx.get(battleRef(result.battleId));
        const battle = battleSnap.exists()
          ? battleFromData(battleSnap.id, battleSnap.data())
          : null;
        const playerIds = Object.keys(result.playerDeltas);
        const playerSnaps = await Promise.all(playerIds.map((id) => tx.get(doc(db, 'players', id))));
        await applyBattleLeaderboardAwards(tx, {
          battleId: result.battleId,
          dayKey: period.dayKey,
          weekKey: period.weekKey,
          players: playerIds.map((id, index) => ({
            id,
            name: String(playerSnaps[index]?.data()?.displayName || id),
            delta: result.playerDeltas[id] ?? 0,
          })),
          alliances: [
            {
              id: result.attackerAllianceId || '',
              name: battle?.attackerAllianceName || 'Hücum',
              delta: result.allianceDeltas[result.attackerAllianceId || ''] ?? 0,
              activePlayerIds: battle?.attackerPlayerIds ?? [],
            },
            {
              id: result.defenderAllianceId || '',
              name: battle?.defenderAllianceName || 'Müdafiə',
              delta: result.allianceDeltas[result.defenderAllianceId || ''] ?? 0,
              activePlayerIds: battle?.defenderPlayerIds ?? [],
            },
          ].filter((item) => item.id),
        });
        tx.set(receiptRef, {
          battleId: result.battleId,
          dayKey: period.dayKey,
          weekKey: period.weekKey,
          status: 'done',
          schemaVersion: 1,
          createdAt: serverTimestamp(),
        });
      }),
      WRITE_MS,
      'Leaderboard yazılmadı.'
    )
  );
}

/** Client winner göndərmir. Eyni battle üçün təkrar finish receipt qaytarır. */
export function finishBattle(input: { battleId: string; playerId: string }): Promise<BattleFinishResult> {
  const battleId = sanitizeBattleId(input.battleId);
  return replayBattleRequest(`finish:${battleId}`, () => finishBattleWork(input));
}

export function listenBattleResult(
  battleId: string,
  onChange: (result: BattleFinishResult | null) => void
): Unsubscribe {
  return onSnapshot(battleResultRef(battleId), (snap) => {
    onChange(snap.exists() ? viewBattleFinishResult(battleId, snap.data() as Record<string, unknown>) : null);
  });
}
