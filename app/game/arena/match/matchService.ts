import {
  collection,
  doc,
  onSnapshot,
  runTransaction,
  setDoc,
  type Transaction,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from '@/firebase';
import { requireFirebaseAuth, withTimeout } from '@/app/lib/firebaseAuth';
import { sanitizeBattleId, sanitizePlayerId } from '@/app/lib/battleEventLog/sanitizeBattleEventMeta';
import { replayBattleRequest } from '@/app/lib/battleReconnect/replayBattleRequest';
import { finishBattle } from '@/app/lib/battleFinish';
import { serverNowMs, syncServerClock } from '@/app/lib/battlePlay/battleServerClock';
import {
  ARENA_ENERGY_MAX,
  ARENA_ENERGY_START,
  ARENA_MATCH_COLLECTION,
  ARENA_PRESENCE_COLLECTION,
  ARENA_SLOT_COUNT,
  ARENA_TURN_DURATION_MS,
} from './config';
import { BATTLE_RESULT_COLLECTION, BATTLE_RESULT_DOC_ID } from '@/app/lib/battleFinish/battleFinishConfig';
import { assertArenaActionAllowed, assertArenaTimeoutAllowed, assertStartEnergy, rejectClientEnergyWrite } from './policy';
import { applyArenaMatchCompletion, officialArenaFinishReason } from './completion';
import { advanceMatchTurn, applyArenaSeat, createMatchSnapshot, filledParticipantIds } from './turnOrder';
import { applyArenaCardPlay, applyLockedLoadout, assertArenaLoadoutLockAllowed, fillClickerUsyanLoadouts } from './loadout';
import { emptyArenaEffects } from './effects/types';
import { opponentPlayerId, serverActiveUsers } from './effects/engine';
import { publicAuditCardId } from './effects/interaction';
import {
  ARENA_REWARD_COLLECTION,
  ARENA_REWARD_EVENTS_COLLECTION,
} from './reward/config';
import {
  assertArenaRewardEligible,
  buildArenaRewardRecord,
  planArenaMatchRewards,
} from './reward/eligibility';
import { arenaRewardLedgerWrite, arenaRewardRef, parseArenaReward } from './reward/rewardService';
import type { ArenaRewardEventType, ArenaRewardRecord } from './reward/types';
import {
  applyArenaClick,
  expireArenaReactionState,
  forwardArenaReactionChat,
  officialReactionChatText,
} from './reaction';
import type { ArenaReactionState } from './reaction/types';
import type {
  ArenaLoadoutCard,
  ArenaMatchState,
  ArenaPlayerLoadout,
  ArenaPlayerState,
  ArenaMatchResult,
  ArenaPresenceState,
  ArenaResultStatus,
  ArenaSide,
  ArenaTurnRole,
} from './types';

const TX_MS = 12_000;

export function matchRef(matchId: string) {
  return doc(db, ARENA_MATCH_COLLECTION, matchId);
}

export async function seatArenaCombatantInTx(
  tx: Transaction,
  matchId: string,
  playerId: string,
  side: 'home' | 'away',
  displayName?: string
): Promise<void> {
  const ref = matchRef(matchId);
  const snap = await tx.get(ref);
  if (!snap.exists()) return;
  const current = matchFromData(snap.id, snap.data() as Record<string, unknown>);
  if (current.status === 'closed') return;
  const next = fillClickerUsyanLoadouts(applyArenaSeat(current, playerId, side, displayName));
  if (next === current) return;
  tx.update(ref, {
    homePlayerIds: next.homePlayerIds,
    awayPlayerIds: next.awayPlayerIds,
    participantIds: next.participantIds,
    players: next.players,
    displayNames: next.displayNames,
    loadouts: next.loadouts,
    updatedAt: Date.now(),
  });
}

function presenceRef(matchId: string, playerId: string) {
  return doc(db, ARENA_MATCH_COLLECTION, matchId, ARENA_PRESENCE_COLLECTION, playerId);
}

function asInt(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.trunc(value) : fallback;
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function padIds(value: unknown): Array<string | null> {
  const list = Array.isArray(value) ? value : [];
  const next: Array<string | null> = [];
  for (let i = 0; i < ARENA_SLOT_COUNT; i += 1) {
    const raw = list[i];
    if (typeof raw === 'string' && raw.trim()) next.push(raw.trim());
    else next.push(null);
  }
  return next;
}

function parseBoolMap(raw: unknown): Record<string, boolean> {
  if (!raw || typeof raw !== 'object') return {};
  const next: Record<string, boolean> = {};
  Object.entries(raw as Record<string, unknown>).forEach(([id, value]) => {
    if (value === true) next[id] = true;
  });
  return next;
}

function parseReaction(raw: unknown): ArenaReactionState | null {
  if (!raw || typeof raw !== 'object') return null;
  const data = raw as Record<string, unknown>;
  const status = asString(data.status);
  if (!['ACTIVE', 'SUCCESS', 'FAILED', 'EXPIRED', 'CANCELLED'].includes(status)) return null;
  const pendingRaw = data.pending && typeof data.pending === 'object' ? (data.pending as Record<string, unknown>) : {};
  const kind = asString(pendingRaw.kind);
  if (kind !== 'damage' && kind !== 'qul' && kind !== 'usyan') return null;
  const peakRaw = pendingRaw.peak && typeof pendingRaw.peak === 'object' ? (pendingRaw.peak as Record<string, unknown>) : null;
  const sizeTier = asString(data.sizeTier);
  return {
    active: data.active === true,
    reactionId: asString(data.reactionId),
    matchId: asString(data.matchId),
    sourcePlayerId: asString(data.sourcePlayerId),
    sourceAllianceId: asString(data.sourceAllianceId),
    targetAllianceId: asString(data.targetAllianceId),
    targetSide: data.targetSide === 'away' ? 'away' : 'home',
    cardId: asString(data.cardId),
    mode:
      data.mode === 'earthquake' || data.mode === 'tsunami' || data.mode === 'fire' || data.mode === 'ice'
        ? data.mode
        : null,
    startedAt: asInt(data.startedAt),
    expiresAt: asInt(data.expiresAt),
    durationMs: asInt(data.durationMs, 15_000),
    requiredClicks: asInt(data.requiredClicks),
    currentClicks: asInt(data.currentClicks),
    status: status as ArenaReactionState['status'],
    sizeTier: sizeTier === 'MEDIUM' || sizeTier === 'LARGE' ? sizeTier : 'SMALL',
    usedActionIds: parseBoolMap(data.usedActionIds),
    clickers: parseBoolMap(data.clickers),
    pending: {
      kind,
      damage: asInt(pendingRaw.damage),
      attackerId: asString(pendingRaw.attackerId),
      attackerSide: pendingRaw.attackerSide === 'away' ? 'away' : 'home',
      defenderSide: pendingRaw.defenderSide === 'away' ? 'away' : 'home',
      peak: peakRaw ? { startAt: asInt(peakRaw.startAt), score: asInt(peakRaw.score) } : null,
    },
    chatForwarded: data.chatForwarded === true,
    chatText: asString(data.chatText),
  };
}

function parseResult(raw: unknown, matchId: string): ArenaMatchResult | null {
  if (!raw || typeof raw !== 'object') return null;
  const data = raw as Record<string, unknown>;
  const status = asString(data.status);
  if (status !== 'COMPLETED' && status !== 'CANCELLED' && status !== 'EXPIRED') return null;
  return {
    status: status as ArenaResultStatus,
    resultId: asString(data.resultId) || `${matchId}_final`,
    matchId: asString(data.matchId) || matchId,
    gameMode: data.gameMode === '5v5' ? '5v5' : '1v1',
    winnerAllianceId: asString(data.winnerAllianceId) || null,
    loserAllianceId: asString(data.loserAllianceId) || null,
    winnerPlayerId: asString(data.winnerPlayerId) || null,
    loserPlayerId: asString(data.loserPlayerId) || null,
    winnerScore: asInt(data.winnerScore),
    loserScore: asInt(data.loserScore),
    finalDamage: asInt(data.finalDamage),
    completedAt: asInt(data.completedAt),
  };
}

function parseLoadoutCard(raw: unknown): ArenaLoadoutCard | null {
  if (!raw || typeof raw !== 'object') return null;
  const data = raw as Record<string, unknown>;
  const cardId = asString(data.cardId);
  if (!cardId) return null;
  const maxUses = asInt(data.maxUses, 3);
  const used = asInt(data.used);
  return {
    cardId,
    maxUses,
    used,
    remaining: asInt(data.remaining, Math.max(0, maxUses - used)),
  };
}

function parseLoadout(raw: unknown, playerId: string, matchId: string): ArenaPlayerLoadout | null {
  if (!raw || typeof raw !== 'object') return null;
  const data = raw as Record<string, unknown>;
  const cardsRaw = Array.isArray(data.cards) ? data.cards : [];
  const cards = cardsRaw.map(parseLoadoutCard).filter((card): card is ArenaLoadoutCard => Boolean(card));
  const clickerUsyan = cards.length === 1 && cards[0]?.cardId === 'usyan';
  if (!clickerUsyan && cards.length !== 5) return null;
  return {
    playerId: asString(data.playerId) || playerId,
    matchId: asString(data.matchId) || matchId,
    cards,
  };
}

function parsePlayer(raw: unknown, fallbackId: string): ArenaPlayerState | null {
  if (!raw || typeof raw !== 'object') return null;
  const data = raw as Record<string, unknown>;
  const playerId = asString(data.playerId) || fallbackId;
  if (!playerId) return null;
  const role = asString(data.role) as ArenaTurnRole;
  const side = asString(data.side) as ArenaSide;
  return {
    playerId,
    role: role === 'HELP_LIDER' || role === 'CLICKER' || role === 'MEMBER' ? role : 'LIDER',
    side: side === 'away' ? 'away' : 'home',
    slotIndex: asInt(data.slotIndex),
    energy: asInt(data.energy, ARENA_ENERGY_START),
    maxEnergy: asInt(data.maxEnergy, ARENA_ENERGY_MAX),
  };
}

export function matchFromData(matchId: string, raw: Record<string, unknown> | undefined): ArenaMatchState {
  if (!raw) throw new Error('Match tapılmadı');
  const playersRaw = raw.players && typeof raw.players === 'object' ? (raw.players as Record<string, unknown>) : {};
  const players: Record<string, ArenaPlayerState> = {};
  Object.entries(playersRaw).forEach(([id, value]) => {
    const parsed = parsePlayer(value, id);
    if (parsed) players[id] = parsed;
  });
  const namesRaw =
    raw.displayNames && typeof raw.displayNames === 'object' ? (raw.displayNames as Record<string, unknown>) : {};
  const displayNames: Record<string, string> = {};
  Object.entries(namesRaw).forEach(([id, value]) => {
    if (typeof value === 'string' && value.trim()) displayNames[id] = value.trim().slice(0, 32);
  });
  const loadoutsRaw = raw.loadouts && typeof raw.loadouts === 'object' ? (raw.loadouts as Record<string, unknown>) : {};
  const loadouts: Record<string, ArenaPlayerLoadout> = {};
  Object.entries(loadoutsRaw).forEach(([id, value]) => {
    const parsed = parseLoadout(value, id, matchId);
    if (parsed) loadouts[id] = parsed;
  });
  const usedRaw =
    raw.usedActionIds && typeof raw.usedActionIds === 'object' ? (raw.usedActionIds as Record<string, unknown>) : {};
  const usedActionIds: Record<string, boolean> = {};
  Object.entries(usedRaw).forEach(([id, value]) => {
    if (value === true) usedActionIds[id] = true;
  });
  return {
    matchId,
    status: raw.status === 'closed' ? 'closed' : 'active',
    phase: raw.phase === 'loadout' ? 'loadout' : 'combat',
    createdBy: asString(raw.createdBy),
    homePlayerIds: padIds(raw.homePlayerIds),
    awayPlayerIds: padIds(raw.awayPlayerIds),
    participantIds: Array.isArray(raw.participantIds)
      ? [...new Set(raw.participantIds.filter((id): id is string => typeof id === 'string' && Boolean(id.trim())))]
      : filledParticipantIds(padIds(raw.homePlayerIds), padIds(raw.awayPlayerIds)),
    players,
    displayNames,
    currentTurn: asString(raw.currentTurn),
    turnSide: raw.turnSide === 'away' ? 'away' : 'home',
    turnSlotIndex: asInt(raw.turnSlotIndex),
    turnIndex: asInt(raw.turnIndex),
    turnSeq: asInt(raw.turnSeq),
    turnStartedAt: asInt(raw.turnStartedAt),
    turnExpiresAt: asInt(raw.turnExpiresAt),
    turnDuration: asInt(raw.turnDuration, ARENA_TURN_DURATION_MS),
    lastActionId: typeof raw.lastActionId === 'string' ? raw.lastActionId : null,
    lastActionTurnSeq: asInt(raw.lastActionTurnSeq, -1),
    loadouts,
    usedActionIds,
    gameMode: raw.gameMode === '5v5' ? '5v5' : '1v1',
    homeAllianceId: asString(raw.homeAllianceId),
    awayAllianceId: asString(raw.awayAllianceId),
    reaction: parseReaction(raw.reaction),
    result: parseResult(raw.result, matchId),
    sideScores: {
      home: asInt((raw.sideScores as Record<string, unknown> | undefined)?.home),
      away: asInt((raw.sideScores as Record<string, unknown> | undefined)?.away),
    },
    scoreHistory: Array.isArray(raw.scoreHistory)
      ? raw.scoreHistory
          .map((tick) => {
            if (!tick || typeof tick !== 'object') return null;
            const row = tick as Record<string, unknown>;
            return {
              at: asInt(row.at),
              side: row.side === 'away' ? 'away' as const : 'home' as const,
              score: asInt(row.score),
            };
          })
          .filter((tick): tick is NonNullable<typeof tick> => Boolean(tick))
      : [],
    effects: { ...emptyArenaEffects(), ...(raw.effects && typeof raw.effects === 'object' ? (raw.effects as object) : {}) },
    createdAt: asInt(raw.createdAt),
    updatedAt: asInt(raw.updatedAt),
  };
}

function matchWrite(match: ArenaMatchState): Record<string, unknown> {
  return {
    matchId: match.matchId,
    status: match.status,
    phase: match.phase,
    createdBy: match.createdBy,
    homePlayerIds: match.homePlayerIds,
    awayPlayerIds: match.awayPlayerIds,
    participantIds: match.participantIds,
    players: match.players,
    displayNames: match.displayNames,
    currentTurn: match.currentTurn,
    turnSide: match.turnSide,
    turnSlotIndex: match.turnSlotIndex,
    turnIndex: match.turnIndex,
    turnSeq: match.turnSeq,
    turnStartedAt: match.turnStartedAt,
    turnExpiresAt: match.turnExpiresAt,
    turnDuration: match.turnDuration,
    lastActionId: match.lastActionId,
    lastActionTurnSeq: match.lastActionTurnSeq,
    loadouts: match.loadouts,
    usedActionIds: match.usedActionIds,
    gameMode: match.gameMode,
    homeAllianceId: match.homeAllianceId,
    awayAllianceId: match.awayAllianceId,
    reaction: match.reaction,
    result: match.result,
    sideScores: match.sideScores,
    scoreHistory: match.scoreHistory,
    effects: match.effects,
    energyStart: ARENA_ENERGY_START,
    energyMax: ARENA_ENERGY_MAX,
    schemaVersion: 1,
    createdAt: match.createdAt,
    updatedAt: match.updatedAt,
  };
}

async function requireServerNow(): Promise<number> {
  let now = serverNowMs();
  if (now <= 0) now = await syncServerClock();
  if (now <= 0) {
    await new Promise((resolve) => setTimeout(resolve, 80));
    now = await syncServerClock();
  }
  if (now <= 0) throw new Error('Server saatı yoxdur');
  return now;
}

function resultDocRef(matchId: string) {
  return doc(db, ARENA_MATCH_COLLECTION, matchId, BATTLE_RESULT_COLLECTION, BATTLE_RESULT_DOC_ID);
}

function battleCompletedPayload(
  result: ArenaMatchResult,
  timestamp: number,
  participantIds: string[]
): Record<string, unknown> {
  return {
    type: 'BATTLE_COMPLETED',
    eventType: 'BATTLE_COMPLETED',
    status: result.status,
    resultId: result.resultId,
    matchId: result.matchId,
    gameMode: result.gameMode,
    winnerAllianceId: result.winnerAllianceId,
    loserAllianceId: result.loserAllianceId,
    winnerPlayerId: result.winnerPlayerId,
    loserPlayerId: result.loserPlayerId,
    winnerScore: result.winnerScore,
    loserScore: result.loserScore,
    finalDamage: result.finalDamage,
    completedAt: result.completedAt,
    timestamp,
    participantIds,
  };
}

export async function completeArenaMatch(input: { matchId: string }): Promise<ArenaMatchState> {
  await requireFirebaseAuth();
  const matchId = sanitizeBattleId(input.matchId);
  const now = await requireServerNow();
  const lockKey = `arena-complete:${matchId}`;
  const closed = await replayBattleRequest(lockKey, async () =>
    withTimeout(
      runTransaction(db, async (tx) => {
        const ref = matchRef(matchId);
        const resultRef = resultDocRef(matchId);
        const auditRef = doc(db, ARENA_MATCH_COLLECTION, matchId, 'audit', `${matchId}_final`);
        const eventRef = doc(db, ARENA_MATCH_COLLECTION, matchId, 'reaction_events', `${matchId}_BATTLE_COMPLETED`);
        const snap = await tx.get(ref);
        const resultSnap = await tx.get(resultRef);
        const auditSnap = await tx.get(auditRef);
        const eventSnap = await tx.get(eventRef);
        if (!snap.exists()) throw new Error('Match tapılmadı');
        const match = matchFromData(snap.id, snap.data() as Record<string, unknown>);
        if (match.status === 'closed' && match.result) {
          return match;
        }
        const next = applyArenaMatchCompletion(match, now);
        const result = next.result;
        if (!result) throw new Error('REJECT');
        tx.update(ref, {
          status: next.status,
          result,
          updatedAt: next.updatedAt,
        });
        if (!resultSnap.exists()) {
          tx.set(resultRef, battleCompletedPayload(result, now, match.participantIds));
        }
        if (!auditSnap.exists()) {
          tx.set(auditRef, {
            matchId,
            playerId: match.createdBy,
            cardId: '',
            timestamp: now,
            energyBefore: 0,
            energyAfter: 0,
            usesBefore: 0,
            usesAfter: 0,
            effectType: 'BATTLE_COMPLETED',
            damage: result.finalDamage,
            actionId: result.resultId,
            result: 'BATTLE_COMPLETED',
          });
        }
        if (!eventSnap.exists()) {
          tx.set(eventRef, {
            type: 'BATTLE_COMPLETED',
            matchId,
            reactionId: '',
            playerId: match.createdBy,
            timestamp: now,
            cardId: '',
            currentClicks: 0,
            requiredClicks: 0,
            actionId: result.resultId,
            resultId: result.resultId,
            gameMode: result.gameMode,
            winnerAllianceId: result.winnerAllianceId,
            loserAllianceId: result.loserAllianceId,
            winnerPlayerId: result.winnerPlayerId,
            loserPlayerId: result.loserPlayerId,
            winnerScore: result.winnerScore,
            loserScore: result.loserScore,
            finalDamage: result.finalDamage,
            completedAt: result.completedAt,
          });
        }
        return next;
      }),
      TX_MS,
      'Arena nəticə yazılmadı'
    )
  );
  await persistArenaMatchRewards(closed);
  if (closed.gameMode === '5v5') {
    await finishBattle({ battleId: matchId, playerId: closed.createdBy }).catch(() => {});
  }
  return closed;
}

function writeArenaRewardEvents(tx: Transaction, record: ArenaRewardRecord, timestamp: number) {
  const types: ArenaRewardEventType[] = [
    'REWARD_ELIGIBILITY_CHECKED',
    'REWARD_CREATED',
    'REWARD_SECURITY_CHECKED',
    record.status === 'REJECTED' ? 'REWARD_REJECTED' : 'REWARD_APPROVED',
  ];
  types.forEach((type) => {
    tx.set(doc(db, ARENA_REWARD_COLLECTION, record.rewardId, ARENA_REWARD_EVENTS_COLLECTION, type), {
      type,
      rewardId: record.rewardId,
      matchId: record.matchId,
      sourceId: record.sourceId,
      periodId: record.periodId,
      status: record.status,
      timestamp,
    });
  });
}

export async function persistArenaMatchRewards(match: ArenaMatchState): Promise<ArenaRewardRecord[]> {
  if (match.status !== 'closed' || !match.result || match.result.status !== 'COMPLETED') return [];
  const matchId = sanitizeBattleId(match.matchId);
  await requireFirebaseAuth();
  const now = await requireServerNow();
  return replayBattleRequest(`arena-reward:${matchId}`, async () =>
    withTimeout(
      runTransaction(db, async (tx) => {
        const matchSnap = await tx.get(matchRef(matchId));
        if (!matchSnap.exists()) throw new Error('Match tapılmadı');
        const live = matchFromData(matchSnap.id, matchSnap.data() as Record<string, unknown>);
        const plans = planArenaMatchRewards(live);
        const rewardSnaps = await Promise.all(plans.map((plan) => tx.get(arenaRewardRef(plan.rewardId))));
        const userIds = plans.filter((plan) => plan.recipientType === 'USER').map((plan) => plan.recipientId);
        const playerSnaps = await Promise.all(userIds.map((id) => tx.get(doc(db, 'players', id))));
        const written: ArenaRewardRecord[] = [];
        plans.forEach((plan, index) => {
          assertArenaRewardEligible(live, plan);
          const existing = parseArenaReward(
            rewardSnaps[index].data() as Record<string, unknown> | undefined,
            plan.rewardId
          );
          if (existing) {
            written.push(existing);
            return;
          }
          const playerData = plan.recipientType === 'USER'
            ? (playerSnaps[userIds.indexOf(plan.recipientId)]?.data() as Record<string, unknown> | undefined)
            : undefined;
          const blocked = playerData?.banned === true || playerData?.frozen === true;
          const record = buildArenaRewardRecord({
            plan,
            createdAt: now,
            blocked,
            receiptExists: rewardSnaps[index].exists(),
          });
          if (!record) return;
          tx.set(arenaRewardRef(record.rewardId), arenaRewardLedgerWrite(record));
          writeArenaRewardEvents(tx, record, now);
          written.push(record);
        });
        return written;
      }),
      TX_MS,
      'Mükafat yazılmadı'
    )
  );
}

async function maybeFinalizeArenaMatch(match: ArenaMatchState): Promise<ArenaMatchState> {
  if (match.status === 'closed' && match.result) return match;
  if (!officialArenaFinishReason(match)) return match;
  return completeArenaMatch({ matchId: match.matchId });
}

export async function createArenaMatch(input: {
  createdBy: string;
  homePlayerIds: Array<string | null>;
  awayPlayerIds: Array<string | null>;
  displayNames?: Record<string, string>;
  matchId?: string;
  gameMode?: '1v1' | '5v5';
  homeAllianceId?: string;
  awayAllianceId?: string;
}): Promise<ArenaMatchState> {
  const user = await requireFirebaseAuth();
  const createdBy = sanitizePlayerId(input.createdBy);
  const now = await requireServerNow();
  const ref = input.matchId
    ? matchRef(sanitizeBattleId(input.matchId))
    : doc(collection(db, ARENA_MATCH_COLLECTION));
  return withTimeout(
    runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      if (snap.exists()) {
        return matchFromData(snap.id, snap.data() as Record<string, unknown>);
      }
      const created = createMatchSnapshot({
        matchId: ref.id,
        createdBy,
        homePlayerIds: input.homePlayerIds,
        awayPlayerIds: input.awayPlayerIds,
        displayNames: input.displayNames,
        serverNow: now,
        gameMode: input.gameMode,
        homeAllianceId: input.homeAllianceId,
        awayAllianceId: input.awayAllianceId,
      });
      const participantIds = [...created.participantIds];
      if (user.uid && !participantIds.includes(user.uid)) participantIds.push(user.uid);
      const match = fillClickerUsyanLoadouts({
        ...created,
        participantIds,
        phase: 'loadout' as const,
        loadouts: {},
        usedActionIds: {},
      });
      assertStartEnergy(match.players);
      tx.set(ref, matchWrite(match));
      return match;
    }),
    TX_MS,
    'Arena match yaradılmadı'
  );
}

