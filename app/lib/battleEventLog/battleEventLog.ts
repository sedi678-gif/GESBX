import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  type DocumentData,
  type Timestamp,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from '@/firebase';
import { ensureFirebaseAuth } from '@/app/lib/firebaseAuth';
import { BATTLE_ENERGY_COLLECTION, initialBattleEnergyDoc } from '@/app/lib/battleEnergy/battleEnergyConfig';
import { BATTLE_SCORE_COLLECTION, initialBattleScoreDoc } from '@/app/lib/battleScore/battleScoreConfig';
import {
  BATTLE_EVENTS_COLLECTION,
  BATTLE_EVENT_SCHEMA_VERSION,
  BATTLE_EVENT_SUBCOLLECTION,
  type AppendBattleEventInput,
  type BattleAuditReport,
  type BattleEvent,
  type BattleEventMeta,
  type BattleEventType,
  type BattleRecord,
  type BattleStatus,
} from './battleEventTypes';
import {
  sanitizeBattleEventMeta,
  sanitizeBattleEventType,
  sanitizeBattleId,
  sanitizePlayerId,
} from './sanitizeBattleEventMeta';

const EVENT_WRITE_TIMEOUT_MS = 12_000;

export function battleRef(battleId: string) {
  return doc(db, BATTLE_EVENTS_COLLECTION, battleId);
}

export function eventsCol(battleId: string) {
  return collection(db, BATTLE_EVENTS_COLLECTION, battleId, BATTLE_EVENT_SUBCOLLECTION);
}

export function newBattleEventRef(battleId: string) {
  return doc(eventsCol(battleId));
}

const SERVICE_ONLY_EVENT_TYPES: readonly BattleEventType[] = [
  'battle_created',
  'player_joined',
  'player_left',
  'loadout_locked',
  'card_played',
  'energy_changed',
  'turn_started',
  'turn_timeout',
  'battle_finished',
  'damage_applied',
  'score_changed',
  'click_started',
  'click_completed',
];

/** Event yalnız create olunur — update/delete yoxdur. createdAt server timestamp-dır. */
export function battleEventWrite<T extends BattleEventType>(input: {
  eventId: string;
  battleId: string;
  playerId: string;
  type: T;
  seq: number;
  meta?: BattleEventMeta<T>;
}) {
  return {
    eventId: input.eventId,
    battleId: input.battleId,
    playerId: sanitizePlayerId(input.playerId),
    type: input.type,
    seq: input.seq,
    createdAt: serverTimestamp(),
    schemaVersion: BATTLE_EVENT_SCHEMA_VERSION,
    meta: sanitizeBattleEventMeta(input.type, input.meta),
  };
}

