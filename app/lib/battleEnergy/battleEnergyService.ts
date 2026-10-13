import { collection, doc, getDoc, onSnapshot, type Unsubscribe } from 'firebase/firestore';
import { db } from '@/firebase';
import {
  BATTLE_ENERGY_COLLECTION,
  BATTLE_ENERGY_MAX,
  BATTLE_ENERGY_REQUESTS_COLLECTION,
  clampBattleEnergy,
} from './battleEnergyConfig';
import { readCardUsage, readCooldownUntil } from '@/app/lib/battlePlay/battlePlayConfig';

export interface BattleEnergy {
  battleId: string;
  playerId: string;
  energy: number;
  maxEnergy: number;
  cardUsage: Record<string, number>;
  cardCooldownUntil: Record<string, number>;
  lastRequestId: string | null;
}

export function battleEnergyRef(battleId: string, playerId: string) {
  return doc(db, 'battles', battleId, BATTLE_ENERGY_COLLECTION, playerId);
}

export function battleEnergyRequestsCol(battleId: string) {
  return collection(db, 'battles', battleId, BATTLE_ENERGY_REQUESTS_COLLECTION);
}

function energyFromData(battleId: string, playerId: string, data: Record<string, unknown>): BattleEnergy {
  return {
    battleId,
    playerId,
    energy: clampBattleEnergy(Number(data.energy)),
    maxEnergy: BATTLE_ENERGY_MAX,
    cardUsage: readCardUsage(data.cardUsage, data.usedCardIds),
    cardCooldownUntil: readCooldownUntil(data.cardCooldownUntil),
    lastRequestId: typeof data.lastRequestId === 'string' ? data.lastRequestId : null,
  };
}

export async function getBattleEnergy(battleId: string, playerId: string): Promise<BattleEnergy | null> {
  const id = String(battleId || '').trim();
  const pid = String(playerId || '').trim();
  if (!id || !pid) return null;
  const snap = await getDoc(battleEnergyRef(id, pid));
  if (!snap.exists()) return null;
  return energyFromData(id, pid, snap.data() as Record<string, unknown>);
}

/** Client yalnız bunu göstərir — local hesab yoxdur. */
export function listenBattleEnergy(
  battleId: string,
  playerId: string,
  onChange: (energy: BattleEnergy | null) => void
): Unsubscribe {
  const id = String(battleId || '').trim();
  const pid = String(playerId || '').trim();
  if (!id || !pid) {
    onChange(null);
    return () => {};
  }
  return onSnapshot(battleEnergyRef(id, pid), (snap) => {
    onChange(snap.exists() ? energyFromData(id, pid, snap.data() as Record<string, unknown>) : null);
  });
}

export function viewBattleEnergy(energy: BattleEnergy | null): BattleEnergy | null {
  if (!energy) return null;
  return {
    ...energy,
    energy: clampBattleEnergy(energy.energy),
    maxEnergy: BATTLE_ENERGY_MAX,
  };
}