export function listenArenaMatch(
  matchId: string,
  onValue: (match: ArenaMatchState) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  const id = sanitizeBattleId(matchId);
  return onSnapshot(
    matchRef(id),
    (snap) => {
      if (!snap.exists()) {
        onError?.(new Error('Match tapılmadı'));
        return;
      }
      onValue(matchFromData(snap.id, snap.data() as Record<string, unknown>));
    },
    (error) => onError?.(error instanceof Error ? error : new Error('Match oxunmadı'))
  );
}

export function listenArenaPresence(
  matchId: string,
  onValue: (presence: Record<string, ArenaPresenceState>) => void
): Unsubscribe {
  const id = sanitizeBattleId(matchId);
  return onSnapshot(collection(db, ARENA_MATCH_COLLECTION, id, ARENA_PRESENCE_COLLECTION), (snap) => {
    const next: Record<string, ArenaPresenceState> = {};
    snap.forEach((docSnap) => {
      const data = docSnap.data() as Record<string, unknown>;
      next[docSnap.id] = {
        playerId: docSnap.id,
        online: data.online === true,
        updatedAt: asInt(data.updatedAt),
      };
    });
    onValue(next);
  });
}

export async function heartbeatArenaPresence(input: {
  matchId: string;
  playerId: string;
  online: boolean;
}): Promise<void> {
  await requireFirebaseAuth();
  const matchId = sanitizeBattleId(input.matchId);
  const playerId = sanitizePlayerId(input.playerId);
  const now = await requireServerNow();
  await setDoc(presenceRef(matchId, playerId), {
    playerId,
    online: input.online === true,
    updatedAt: now,
  });
}

