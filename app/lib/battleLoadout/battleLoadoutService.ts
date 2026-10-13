import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  where,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from '@/firebase';
import { requireFirebaseAuth } from '@/app/lib/firebaseAuth';
import { sanitizePlayerId } from '@/app/lib/battleEventLog/sanitizeBattleEventMeta';
import { battleFromData, battleRef } from '@/app/lib/battleEventLog/battleEventLog';
import type { BattleRecord, BattleSide } from '@/app/lib/battleEventLog/battleEventTypes';
import {
  BATTLE_LOADOUT_COLLECTION,
  BATTLE_LOADOUT_SIZE,
  isBattleLoadoutCardId,
  resolveLoadoutInventory,
  validateBattleLoadout,
  type BattleLoadoutCardId,
} from './battleLoadoutConfig';
import { assertLoadoutFitsEnergy } from '@/app/lib/battleEnergy/battleEnergyConfig';

export interface BattleLoadout {
  battleId: string;
  playerId: string;
  side: BattleSide;
  cardIds: BattleLoadoutCardId[];
  locked: boolean;
  ownerUid: string;
  committedAt: number;
}

export interface BattleLoadoutView {
  playerId: string;
  side: BattleSide;
  locked: boolean;
  revealed: boolean;
  cardIds: BattleLoadoutCardId[] | null;
  count: number;
}

const WRITE_MS = 12_000;
const writes = new Set<string>();

function loadoutRef(battleId: string, playerId: string) {
  return doc(db, 'battles', battleId, BATTLE_LOADOUT_COLLECTION, playerId);
}

function loadoutsCol(battleId: string) {
  return collection(db, 'battles', battleId, BATTLE_LOADOUT_COLLECTION);
}

