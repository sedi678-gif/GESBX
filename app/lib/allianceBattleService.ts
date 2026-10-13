import { db } from '@/firebase';
import {
  doc,
  getDoc,
  runTransaction,
  collection,
  addDoc,
  onSnapshot,
  query,
  orderBy,
  limit,
  Unsubscribe,
} from 'firebase/firestore';
import { BattleCardId, BattleCardsMap } from '@/app/components/alliance/types';
import { isSuperAdmin } from '@/app/lib/adminConfig';
import {
  EMPTY_BATTLE_CARDS,
  normalizeBattleCards,
} from '@/app/components/alliance/battleCardsConfig';
import { getStableAllianceCoords } from '@/app/components/alliance/regionCoords';
import {
  computeDefenderGuardCount,
  resolveFirstWaveBlock,
  scaleDamageByBlock,
} from '@/app/lib/battleDefenderLogic';
import {
  computeClickRaidClicksRequired,
  computeClickRaidDamage,
  getClickRaidConfig,
  isClickRaidCard,
  type ClickRaidCardId,
} from '@/app/lib/clickRaidLogic';

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

function resolveAllianceCoords(
  data: Record<string, unknown> | undefined,
  allianceId: string
): { lat: number; lng: number } {
  const lat = Number(data?.lat);
  const lng = Number(data?.lng);
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    return { lat, lng };
  }
  const region = typeof data?.region === 'string' ? data.region : 'Bakı';
  return getStableAllianceCoords(region, allianceId);
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
  if (cardCount < 1 || cardCount > 10) throw new Error('1-10 kart istifadə et');
  if (attackerAllianceId === defenderAllianceId) throw new Error('Öz ittifaqına hücum edə bilməzsən');

  const playerRef = doc(db, 'players', userId);
  const attackerRef = doc(db, 'alliances', attackerAllianceId);
  const defenderRef = doc(db, 'alliances', defenderAllianceId);
  const isClickRaid = isClickRaidCard(cardId);
  const rawDamage = isClickRaid ? 0 : CARD_POWER[cardId] * cardCount;
  let blockMeta = {
    blockedCount: 0,
    breakthroughCount: cardCount,
    defenderGuardCount: 1,
    damage: rawDamage,
  };
  let raidMeta = {
    raidDamage: 0,
    raidClicksRequired: 0,
    raidClicksRemaining: 0,
    defenderMemberCount: 1,
  };

  await runTransaction(db, async (tx) => {
    const playerSnap = await tx.get(playerRef);
    const attackerSnap = await tx.get(attackerRef);
    const defenderSnap = await tx.get(defenderRef);

    if (!playerSnap.exists()) throw new Error('Oyunçu tapılmadı');
    if (!attackerSnap.exists() || !defenderSnap.exists()) throw new Error('İttifaq tapılmadı');

    const player = playerSnap.data();
    if (player.allianceId !== attackerAllianceId) {
      throw new Error('Yalnız öz ittifaqın adından hücum edə bilərsən');
    }

    const cards = normalizeBattleCards(player.battleCards as BattleCardsMap);
    const unlimited = true;
    if (!unlimited && (cards[cardId] ?? 0) < cardCount) throw new Error('Kifayət qədər kart yoxdur');

    if (!unlimited) cards[cardId] -= cardCount;

    const defender = defenderSnap.data();
    const defenderMembers = Array.isArray(defender.members) ? defender.members.length : 1;

    if (!unlimited) {
      tx.set(playerRef, { battleCards: cards, updatedAt: Date.now() }, { merge: true });
    }

    if (isClickRaid) {
      const raidCardId = cardId as ClickRaidCardId;
      const raidDamage = computeClickRaidDamage(raidCardId, defenderMembers);
      const clicksRequired = computeClickRaidClicksRequired(raidCardId, defenderMembers);
      raidMeta = {
        raidDamage,
        raidClicksRequired: clicksRequired,
        raidClicksRemaining: clicksRequired,
        defenderMemberCount: defenderMembers,
      };
      blockMeta = { ...blockMeta, damage: 0 };
      return;
    }

    const guardCount = computeDefenderGuardCount(defenderMembers);
    const blockResult = resolveFirstWaveBlock(cardCount, defenderMembers, guardCount);
    const damage = scaleDamageByBlock(rawDamage, blockResult);

    blockMeta = {
      blockedCount: blockResult.blockedCount,
      breakthroughCount: blockResult.breakthroughCount,
      defenderGuardCount: blockResult.defenderGuardCount,
      damage,
    };

    // Rəsmi ittifaq xalı yalnız server finish/result-dan dəyişir — client damage yazılmır.
  });

  const attackerSnap = await getDoc(attackerRef);
  const defenderSnap = await getDoc(defenderRef);
  const attackerData = attackerSnap.data();
  const defenderData = defenderSnap.data();

  const atkCoords = resolveAllianceCoords(attackerData, attackerAllianceId);
  const defCoords = resolveAllianceCoords(defenderData, defenderAllianceId);

  const createdAt = Date.now();
  const payload = {
    attackerAllianceId,
    attackerAllianceName: attackerData?.name || '?',
    defenderAllianceId,
    defenderAllianceName: defenderData?.name || '?',
    attackerUserId: userId,
    attackerName: userName,
    cardId,
    cardCount,
    damage: isClickRaid ? 0 : blockMeta.damage,
    rawDamage: isClickRaid ? raidMeta.raidDamage : rawDamage,
    blockedCount: blockMeta.blockedCount,
    breakthroughCount: blockMeta.breakthroughCount,
    defenderGuardCount: blockMeta.defenderGuardCount,
    attackerLat: hintCoords?.attackerLat ?? atkCoords.lat,
    attackerLng: hintCoords?.attackerLng ?? atkCoords.lng,
    defenderLat: hintCoords?.defenderLat ?? defCoords.lat,
    defenderLng: hintCoords?.defenderLng ?? defCoords.lng,
    createdAt,
    status: isClickRaid ? `${cardId}_active` : 'active',
    ...(isClickRaid
      ? {
          raidDamage: raidMeta.raidDamage,
          raidClicksRequired: raidMeta.raidClicksRequired,
          raidClicksRemaining: raidMeta.raidClicksRemaining,
          raidStatus: 'active' as const,
          raidEndsAt: createdAt + getClickRaidConfig(cardId as ClickRaidCardId).raidMs,
          defenderMemberCount: raidMeta.defenderMemberCount,
        }
      : {}),
  };

  const docRef = await addDoc(collection(db, 'alliance_attacks'), payload);

  const attack: AllianceAttack = {
    id: docRef.id,
    ...payload,
  };

  return { damage: blockMeta.damage, attack };
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

