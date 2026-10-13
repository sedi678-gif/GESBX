import {
  doc,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  type Transaction,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from '@/firebase';
import { requireFirebaseAuth } from '@/app/lib/firebaseAuth';
import { sanitizePlayerId } from '@/app/lib/battleEventLog/sanitizeBattleEventMeta';
import { resolveLoadoutInventory } from '@/app/lib/battleLoadout/battleLoadoutConfig';
import {
  BATTLE_DEFENSE_COLLECTION,
  BATTLE_PRESENCE_COLLECTION,
  BATTLE_DEFENSE_SCHEMA,
  readStoredDefenseLoadout,
  validateDefenseLoadout,
} from './battleDefenseConfig';
import type { BattleLoadoutCardId } from '@/app/lib/battleLoadout/battleLoadoutConfig';

export function defenseSnapshotRef(battleId: string, playerId: string) {
  return doc(db, 'battles', battleId, BATTLE_DEFENSE_COLLECTION, playerId);
}

export function battlePresenceRef(battleId: string, playerId: string) {
  return doc(db, 'battles', battleId, BATTLE_PRESENCE_COLLECTION, playerId);
}

function playerRef(playerId: string) {
  return doc(db, 'players', playerId);
}

export function stampDefenseSnapshot(
  tx: Transaction,
  battleId: string,
  playerId: string,
  playerData: Record<string, unknown> | undefined,
  alreadyExists: boolean
): BattleLoadoutCardId[] {
  if (alreadyExists) return [];
  const ids = readStoredDefenseLoadout(playerData);
  if (ids.length < 1) return [];
  tx.set(defenseSnapshotRef(battleId, playerId), {
    battleId,
    playerId,
    cardIds: ids,
    locked: true,
    schemaVersion: BATTLE_DEFENSE_SCHEMA,
    createdAt: serverTimestamp(),
  });
  return ids;
}

export async function setPlayerDefenseLoadout(
  playerId: string,
  cardIds: unknown
): Promise<BattleLoadoutCardId[]> {
  const user = await requireFirebaseAuth();
  const id = sanitizePlayerId(playerId);
  return runTransaction(db, async (tx) => {
    const ref = playerRef(id);
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('Oyunçu tapılmadı');
    const owned = resolveLoadoutInventory(id, snap.data() as Record<string, unknown>);
    const selected = validateDefenseLoadout(cardIds, owned);
    tx.update(ref, {
      defenseLoadout: selected,
      defenseLoadoutUpdatedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return selected;
  });
}

export function listenPlayerDefenseLoadout(
  playerId: string,
  onChange: (cardIds: BattleLoadoutCardId[]) => void
): Unsubscribe {
  return onSnapshot(playerRef(playerId), (snap) => {
    onChange(readStoredDefenseLoadout(snap.exists() ? (snap.data() as Record<string, unknown>) : null));
  });
}

export async function heartbeatBattlePresence(battleId: string, playerId: string): Promise<void> {
  const user = await requireFirebaseAuth();
  const id = sanitizePlayerId(playerId);
  await runTransaction(db, async (tx) => {
    tx.set(
      battlePresenceRef(battleId, id),
      {
        battleId,
        playerId: id,
        uid: user.uid,
        lastSeen: serverTimestamp(),
        schemaVersion: BATTLE_DEFENSE_SCHEMA,
      },
      { merge: true }
    );
  });
}

export function listenBattlePresence(
  battleId: string,
  playerId: string,
  onChange: (lastSeenMs: number | null) => void
): Unsubscribe {
  return onSnapshot(battlePresenceRef(battleId, playerId), (snap) => {
    if (!snap.exists()) {
      onChange(null);
      return;
    }
    const raw = snap.data().lastSeen as { toMillis?: () => number } | number | undefined;
    if (typeof raw === 'number') onChange(raw);
    else if (raw && typeof raw.toMillis === 'function') onChange(raw.toMillis());
    else onChange(null);
  });
}
