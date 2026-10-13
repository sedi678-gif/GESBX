import { serverTimestamp } from 'firebase/firestore';
import { BATTLE_LOADOUT_POOL, isBattleLoadoutCardId, type BattleLoadoutCardId } from '@/app/lib/battleLoadout/battleLoadoutConfig';

export const BATTLE_ENERGY_MAX = 25;
export const BATTLE_ENERGY_START = 25;
export const BATTLE_ENERGY_COLLECTION = 'energy';
export const BATTLE_ENERGY_REQUESTS_COLLECTION = 'energy_requests';
export const BATTLE_CARD_COSTS_COLLECTION = 'battle_card_costs';

/** Rəsmi cost cədvəli — client cost qəbul edilmir. */
export const BATTLE_CARD_ENERGY_COSTS: Record<BattleLoadoutCardId, number> = {
  '2x': 5,
  casus: 5,
  duman: 4,
  guzgu: 4,
  joker: 4,
  ogru: 3,
  qaya: 5,
  qul: 4,
  qutb: 3,
  sehrbaz: 5,
  tikanli: 4,
  felaket: 3,
  usyan: 4,
};

export function officialCardEnergyCost(cardId: string): number {
  if (!isBattleLoadoutCardId(cardId)) return 0;
  const cost = BATTLE_CARD_ENERGY_COSTS[cardId];
  return Number.isInteger(cost) && cost > 0 && cost <= BATTLE_ENERGY_MAX ? cost : 0;
}

export function loadoutEnergyCost(ids: readonly string[]): number {
  return ids.reduce((sum, id) => sum + officialCardEnergyCost(id), 0);
}

export function assertLoadoutFitsEnergy(ids: readonly string[]): number {
  const total = loadoutEnergyCost(ids);
  if (total <= 0 || total > BATTLE_ENERGY_START) {
    throw new Error(`5 kartın energy cəmi ${BATTLE_ENERGY_START}-dən çox ola bilməz (${total})`);
  }
  return total;
}

export function clampBattleEnergy(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(BATTLE_ENERGY_MAX, Math.trunc(value)));
}

export function makeEnergyRequestId(): string {
  return `enr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export function energyRequestIdForCard(battleId: string, playerId: string, cardId: string): string {
  return sanitizeEnergyRequestId(`enr_${battleId}_${playerId}_${cardId}`.slice(0, 80));
}

export function sanitizeEnergyRequestId(raw: unknown): string {
  if (typeof raw !== 'string') throw new Error('Request ID tələb olunur');
  const id = raw.trim();
  if (id.length < 8 || id.length > 80) throw new Error('Request ID yanlışdır');
  if (!/^[a-zA-Z0-9:_-]+$/.test(id)) throw new Error('Request ID yanlışdır');
  return id;
}

export function initialBattleEnergyDoc(battleId: string, playerId: string) {
  return {
    battleId,
    playerId,
    energy: BATTLE_ENERGY_START,
    maxEnergy: BATTLE_ENERGY_MAX,
    cardUsage: {} as Record<string, number>,
    cardCooldownUntil: {} as Record<string, number>,
    lastRequestId: null as string | null,
    schemaVersion: 1,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
}

if (BATTLE_ENERGY_START !== BATTLE_ENERGY_MAX) {
  throw new Error('Battle başlamazdan əvvəl energy maksimumla eyni olmalıdır');
}

for (const id of BATTLE_LOADOUT_POOL) {
  if (officialCardEnergyCost(id) <= 0) {
    throw new Error(`Kart cost tapılmadı: ${id}`);
  }
}