export async function submitArenaTurnAction(input: {
  matchId: string;
  playerId: string;
  actionId: string;
}): Promise<ArenaMatchState> {
  await requireFirebaseAuth();
  const matchId = sanitizeBattleId(input.matchId);
  const playerId = sanitizePlayerId(input.playerId);
  const actionId = asString(input.actionId).slice(0, 64);
  if (!actionId) throw new Error('Action id yoxdur');
  const now = await requireServerNow();
  const lockKey = `arena-action:${matchId}:${actionId}`;
  return replayBattleRequest(lockKey, async () =>
    withTimeout(
      runTransaction(db, async (tx) => {
        const snap = await tx.get(matchRef(matchId));
        if (!snap.exists()) throw new Error('Match tapılmadı');
        const match = matchFromData(snap.id, snap.data() as Record<string, unknown>);
        const verdict = assertArenaActionAllowed({ match, playerId, actionId, serverNow: now });
        if (verdict === 'duplicate') return match;
        const next = advanceMatchTurn(match, now);
        tx.update(matchRef(matchId), matchWrite(next));
        return next;
      }),
      TX_MS,
      'Arena action vaxtı bitdi'
    ).then(maybeFinalizeArenaMatch)
  );
}

export async function timeoutArenaTurn(input: { matchId: string }): Promise<ArenaMatchState> {
  await requireFirebaseAuth();
  const matchId = sanitizeBattleId(input.matchId);
  const now = await requireServerNow();
  const lockKey = `arena-timeout:${matchId}`;
  return replayBattleRequest(lockKey, async () =>
    withTimeout(
      runTransaction(db, async (tx) => {
        const snap = await tx.get(matchRef(matchId));
        if (!snap.exists()) throw new Error('Match tapılmadı');
        const match = matchFromData(snap.id, snap.data() as Record<string, unknown>);
        assertArenaTimeoutAllowed(match, now);
        const next = advanceMatchTurn(match, now);
        tx.update(matchRef(matchId), matchWrite(next));
        return next;
      }),
      TX_MS,
      'Arena timeout vaxtı bitdi'
    ).then(maybeFinalizeArenaMatch)
  );
}

