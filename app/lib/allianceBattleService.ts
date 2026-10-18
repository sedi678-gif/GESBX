import { db } from '@/firebase';
import { collection, onSnapshot, query, orderBy, limit, Unsubscribe } from 'firebase/firestore';
import { BattleCardId } from '@/app/components/alliance/types';
import { getStableAllianceCoords } from '@/app/components/alliance/regionCoords';
import { callSecureFunction } from '@/app/lib/secureFunctions';

export const CARD_POWER: Record<BattleCardId, number> = {
  zombi: 0,
  yarasa: 10,
  duman: 8,
  mutant: 0,
  standing: 0,
  it: 0,
};

export const BATTLE_VISUAL_MS = 9000;

export interface AllianceAttack {
  id: string;
  attackerAllianceId: string;
  attackerAllianceName: string;
  defenderAllianceId: string;
  defenderAllianceName: string;
  attackerUserId: string;
  attackerName: string;
  cardId: BattleCardId;
  cardCount: number;
  damage: number;
  createdAt: number;
  attackerLat?: number;
  attackerLng?: number;
  defenderLat?: number;
  defenderLng?: number;
  blockedCount?: number;
  breakthroughCount?: number;
  defenderGuardCount?: number;
  rawDamage?: number;
  raidDamage?: number;
  raidClicksRequired?: number;
  raidClicksRemaining?: number;
  raidStatus?: 'active' | 'killed' | 'hit';
  raidEndsAt?: number;
  status?: string;
  /** @deprecated raidDamage */
  mutantDamage?: number;
  /** @deprecated raidClicksRequired */
  mutantClicksRequired?: number;
  /** @deprecated raidClicksRemaining */
  mutantClicksRemaining?: number;
  /** @deprecated raidStatus */
  mutantStatus?: 'active' | 'killed' | 'hit';
  /** @deprecated raidEndsAt */
  mutantRaidEndsAt?: number;
  defenderMemberCount?: number;
}

export interface LaunchAttackCoords {
  attackerLat?: number;
  attackerLng?: number;
  defenderLat?: number;
  defenderLng?: number;
}

function attackTimestampMs(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value < 1e12 ? value * 1000 : value;
  }
  if (value && typeof value === 'object' && 'toMillis' in value) {
    const ms = (value as { toMillis: () => number }).toMillis();
    if (Number.isFinite(ms)) return ms;
  }
  if (value && typeof value === 'object' && 'seconds' in value) {
    const sec = Number((value as { seconds: number }).seconds);
    if (Number.isFinite(sec)) return sec * 1000;
  }
  return 0;
}

function normalizeAttack(raw: Omit<AllianceAttack, 'id'> & { id: string }): AllianceAttack {
  const raidEndsAt =
    raw.raidEndsAt != null
      ? attackTimestampMs(raw.raidEndsAt)
      : raw.mutantRaidEndsAt != null
        ? attackTimestampMs(raw.mutantRaidEndsAt)
        : undefined;
  return {
    ...raw,
    createdAt: attackTimestampMs(raw.createdAt),
    cardCount: Number(raw.cardCount) || 1,
    damage: Number(raw.damage) || 0,
    defenderLat: typeof raw.defenderLat === 'number' ? raw.defenderLat : undefined,
    defenderLng: typeof raw.defenderLng === 'number' ? raw.defenderLng : undefined,
    attackerLat: typeof raw.attackerLat === 'number' ? raw.attackerLat : undefined,
    attackerLng: typeof raw.attackerLng === 'number' ? raw.attackerLng : undefined,
    raidEndsAt,
    raidStatus: raw.raidStatus ?? raw.mutantStatus,
  };
}

export async function launchAllianceAttack(
  userId: string,
  userName: string,
  attackerAllianceId: string,
  defenderAllianceId: string,
  cardId: BattleCardId,
  cardCount: number,
  hintCoords?: LaunchAttackCoords
): Promise<{ damage: number; attack: AllianceAttack }> {
  void userName;
  void hintCoords;
  return callSecureFunction('startAllianceAttack', {
    userId, attackerAllianceId, defenderAllianceId, cardId, cardCount,
  });
}