function readStoredRaidClicksRemaining(data: Record<string, unknown>): number {
  return Number(data.raidClicksRemaining ?? data.mutantClicksRemaining ?? 0);
}

function readStoredRaidStatus(data: Record<string, unknown>): string | undefined {
  return (data.raidStatus ?? data.mutantStatus) as string | undefined;
}

function readStoredRaidDamage(data: Record<string, unknown>): number {
  return Number(data.raidDamage ?? data.mutantDamage ?? 0);
}

/** Klik raid — müdafiəçi ittifaq üzvlərinin klikləri (mutant, standing) */
export async function registerClickRaidClick(attackId: string, userId: string): Promise<void> {
  const attackRef = doc(db, 'alliance_attacks', attackId);
  const playerRef = doc(db, 'players', userId);

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(attackRef);
    const playerSnap = await tx.get(playerRef);
    if (!snap.exists()) return;
    const data = snap.data()!;
    if (!isClickRaidCard(data.cardId as BattleCardId)) return;
    if (readStoredRaidStatus(data) !== 'active') return;
    const playerAllianceId = playerSnap.data()?.allianceId;
    if (playerAllianceId !== data.defenderAllianceId) return;

    const cardId = data.cardId as ClickRaidCardId;
    const remaining = Math.max(0, readStoredRaidClicksRemaining(data) - 1);
    if (remaining <= 0) {
      tx.update(attackRef, {
        raidClicksRemaining: 0,
        raidStatus: 'killed',
        damage: 0,
        status: `${cardId}_killed`,
        updatedAt: Date.now(),
      });
      return;
    }

    tx.update(attackRef, {
      raidClicksRemaining: remaining,
      updatedAt: Date.now(),
    });
  });
}

/** Klik raid — vaxt bitdi (zərər) və ya öldürüldü */
export async function finalizeClickRaid(attackId: string, defeated: boolean): Promise<void> {
  const attackRef = doc(db, 'alliance_attacks', attackId);

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(attackRef);
    if (!snap.exists()) return;
    const data = snap.data()!;
    if (!isClickRaidCard(data.cardId as BattleCardId)) return;
    if (readStoredRaidStatus(data) !== 'active') return;

    const cardId = data.cardId as ClickRaidCardId;

    if (defeated) {
      tx.update(attackRef, {
        raidStatus: 'killed',
        raidClicksRemaining: 0,
        damage: 0,
        status: `${cardId}_killed`,
        updatedAt: Date.now(),
      });
      return;
    }

    const raidDamage = readStoredRaidDamage(data);

    tx.update(attackRef, {
      raidStatus: 'hit',
      damage: raidDamage,
      status: `${cardId}_hit`,
      updatedAt: Date.now(),
    });
  });
}

/** @deprecated registerClickRaidClick istifadə et */
export const registerMutantClick = registerClickRaidClick;

/** @deprecated finalizeClickRaid istifadə et */
export const finalizeMutantRaid = finalizeClickRaid;