export async function lockArenaLoadout(input: {
  matchId: string;
  playerId: string;
  cardIds: unknown;
}): Promise<ArenaMatchState> {
  await requireFirebaseAuth();
  const matchId = sanitizeBattleId(input.matchId);
  const playerId = sanitizePlayerId(input.playerId);
  const now = await requireServerNow();
  const lockKey = `arena-loadout:${matchId}:${playerId}`;
  return replayBattleRequest(lockKey, async () =>
    withTimeout(
      runTransaction(db, async (tx) => {
        const snap = await tx.get(matchRef(matchId));
        if (!snap.exists()) throw new Error('Match tapılmadı');
        const match = matchFromData(snap.id, snap.data() as Record<string, unknown>);
        const loadout = assertArenaLoadoutLockAllowed({ match, playerId, cardIds: input.cardIds });
        const next = applyLockedLoadout(match, loadout, now);
        tx.update(matchRef(matchId), matchWrite(next));
        return next;
      }),
      TX_MS,
      'Loadout yazılmadı'
    )
  );
}

export async function playArenaCard(input: {
  matchId: string;
  playerId: string;
  cardId: string;
  actionId: string;
  mode?: unknown;
}): Promise<ArenaMatchState> {
  await requireFirebaseAuth();
  const matchId = sanitizeBattleId(input.matchId);
  const playerId = sanitizePlayerId(input.playerId);
  const cardId = asString(input.cardId);
  const actionId = asString(input.actionId).slice(0, 64);
  if (!cardId) throw new Error('Kart ID yoxdur');
  if (!actionId) throw new Error('Action id yoxdur');
  const now = await requireServerNow();
  const lockKey = `arena-play:${matchId}:${actionId}`;
  return replayBattleRequest(lockKey, async () =>
    withTimeout(
      runTransaction(db, async (tx) => {
        const snap = await tx.get(matchRef(matchId));
        if (!snap.exists()) throw new Error('Match tapılmadı');
        const match = matchFromData(snap.id, snap.data() as Record<string, unknown>);
        const energyBefore = match.players[playerId]?.energy ?? 0;
        const usesBefore = match.loadouts[playerId]?.cards.find((card) => card.cardId === cardId)?.remaining ?? 0;
        const oppSide = match.players[playerId]?.side === 'home' ? 'away' : 'home';
        const next = applyArenaCardPlay({
          match,
          playerId,
          cardId,
          actionId,
          serverNow: now,
          mode: input.mode,
          activeUsers: serverActiveUsers(match, {}, oppSide),
        });
        if (next === match) return match;
        tx.update(matchRef(matchId), matchWrite(next));
        const auditRef = doc(db, ARENA_MATCH_COLLECTION, matchId, 'audit', actionId);
        const hidden = Boolean(next.effects.lastPlay?.hidden);
        tx.set(auditRef, {
          matchId,
          playerId,
          cardId: publicAuditCardId(cardId, hidden),
          mode: hidden ? null : input.mode ?? null,
          timestamp: now,
          energyBefore,
          energyAfter: next.players[playerId]?.energy ?? energyBefore,
          usesBefore,
          usesAfter: next.loadouts[playerId]?.cards.find((card) => card.cardId === cardId)?.remaining ?? usesBefore,
          effectType: hidden ? 'Gizli kart' : next.effects.lastSummary,
          damage: next.effects.lastPlay?.damage ?? 0,
          targetPlayer: opponentPlayerId(match, playerId),
          result: hidden ? 'Gizli kart' : next.effects.lastSummary,
          actionId,
          events: next.effects.lastEvents ?? ['CARD_PLAYED', 'CARD_EFFECT_FINALIZED'],
        });
        if (next.reaction && next.reaction.reactionId) {
          const eventRef = doc(db, ARENA_MATCH_COLLECTION, matchId, 'reaction_events', `${actionId}_created`);
          tx.set(eventRef, {
            type: 'reactionCreated',
            matchId,
            reactionId: next.reaction.reactionId,
            playerId,
            timestamp: now,
            cardId: next.reaction.cardId,
            currentClicks: 0,
            requiredClicks: next.reaction.requiredClicks,
            actionId,
          });
        }
        return next;
      }),
      TX_MS,
      'Kart oynanılmadı'
    ).then(maybeFinalizeArenaMatch)
  );
}

