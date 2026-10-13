import {
  collection,
  doc,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  type Transaction,
  type Unsubscribe,
} from 'firebase/firestore';
import type { BattleRecord } from '@/app/lib/battleEventLog/battleEventTypes';
import { db } from '@/firebase';
import { requireFirebaseAuth } from '@/app/lib/firebaseAuth';
import { replayBattleRequest } from '@/app/lib/battleReconnect/replayBattleRequest';
import { battleEventWrite, battleFromData, battleRef, newBattleEventRef } from '@/app/lib/battleEventLog/battleEventLog';
import { sanitizeBattleId, sanitizePlayerId } from '@/app/lib/battleEventLog/sanitizeBattleEventMeta';
import { serverNowMs, syncServerClock } from '@/app/lib/battlePlay/battleServerClock';
import {
  BATTLE_CHALLENGE_CLICKS,
  BATTLE_CHALLENGE_COLLECTION,
  BATTLE_CHALLENGE_DURATION_MS,
  BATTLE_CHALLENGE_SCHEMA,
  officialRequiredClicks,
  type BattleChallengeStatus,
} from './battleClickConfig';

export interface BattleChallenge {
  challengeId: string;
  battleId: string;
  cardId: string;
  targetAllianceId: string;
  requiredClicks: number;
  currentClicks: number;
  startedAt: number;
  expiresAt: number;
  status: BattleChallengeStatus;
}

const WRITE_MS = 12_000;

function challengeRef(battleId: string, challengeId: string) {
  return doc(db, 'battles', battleId, BATTLE_CHALLENGE_COLLECTION, challengeId);
}