function parseAttacksSnap(snap: import('firebase/firestore').QuerySnapshot): AllianceAttack[] {
  const list: AllianceAttack[] = [];
  snap.forEach((d) => {
    list.push(normalizeAttack({ id: d.id, ...(d.data() as Omit<AllianceAttack, 'id'>) }));
  });
  list.sort((a, b) => b.createdAt - a.createdAt);
  return list.slice(0, 30);
}

export function listenRecentAttacks(callback: (attacks: AllianceAttack[]) => void): Unsubscribe {
  const ordered = query(collection(db, 'alliance_attacks'), orderBy('createdAt', 'desc'), limit(30));
  let fallbackUnsub: Unsubscribe | null = null;

  const primaryUnsub = onSnapshot(
    ordered,
    (snap) => callback(parseAttacksSnap(snap)),
    (err) => {
      console.warn('alliance_attacks orderBy xətası, sadə dinləyici:', err);
      fallbackUnsub = onSnapshot(collection(db, 'alliance_attacks'), (snap) => {
        callback(parseAttacksSnap(snap));
      });
    }
  );

  return () => {
    primaryUnsub();
    fallbackUnsub?.();
  };
}

export function enrichAttacksWithCoords(
  attacks: AllianceAttack[],
  alliances: { id: string; region?: string; lat?: number; lng?: number }[]
): AllianceAttack[] {
  const byId = new Map(alliances.map((a) => [a.id, a]));
  return attacks.map((atk) => {
    const defender = byId.get(atk.defenderAllianceId);
    const attacker = byId.get(atk.attackerAllianceId);
    const defFallback = getStableAllianceCoords(
      defender?.region || 'Bakı',
      atk.defenderAllianceId
    );
    const atkFallback = getStableAllianceCoords(
      attacker?.region || 'Bakı',
      atk.attackerAllianceId
    );

    return {
      ...atk,
      attackerLat:
        typeof atk.attackerLat === 'number'
          ? atk.attackerLat
          : attacker?.lat ?? atkFallback.lat,
      attackerLng:
        typeof atk.attackerLng === 'number'
          ? atk.attackerLng
          : attacker?.lng ?? atkFallback.lng,
      defenderLat:
        typeof atk.defenderLat === 'number'
          ? atk.defenderLat
          : defender?.lat ?? defFallback.lat,
      defenderLng:
        typeof atk.defenderLng === 'number'
          ? atk.defenderLng
          : defender?.lng ?? defFallback.lng,
    };
  });
}

/** Son siyahı qazanır — live (optimistic) Firebase üzərində yazılır */
export function mergeAttackLists(...lists: AllianceAttack[][]): AllianceAttack[] {
  const map = new Map<string, AllianceAttack>();
  for (const list of lists) {
    for (const atk of list) {
      map.set(atk.id, normalizeAttack(atk));
    }
  }
  return [...map.values()].sort((a, b) => b.createdAt - a.createdAt).slice(0, 30);
}

/** Klik raid — müdafiəçi ittifaq üzvlərinin klikləri (mutant, standing) */
export async function registerClickRaidClick(attackId: string, userId: string): Promise<void> {
  await callSecureFunction('registerAllianceRaidClick', { attackId, userId });
}

/** Klik raid — vaxt bitdi (zərər) və ya öldürüldü */
export async function finalizeClickRaid(attackId: string, defeated: boolean): Promise<void> {
  void defeated;
  await callSecureFunction('finalizeAllianceRaid', { attackId });
}

/** @deprecated registerClickRaidClick istifadə et */
export const registerMutantClick = registerClickRaidClick;

/** @deprecated finalizeClickRaid istifadə et */
export const finalizeMutantRaid = finalizeClickRaid;