export async function submitArenaReactionClick(input: {
  matchId: string;
  playerId: string;
  reactionId: string;
  actionId: string;
}): Promise<ArenaMatchState> {
  await requireFirebaseAuth();
  const matchId = sanitizeBattleId(input.matchId);
  const playerId = sanitizePlayerId(input.playerId);
  const reactionId = asString(input.reactionId).slice(0, 64);
  const actionId = asString(input.actionId).slice(0, 64);
  if (!reactionId || !actionId) throw new Error('REJECT');
  const now = await requireServerNow();
  const lockKey = `arena-click:${matchId}:${actionId}`;
  return replayBattleRequest(lockKey, async () =>
    withTimeout(
      runTransaction(db, async (tx) => {
        const snap = await tx.get(matchRef(matchId));
        if (!snap.exists()) throw new Error('Match tapılmadı');
        const clickRef = doc(db, ARENA_MATCH_COLLECTION, matchId, 'reaction_clicks', actionId);
        const clickSnap = await tx.get(clickRef);
        if (clickSnap.exists()) throw new Error('REJECT');
        const match = matchFromData(snap.id, snap.data() as Record<string, unknown>);
        const next = applyArenaClick({
          match,
          playerId,
          reactionId,
          actionId,
          serverNow: now,
        });
        tx.update(matchRef(matchId), matchWrite(next));
        tx.set(clickRef, { actionId, playerId, reactionId, timestamp: now });
        const eventType =
          next.reaction?.status === 'SUCCESS' ? 'reactionSucceeded' : 'clickReceived';
        tx.set(doc(db, ARENA_MATCH_COLLECTION, matchId, 'reaction_events', `${actionId}_${eventType}`), {
          type: eventType,
          matchId,
          reactionId,
          playerId,
          timestamp: now,
          cardId: next.reaction?.cardId ?? '',
          currentClicks: next.reaction?.currentClicks ?? 0,
          requiredClicks: next.reaction?.requiredClicks ?? 0,
          actionId,
        });
        return next;
      }),
      TX_MS,
      'Klik yazılmadı'
    ).then(maybeFinalizeArenaMatch)
  );
}