export function makeBattleId(): string {
  return `bat_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function timestampToMs(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (value && typeof value === 'object' && 'toMillis' in value) {
    const ms = (value as Timestamp).toMillis();
    if (Number.isFinite(ms)) return ms;
  }
  return 0;
}

function eventFromData(eventId: string, data: DocumentData): BattleEvent {
  const type = sanitizeBattleEventType(data.type);
  return {
    eventId: typeof data.eventId === 'string' ? data.eventId : eventId,
    battleId: String(data.battleId ?? ''),
    playerId: String(data.playerId ?? ''),
    type,
    seq: Number(data.seq) || 0,
    createdAt: timestampToMs(data.createdAt),
    schemaVersion: BATTLE_EVENT_SCHEMA_VERSION,
    meta: sanitizeBattleEventMeta(type, data.meta as Record<string, unknown>),
  };
}

function asStringList(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => String(item)).filter(Boolean) : [];
}

function parseBattleStatus(value: unknown): BattleStatus {
  if (value === 'joining' || value === 'locked' || value === 'active' || value === 'finished' || value === 'open') {
    return value;
  }
  return 'open';
}

export function battleFromData(id: string, data: DocumentData): BattleRecord {
  return {
    id,
    createdBy: String(data.createdBy ?? ''),
    createdAt: timestampToMs(data.createdAt),
    updatedAt: timestampToMs(data.updatedAt),
    status: parseBattleStatus(data.status),
    eventSeq: Number(data.eventSeq) || 0,
    participantIds: asStringList(data.participantIds),
    schemaVersion: BATTLE_EVENT_SCHEMA_VERSION,
    kind: data.kind === 'alliance_map' ? 'alliance_map' : data.kind === 'open' ? 'open' : undefined,
    attackerAllianceId: data.attackerAllianceId ? String(data.attackerAllianceId) : undefined,
    defenderAllianceId: data.defenderAllianceId ? String(data.defenderAllianceId) : undefined,
    attackerAllianceName: data.attackerAllianceName ? String(data.attackerAllianceName) : undefined,
    defenderAllianceName: data.defenderAllianceName ? String(data.defenderAllianceName) : undefined,
    attackerPlayerIds: asStringList(data.attackerPlayerIds),
    defenderPlayerIds: asStringList(data.defenderPlayerIds),
    attackerUids: asStringList(data.attackerUids),
    defenderUids: asStringList(data.defenderUids),
    joinDurationMs: Number(data.joinDurationMs) || undefined,
    joinEndsAt: (() => {
      const stored = data.joinEndsAt ? timestampToMs(data.joinEndsAt) : 0;
      if (stored > 1_000_000_000_000) return stored;
      const created = timestampToMs(data.createdAt);
      const duration = Number(data.joinDurationMs) || 0;
      if (created > 1_000_000_000_000 && duration > 0) return created + duration;
      return undefined;
    })(),
    turn: Number(data.turn) || undefined,
    turnSide: data.turnSide === 'defender' ? 'defender' : data.turnSide === 'attacker' ? 'attacker' : undefined,
    turnPlayerId: data.turnPlayerId ? String(data.turnPlayerId) : undefined,
    stateVersion: Number(data.stateVersion) || 0,
    turnStartAt: timestampToMs(data.turnStartAt) || undefined,
    turnDurationMs: Number(data.turnDurationMs) || undefined,
    turnEndAt:
      timestampToMs(data.turnEndAt) ||
      (timestampToMs(data.turnStartAt) > 0
        ? timestampToMs(data.turnStartAt) + (Number(data.turnDurationMs) || 15_000)
        : undefined),
    attackerScore: Number.isFinite(Number(data.attackerScore)) ? Math.trunc(Number(data.attackerScore)) : 0,
    defenderScore: Number.isFinite(Number(data.defenderScore)) ? Math.trunc(Number(data.defenderScore)) : 0,
    scoreVersion: Number(data.scoreVersion) || 0,
    lastScoreRequestId: data.lastScoreRequestId ? String(data.lastScoreRequestId) : undefined,
    winnerSide: data.winnerSide === 'defender' ? 'defender' : data.winnerSide === 'attacker' ? 'attacker' : data.winnerSide === null ? null : undefined,
    winnerAllianceId: data.winnerAllianceId ? String(data.winnerAllianceId) : data.winnerAllianceId === null ? null : undefined,
    finishReason: data.finishReason ? String(data.finishReason) : undefined,
    finishedAt: timestampToMs(data.finishedAt) || undefined,
  };
}

function nextStatus(type: BattleEventType, current: BattleStatus): BattleStatus {
  if (type === 'battle_finished') return 'finished';
  if (current === 'finished') return 'finished';
  if (current === 'joining') return 'joining';
  if (current === 'locked') return type === 'turn_started' ? 'active' : 'locked';
  if (type === 'battle_created') return 'open';
  return 'active';
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

/**
 * Battle event yalnız əlavə olunur. Update/delete API yoxdur.
 * seq transaction ilə +1 artır; createdAt Firestore serverTimestamp-dır.
 */
export async function appendBattleEvent<T extends BattleEventType>(
  input: AppendBattleEventInput<T>
): Promise<BattleEvent<T>> {
  await ensureFirebaseAuth();

  const battleId = sanitizeBattleId(input.battleId);
  const playerId = sanitizePlayerId(input.playerId);
  const type = sanitizeBattleEventType(input.type);
  const meta = sanitizeBattleEventMeta(type, input.meta);

  const parentRef = battleRef(battleId);
  const eventRef = doc(eventsCol(battleId));

  const written = await withTimeout(
    runTransaction(db, async (tx) => {
      const parentSnap = await tx.get(parentRef);
      if (!parentSnap.exists()) {
        throw new Error('Battle tapılmadı — əvvəl createBattleWithLog çağır');
      }

      const parent = battleFromData(parentSnap.id, parentSnap.data());
      if (SERVICE_ONLY_EVENT_TYPES.includes(type)) {
        throw new Error(`${type} yalnız öz servisi ilə yazılır`);
      }
      if (parent.status === 'finished') {
        throw new Error('Bitmiş battle-ə event yazıla bilməz');
      }
      if (parent.kind === 'alliance_map' && (type === 'player_joined' || type === 'player_left')) {
        throw new Error('Xəritə döyüşündə qoşulma yalnız join/leave servisi ilə yazılır');
      }

      const seq = parent.eventSeq + 1;
      const participantIds = parent.participantIds.includes(playerId)
        ? parent.participantIds
        : [...parent.participantIds, playerId];

      tx.update(parentRef, {
        eventSeq: seq,
        updatedAt: serverTimestamp(),
        status: nextStatus(type, parent.status),
        participantIds,
      });

      tx.set(
        eventRef,
        battleEventWrite({
          eventId: eventRef.id,
          battleId,
          playerId,
          type,
          seq,
          meta,
        })
      );

      return { eventId: eventRef.id, seq };
    }),
    EVENT_WRITE_TIMEOUT_MS,
    'Battle event yazılması vaxtı bitdi.'
  );

  return {
    eventId: written.eventId,
    battleId,
    playerId,
    type: type as T,
    seq: written.seq,
    createdAt: Date.now(),
    schemaVersion: BATTLE_EVENT_SCHEMA_VERSION,
    meta,
  };
}

export async function createBattleWithLog(input: {
  playerId: string;
  meta?: AppendBattleEventInput<'battle_created'>['meta'];
}): Promise<{ battle: BattleRecord; event: BattleEvent<'battle_created'> }> {
  await ensureFirebaseAuth();

  const playerId = sanitizePlayerId(input.playerId);
  const meta = sanitizeBattleEventMeta('battle_created', input.meta);
  const battleId = makeBattleId();
  const parentRef = battleRef(battleId);
  const eventRef = doc(eventsCol(battleId));

  await withTimeout(
    runTransaction(db, async (tx) => {
      tx.set(parentRef, {
        createdBy: playerId,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        status: 'open',
        eventSeq: 1,
        participantIds: [playerId],
        schemaVersion: BATTLE_EVENT_SCHEMA_VERSION,
        attackerScore: 0,
        defenderScore: 0,
        scoreVersion: 0,
        lastScoreRequestId: null,
      });
      tx.set(
        eventRef,
        battleEventWrite({
          eventId: eventRef.id,
          battleId,
          playerId,
          type: 'battle_created',
          seq: 1,
          meta,
        })
      );
      tx.set(doc(db, BATTLE_EVENTS_COLLECTION, battleId, BATTLE_ENERGY_COLLECTION, playerId), initialBattleEnergyDoc(battleId, playerId));
      tx.set(doc(db, BATTLE_EVENTS_COLLECTION, battleId, BATTLE_SCORE_COLLECTION, playerId), initialBattleScoreDoc(battleId, playerId));
    }),
    EVENT_WRITE_TIMEOUT_MS,
    'Battle yaradılması vaxtı bitdi.'
  );

  return {
    battle: {
      id: battleId,
      createdBy: playerId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      status: 'open',
      eventSeq: 1,
      participantIds: [playerId],
      schemaVersion: BATTLE_EVENT_SCHEMA_VERSION,
      attackerScore: 0,
      defenderScore: 0,
      scoreVersion: 0,
    },
    event: {
      eventId: eventRef.id,
      battleId,
      playerId,
      type: 'battle_created',
      seq: 1,
      createdAt: Date.now(),
      schemaVersion: BATTLE_EVENT_SCHEMA_VERSION,
      meta,
    },
  };
}

export async function getBattleRecord(battleId: string): Promise<BattleRecord | null> {
  const snap = await getDoc(battleRef(sanitizeBattleId(battleId)));
  if (!snap.exists()) return null;
  return battleFromData(snap.id, snap.data());
}

export async function listBattleEvents(battleId: string): Promise<BattleEvent[]> {
  const id = sanitizeBattleId(battleId);
  const snap = await getDocs(query(eventsCol(id), orderBy('seq', 'asc')));
  return snap.docs.map((item) => eventFromData(item.id, item.data()));
}

export function listenBattleRecord(
  battleId: string,
  onChange: (battle: BattleRecord | null) => void
): Unsubscribe {
  const id = sanitizeBattleId(battleId);
  return onSnapshot(battleRef(id), (snap) => {
    onChange(snap.exists() ? battleFromData(snap.id, snap.data()) : null);
  });
}

export function listenBattleEvents(
  battleId: string,
  onChange: (events: BattleEvent[]) => void
): Unsubscribe {
  const id = sanitizeBattleId(battleId);
  return onSnapshot(query(eventsCol(id), orderBy('seq', 'asc')), (snap) => {
    onChange(snap.docs.map((item) => eventFromData(item.id, item.data())));
  });
}

export function auditBattleEvents(battleId: string, events: BattleEvent[]): BattleAuditReport {
  const ordered = [...events].sort((a, b) => a.seq - b.seq || a.createdAt - b.createdAt);
  const missingSeq: number[] = [];
  const duplicateSeq: number[] = [];
  const lastSeq = ordered.length ? ordered[ordered.length - 1].seq : null;
  const firstSeq = ordered.length ? ordered[0].seq : null;
  const seen = new Set<number>();

  for (const event of ordered) {
    if (seen.has(event.seq)) duplicateSeq.push(event.seq);
    else seen.add(event.seq);
  }

  if (ordered.length) {
    const end = lastSeq ?? 1;
    for (let seq = 1; seq <= end; seq += 1) {
      if (!seen.has(seq)) missingSeq.push(seq);
    }
  }

  return {
    battleId,
    eventCount: ordered.length,
    firstSeq,
    lastSeq,
    contiguous:
      ordered.length === 0 ||
      (missingSeq.length === 0 &&
        duplicateSeq.length === 0 &&
        firstSeq === 1 &&
        lastSeq === ordered.length),
    missingSeq,
    duplicateSeq,
    events: ordered,
  };
}

export async function getBattleAuditLog(battleId: string): Promise<BattleAuditReport> {
  const id = sanitizeBattleId(battleId);
  const events = await listBattleEvents(id);
  return auditBattleEvents(id, events);
}