function clickRef(battleId: string, challengeId: string, uid: string) {
  return doc(db, 'battles', battleId, BATTLE_CHALLENGE_COLLECTION, challengeId, BATTLE_CHALLENGE_CLICKS, uid);
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

function timestampMs(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (value && typeof value === 'object' && 'toMillis' in value) {
    const ms = (value as { toMillis: () => number }).toMillis();
    if (Number.isFinite(ms)) return ms;
  }
  return 0;
}

function parseStatus(value: unknown): BattleChallengeStatus {
  if (value === 'succeeded' || value === 'expired' || value === 'active') return value;
  return 'active';
}

export function viewBattleChallenge(id: string, data: Record<string, unknown>): BattleChallenge {
  const startedAt = timestampMs(data.startedAt);
  const duration = Number(data.durationMs) > 0 ? Number(data.durationMs) : BATTLE_CHALLENGE_DURATION_MS;
  return {
    challengeId: String(data.challengeId ?? id),
    battleId: String(data.battleId ?? ''),
    cardId: String(data.cardId ?? ''),
    targetAllianceId: String(data.targetAllianceId ?? ''),
    requiredClicks: Math.max(0, Math.trunc(Number(data.requiredClicks) || 0)),
    currentClicks: Math.max(0, Math.trunc(Number(data.currentClicks) || 0)),
    startedAt,
    expiresAt: timestampMs(data.expiresAt) || (startedAt > 0 ? startedAt + duration : 0),
    status: parseStatus(data.status),
  };
}

export function initialChallengeDoc(input: {
  challengeId: string;
  battleId: string;
  cardId: string;
  requestId: string;
  targetAllianceId: string;
  requiredClicks: number;
  createdBy: string;
}) {
  return {
    challengeId: input.challengeId,
    battleId: input.battleId,
    cardId: input.cardId,
    requestId: input.requestId,
    targetAllianceId: input.targetAllianceId,
    requiredClicks: input.requiredClicks,
    currentClicks: 0,
    startedAt: serverTimestamp(),
    durationMs: BATTLE_CHALLENGE_DURATION_MS,
    status: 'active' as const,
    createdBy: input.createdBy,
    schemaVersion: BATTLE_CHALLENGE_SCHEMA,
  };
}

export function listenBattleChallenges(
  battleId: string,
  onChange: (challenges: BattleChallenge[]) => void
): Unsubscribe {
  return onSnapshot(query(collection(db, 'battles', battleId, BATTLE_CHALLENGE_COLLECTION)), (snap) => {
    onChange(snap.docs.map((item) => viewBattleChallenge(item.id, item.data() as Record<string, unknown>)));
  });
}

function writeClickCompleted(
  tx: Transaction,
  battle: BattleRecord,
  input: { battleId: string; playerId: string; challenge: BattleChallenge; success: boolean }
) {
  const seq = battle.eventSeq + 1;
  const eventDoc = newBattleEventRef(input.battleId);
  tx.update(battleRef(input.battleId), {
    eventSeq: seq,
    updatedAt: serverTimestamp(),
  });
  tx.set(
    eventDoc,
    battleEventWrite({
      eventId: eventDoc.id,
      battleId: input.battleId,
      playerId: input.playerId,
      type: 'click_completed',
      seq,
      meta: {
        clicks: input.challenge.currentClicks,
        required: input.challenge.requiredClicks,
        success: input.success,
        requestId: input.challenge.challengeId,
      },
    })
  );
}

export async function submitChallengeClick(input: {
  battleId: string;
  challengeId: string;
  playerId: string;
}): Promise<BattleChallenge> {
  const user = await requireFirebaseAuth();
  const playerId = sanitizePlayerId(input.playerId);
  const battleId = sanitizeBattleId(input.battleId);
  const challengeId = String(input.challengeId || '').trim();
  if (!challengeId) throw new Error('Challenge tapılmadı');

  await syncServerClock().catch(() => {});
  const now = serverNowMs();
  if (now <= 0) throw new Error('Server saatı yoxdur');

  return replayBattleRequest(`click:${battleId}:${challengeId}:${user.uid}`, () =>
    withTimeout(
    runTransaction(db, async (tx) => {
      const chRef = challengeRef(battleId, challengeId);
      const clkRef = clickRef(battleId, challengeId, user.uid);
      const parentRef = battleRef(battleId);
      const playerRef = doc(db, 'players', playerId);

      const parentSnap = await tx.get(parentRef);
      const chSnap = await tx.get(chRef);
      const clkSnap = await tx.get(clkRef);
      const playerSnap = await tx.get(playerRef);
      if (!chSnap.exists()) throw new Error('Challenge tapılmadı');

      const challenge = viewBattleChallenge(chSnap.id, chSnap.data() as Record<string, unknown>);
      const allianceSnap = challenge.targetAllianceId
        ? await tx.get(doc(db, 'alliances', challenge.targetAllianceId))
        : null;
      const battle = parentSnap.exists() ? battleFromData(parentSnap.id, parentSnap.data()) : null;

      if (clkSnap.exists()) return challenge;
      if (challenge.status !== 'active') throw new Error('Challenge bitib');
      if (battle?.status === 'finished') throw new Error('Battle aktiv deyil');

      if (challenge.expiresAt > 0 && now >= challenge.expiresAt) {
        const expired = { ...challenge, status: 'expired' as const };
        tx.update(chRef, { status: 'expired', updatedAt: serverTimestamp() });
        if (battle) writeClickCompleted(tx, battle, { battleId, playerId, challenge: expired, success: false });
        return expired;
      }

      if (!playerSnap.exists()) throw new Error('Oyunçu tapılmadı');
      const allianceId = String(playerSnap.data()?.allianceId || '');
      if (!allianceId || allianceId !== challenge.targetAllianceId) {
        throw new Error('Yalnız hədəf ittifaq klik edə bilər');
      }
      const members: string[] = Array.isArray(allianceSnap?.data()?.members)
        ? (allianceSnap?.data()?.members as unknown[]).map(String)
        : [];
      const leaderId = String(allianceSnap?.data()?.leaderId || '');
      if (!members.includes(playerId) && leaderId !== playerId) {
        throw new Error('İttifaq üzvü deyilsən');
      }

      if (challenge.currentClicks >= challenge.requiredClicks) {
        throw new Error('Challenge artıq bitib');
      }

      const currentClicks = challenge.currentClicks + 1;
      const succeeded = currentClicks >= challenge.requiredClicks;
      const next: BattleChallenge = {
        ...challenge,
        currentClicks,
        status: succeeded ? 'succeeded' : 'active',
      };

      tx.set(clkRef, {
        uid: user.uid,
        playerId,
        createdAt: serverTimestamp(),
        schemaVersion: BATTLE_CHALLENGE_SCHEMA,
      });
      tx.update(chRef, {
        currentClicks,
        status: next.status,
        updatedAt: serverTimestamp(),
      });
      if (succeeded && battle) {
        writeClickCompleted(tx, battle, { battleId, playerId, challenge: next, success: true });
      }
      return next;
    }),
    WRITE_MS,
    'Klik yazılmadı.'
    )
  );
}

export async function expireBattleChallenge(input: {
  battleId: string;
  challengeId: string;
  playerId: string;
}): Promise<BattleChallenge> {
  await requireFirebaseAuth();
  const playerId = sanitizePlayerId(input.playerId);
  const battleId = sanitizeBattleId(input.battleId);
  const challengeId = String(input.challengeId || '').trim();
  if (!challengeId) throw new Error('Challenge tapılmadı');

  await syncServerClock().catch(() => {});
  const now = serverNowMs();
  if (now <= 0) throw new Error('Server saatı yoxdur');

  return replayBattleRequest(`expire:${battleId}:${challengeId}`, () =>
    withTimeout(
    runTransaction(db, async (tx) => {
      const chRef = challengeRef(battleId, challengeId);
      const parentRef = battleRef(battleId);
      const parentSnap = await tx.get(parentRef);
      const chSnap = await tx.get(chRef);
      if (!chSnap.exists()) throw new Error('Challenge tapılmadı');
      const challenge = viewBattleChallenge(chSnap.id, chSnap.data() as Record<string, unknown>);
      if (challenge.status !== 'active') return challenge;
      if (now < challenge.expiresAt) throw new Error('Challenge hələ bitməyib');

      const expired = { ...challenge, status: 'expired' as const };
      tx.update(chRef, { status: 'expired', updatedAt: serverTimestamp() });
      if (parentSnap.exists()) {
        writeClickCompleted(tx, battleFromData(parentSnap.id, parentSnap.data()), {
          battleId,
          playerId,
          challenge: expired,
          success: false,
        });
      }
      return expired;
    }),
    WRITE_MS,
    'Challenge bağlanmadı.'
    )
  );
}

export function computeChallengeRequired(cardId: string, members: unknown): number {
  return officialRequiredClicks(cardId, members);
}