export async function expireArenaReaction(input: { matchId: string }): Promise<ArenaMatchState> {
  await requireFirebaseAuth();
  const matchId = sanitizeBattleId(input.matchId);
  const now = await requireServerNow();
  const lockKey = `arena-reaction-expire:${matchId}`;
  return replayBattleRequest(lockKey, async () =>
    withTimeout(
      runTransaction(db, async (tx) => {
        const snap = await tx.get(matchRef(matchId));
        if (!snap.exists()) throw new Error('Match tapılmadı');
        const match = matchFromData(snap.id, snap.data() as Record<string, unknown>);
        const next = expireArenaReactionState(match, now);
        tx.update(matchRef(matchId), matchWrite(next));
        const reaction = next.reaction;
        if (reaction) {
          tx.set(doc(db, ARENA_MATCH_COLLECTION, matchId, 'reaction_events', `${reaction.reactionId}_expired`), {
            type: reaction.status === 'SUCCESS' ? 'reactionSucceeded' : 'reactionExpired',
            matchId,
            reactionId: reaction.reactionId,
            playerId: '',
            timestamp: now,
            cardId: reaction.cardId,
            currentClicks: reaction.currentClicks,
            requiredClicks: reaction.requiredClicks,
            actionId: '',
          });
        }
        return next;
      }),
      TX_MS,
      'Reaction timeout yazılmadı'
    ).then(maybeFinalizeArenaMatch)
  );
}

