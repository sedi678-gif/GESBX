import { isBattleLoadoutCardId, type BattleLoadoutCardId } from '@/app/lib/battleLoadout/battleLoadoutConfig';
import { officialCardEnergyCost } from '@/app/lib/battleEnergy/battleEnergyConfig';
import { BATTLE_CARD_MAX_USES, cardUsageCount } from '@/app/lib/battlePlay/battlePlayConfig';

export const BATTLE_DEFENSE_LOADOUT_MIN = 1;
export const BATTLE_DEFENSE_LOADOUT_MAX = 5;
export const BATTLE_DEFENSE_COLLECTION = 'defense_loadouts';
export const BATTLE_PRESENCE_COLLECTION = 'presence';
export const BATTLE_DEFENSE_OFFLINE_MS = 20_000;
export const BATTLE_DEFENSE_SCHEMA = 1;

export function readStoredDefenseLoadout(raw: Record<string, unknown> | null | undefined): BattleLoadoutCardId[] {
  if (!raw || !Array.isArray(raw.defenseLoadout)) return [];
  const out: BattleLoadoutCardId[] = [];
  const seen = new Set<string>();
  for (const item of raw.defenseLoadout) {
    if (typeof item !== 'string') continue;
    const id = item.trim();
    if (!isBattleLoadoutCardId(id) || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
    if (out.length >= BATTLE_DEFENSE_LOADOUT_MAX) break;
  }
  return out;
}

export function validateDefenseLoadout(
  rawIds: unknown,
  owned: Record<string, number>
): BattleLoadoutCardId[] {
  if (!Array.isArray(rawIds)) throw new Error('Müdafiə kart siyahısı yanlışdır');
  const selected: BattleLoadoutCardId[] = [];
  const seen = new Set<string>();
  for (const raw of rawIds) {
    if (typeof raw !== 'string') throw new Error('Naməlum kart ID');
    const id = raw.trim();
    if (!isBattleLoadoutCardId(id)) throw new Error('Bu kart battle hovuzunda yoxdur');
    if (seen.has(id)) throw new Error('Eyni müdafiə kartı iki dəfə seçilə bilməz');
    if ((owned[id] ?? 0) < 1) throw new Error('Bu müdafiə kartın yoxdur');
    seen.add(id);
    selected.push(id);
    if (selected.length > BATTLE_DEFENSE_LOADOUT_MAX) {
      throw new Error(`Müdafiə loadout ən çox ${BATTLE_DEFENSE_LOADOUT_MAX} kart ola bilər`);
    }
  }
  if (selected.length < BATTLE_DEFENSE_LOADOUT_MIN) {
    throw new Error('Ən az 1 müdafiə kartı seçilməlidir');
  }
  return selected;
}

export function officialDefenseAiPick(input: {
  cardIds: readonly string[];
  energy: number;
  cardUsage: Record<string, number>;
  cooldownUntil?: Record<string, number>;
  serverNow: number;
}): BattleLoadoutCardId | null {
  for (const raw of input.cardIds) {
    if (!isBattleLoadoutCardId(raw)) continue;
    const cost = officialCardEnergyCost(raw);
    if (cost <= 0 || input.energy < cost) continue;
    if (cardUsageCount(input.cardUsage, raw) >= BATTLE_CARD_MAX_USES) continue;
    if ((input.cooldownUntil?.[raw] ?? 0) > input.serverNow) continue;
    return raw;
  }
  return null;
}

export function isDefenseOffline(lastSeenMs: number | null | undefined, serverNow: number): boolean {
  if (!serverNow || serverNow <= 0) return true;
  if (lastSeenMs == null || lastSeenMs <= 0) return true;
  return serverNow - lastSeenMs >= BATTLE_DEFENSE_OFFLINE_MS;
}