function playerRef(playerId: string) {
  return doc(db, 'players', playerId);
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

function sideOf(battle: BattleRecord, playerId: string): BattleSide | null {
  if ((battle.attackerPlayerIds ?? []).includes(playerId)) return 'attacker';
  if ((battle.defenderPlayerIds ?? []).includes(playerId)) return 'defender';
  return null;
}

function uidOwnsPlayerSlot(battle: BattleRecord, playerId: string, uid: string, side: BattleSide): boolean {
  const ids = side === 'attacker' ? battle.attackerPlayerIds ?? [] : battle.defenderPlayerIds ?? [];
  const uids = side === 'attacker' ? battle.attackerUids ?? [] : battle.defenderUids ?? [];
  const index = ids.indexOf(playerId);
  return index >= 0 && uids[index] === uid;
}

function loadoutFromData(battleId: string, playerId: string, data: Record<string, unknown>): BattleLoadout {
  const cardIds = Array.isArray(data.cardIds)
    ? data.cardIds.filter((id): id is BattleLoadoutCardId => typeof id === 'string' && isBattleLoadoutCardId(id))
    : [];
  return {
    battleId,
    playerId,
    side: data.side === 'defender' ? 'defender' : 'attacker',
    cardIds,
    locked: data.locked === true,
    ownerUid: String(data.ownerUid ?? ''),
    committedAt: typeof data.committedAt === 'number' ? data.committedAt : 0,
  };
}

export function redactLoadoutForViewer(
  loadout: BattleLoadout,
  viewer: { playerId: string; side: BattleSide | null },
  battleStatus: BattleRecord['status']
): BattleLoadoutView {
  const sameTeam = viewer.side != null && viewer.side === loadout.side;
  const isSelf = viewer.playerId === loadout.playerId;
  const reveal = isSelf || sameTeam;
  return {
    playerId: loadout.playerId,
    side: loadout.side,
    locked: loadout.locked || battleStatus === 'active' || battleStatus === 'finished',
    revealed: reveal,
    cardIds: reveal ? loadout.cardIds : null,
    count: BATTLE_LOADOUT_SIZE,
  };
}

export async function getOwnedLoadoutCards(userId: string): Promise<Record<string, number>> {
  const snap = await getDoc(playerRef(userId));
  return resolveLoadoutInventory(userId, snap.exists() ? (snap.data() as Record<string, unknown>) : null);
}

export async function setBattleLoadout(input: {
  battleId: string;
  playerId: string;
  cardIds: unknown;
  commit?: boolean;
}): Promise<BattleLoadout> {
  const user = await requireFirebaseAuth();
  const playerId = sanitizePlayerId(input.playerId);
  const battleId = String(input.battleId || '').trim();
  const lockKey = `${battleId}:${playerId}`;
  if (writes.has(lockKey)) throw new Error('Kart seçimi göndərilir');
  writes.add(lockKey);

  try {
    return await withTimeout(
      runTransaction(db, async (tx) => {
        const parentSnap = await tx.get(battleRef(battleId));
        if (!parentSnap.exists()) throw new Error('Battle tapılmadı');
        const battle = battleFromData(parentSnap.id, parentSnap.data());
        if (battle.status === 'finished') {
          throw new Error('Battle bitib');
        }
        const existingSnap = await tx.get(loadoutRef(battleId, playerId));
        if (battle.status === 'active') {
          if (existingSnap.exists()) {
            throw new Error('Battle başladıqdan sonra loadout dəyişdirilə bilməz');
          }
        } else if (battle.status !== 'joining' && battle.status !== 'locked') {
          throw new Error('Kart seçimi yalnız döyüşə qoşulduqdan sonra olar');
        }

        const side = sideOf(battle, playerId);
        if (!side) throw new Error('Bu döyüşə qoşulmamısan');
        if (!uidOwnsPlayerSlot(battle, playerId, user.uid, side)) {
          throw new Error('Bu loadout sənin hesabına aid deyil');
        }

        if (existingSnap.exists() && existingSnap.data()?.locked === true) {
          throw new Error('Loadout kilitlənib');
        }

        const playerSnap = await tx.get(playerRef(playerId));
        if (!playerSnap.exists()) throw new Error('Oyunçu tapılmadı');
        const owned = resolveLoadoutInventory(playerId, playerSnap.data() as Record<string, unknown>);
        const cardIds = validateBattleLoadout(input.cardIds, owned);
        assertLoadoutFitsEnergy(cardIds);
        const locked = input.commit === true;

        tx.set(loadoutRef(battleId, playerId), {
          battleId,
          playerId,
          side,
          ownerUid: user.uid,
          cardIds,
          locked,
          schemaVersion: 1,
          committedAt: locked ? serverTimestamp() : null,
          updatedAt: serverTimestamp(),
        });

        return {
          battleId,
          playerId,
          side,
          cardIds,
          locked,
          ownerUid: user.uid,
          committedAt: locked ? Date.now() : 0,
        };
      }),
      WRITE_MS,
      'Kart seçimi yazılmadı.'
    );
  } finally {
    writes.delete(lockKey);
  }
}

export async function freezeBattleLoadouts(battleId: string): Promise<void> {
  await requireFirebaseAuth();
  const id = String(battleId || '').trim();
  await withTimeout(
    runTransaction(db, async (tx) => {
      const parentSnap = await tx.get(battleRef(id));
      if (!parentSnap.exists()) throw new Error('Battle tapılmadı');
      const battle = battleFromData(parentSnap.id, parentSnap.data());
      if (battle.status !== 'active' && battle.status !== 'finished') {
        throw new Error('Loadout yalnız battle başladıqdan sonra dondurulur');
      }
      const ids = battle.participantIds ?? [];
      for (const playerId of ids) {
        const ref = loadoutRef(id, playerId);
        const snap = await tx.get(ref);
        if (!snap.exists()) continue;
        if (snap.data()?.locked === true) continue;
        tx.update(ref, { locked: true, updatedAt: serverTimestamp() });
      }
    }),
    WRITE_MS,
    'Loadout dondurulması vaxtı bitdi.'
  );
}

export function listenVisibleLoadouts(
  battleId: string,
  viewer: { playerId: string; side: BattleSide | null },
  battleStatus: BattleRecord['status'],
  onChange: (views: BattleLoadoutView[]) => void
): Unsubscribe {
  if (!viewer.side) {
    onChange([]);
    return () => {};
  }
  const teamQuery = query(loadoutsCol(battleId), where('side', '==', viewer.side));
  return onSnapshot(
    teamQuery,
    (snap) => {
      const views = snap.docs.map((item) => {
        const loadout = loadoutFromData(battleId, item.id, item.data() as Record<string, unknown>);
        return redactLoadoutForViewer(loadout, viewer, battleStatus);
      });
      onChange(views);
    },
    () => onChange([])
  );
}

export function listenOwnLoadout(
  battleId: string,
  playerId: string,
  onChange: (loadout: BattleLoadout | null) => void
): Unsubscribe {
  return onSnapshot(loadoutRef(battleId, playerId), (snap) => {
    onChange(snap.exists() ? loadoutFromData(battleId, playerId, snap.data() as Record<string, unknown>) : null);
  });
}

export function canEditBattleLoadout(
  battleStatus: BattleRecord['status'],
  locked: boolean,
  hasLoadout = false
): boolean {
  if (locked) return false;
  if (battleStatus === 'joining' || battleStatus === 'locked') return true;
  if (battleStatus === 'active' && !hasLoadout) return true;
  return false;
}