export async function shareArenaClickEvent(input: { matchId: string; playerId: string }): Promise<ArenaMatchState> {
  await requireFirebaseAuth();
  const matchId = sanitizeBattleId(input.matchId);
  const playerId = sanitizePlayerId(input.playerId);
  const now = await requireServerNow();
  return withTimeout(
    runTransaction(db, async (tx) => {
      const snap = await tx.get(matchRef(matchId));
      if (!snap.exists()) throw new Error('Match tapılmadı');
      const match = matchFromData(snap.id, snap.data() as Record<string, unknown>);
      const next = forwardArenaReactionChat(match, playerId, now);
      const text = officialReactionChatText(next.reaction?.cardId ?? '', next.reaction?.mode ?? null);
      const withEffects = {
        ...next,
        effects: next.effects.clickEvent
          ? { ...next.effects, clickEvent: { ...next.effects.clickEvent, sharedToChat: true } }
          : next.effects,
      };
      tx.update(matchRef(matchId), matchWrite(withEffects));
      const reactionId = withEffects.reaction?.reactionId ?? 'none';
      tx.set(doc(db, ARENA_MATCH_COLLECTION, matchId, 'reaction_events', `${reactionId}_chat`), {
        type: 'chatForwarded',
        matchId,
        reactionId,
        playerId,
        timestamp: now,
        cardId: withEffects.reaction?.cardId ?? '',
        currentClicks: withEffects.reaction?.currentClicks ?? 0,
        requiredClicks: withEffects.reaction?.requiredClicks ?? 0,
        actionId: '',
        chatText: text,
      });
      return withEffects;
    }),
    TX_MS,
    'Click event paylaşılmadı'
  );
}

export { rejectClientEnergyWrite };
