import { db } from '../../../firebase';
import {
  doc,
  setDoc,
  getDoc,
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  runTransaction,
} from 'firebase/firestore';
import { getRegionCoords } from './regionCoords';
import {
  AllianceData,
  AllianceFlagConfig,
  BattleCardsMap,
  PlayerProfile,
  EMPTY_PLAYER_COSMETICS,
} from './types';
import { DEFAULT_ALLIANCE_FLAG, normalizeAllianceFlag } from './allianceFlagConfig';
import {
  BATTLE_CARDS_SCHEMA_VERSION,
  EMPTY_BATTLE_CARDS,
  normalizeBattleCards,
} from './battleCardsConfig';
import { isAllianceLeader, type LeaderCheckOptions } from './allianceLeader';
import { DEFAULT_MANAT, resolvePlayerManat, readStoredManat, manatWritePatch } from '@/app/lib/manat';
import { DEFAULT_USER_PLAN_STATE, normalizeUserPlanState } from '@/app/lib/userPlan';
import { withTimeout } from '@/app/lib/firebaseAuth';
import { callSecureFunction } from '@/app/lib/secureFunctions';

/** Firebase UID ilə yaradılmış köhnə profili lokal profil ID ilə birləşdirir */
export async function reconcilePlayerIdentity(
  canonicalUserId: string,
  _legacyUserId: string,
  _displayName: string
): Promise<void> {
  await callSecureFunction('bindPlayerIdentity', { userId: canonicalUserId });
}

export async function ensurePlayerProfile(
  userId: string,
  displayName: string,
  legacyUserId?: string | null
): Promise<PlayerProfile> {
  const ref = doc(db, 'players', userId);
  const snap = await getDoc(ref);

  if (snap.exists()) {
    const data = snap.data() as PlayerProfile & { battleCardsVersion?: number };
    if (
      data.battleCardsVersion !== BATTLE_CARDS_SCHEMA_VERSION ||
      (data.manat == null && data.coins == null) ||
      !data.cosmetics
    ) {
      const mergedCards = normalizeBattleCards(data.battleCards);
      const storedManat = readStoredManat(data as unknown as Record<string, unknown>);
      const patch: Record<string, unknown> = {
        battleCards: mergedCards,
        battleCardsVersion: BATTLE_CARDS_SCHEMA_VERSION,
        activeShields: data.activeShields ?? [],
        cosmetics: data.cosmetics ?? { ...EMPTY_PLAYER_COSMETICS },
        updatedAt: Date.now(),
      };
      if (storedManat != null) {
        Object.assign(patch, manatWritePatch(storedManat));
      }
      await setDoc(ref, patch, { merge: true });
    }
    const refreshed = await getDoc(ref);
    const fresh = refreshed.data() as PlayerProfile;
    const manat = resolvePlayerManat(fresh as unknown as Record<string, unknown>);
    return {
      ...fresh,
      odId: userId,
      manat,
      battleCards: normalizeBattleCards(fresh.battleCards),
      activeShields: fresh.activeShields ?? [],
      cosmetics: fresh.cosmetics ?? { ...EMPTY_PLAYER_COSMETICS },
      ...normalizeUserPlanState(fresh as unknown as Record<string, unknown>),
    };
  }

  const profile: PlayerProfile & { battleCardsVersion: number } = {
    ...(legacyUserId ? { firebaseUid: legacyUserId } : {}),
    odId: userId,
    displayName,
    allianceId: null,
    allianceName: null,
    isLeader: false,
    score: 0,
    ...manatWritePatch(DEFAULT_MANAT),
    battleCards: { ...EMPTY_BATTLE_CARDS },
    activeShields: [],
    cosmetics: { ...EMPTY_PLAYER_COSMETICS },
    ...DEFAULT_USER_PLAN_STATE,
    battleCardsVersion: BATTLE_CARDS_SCHEMA_VERSION,
    updatedAt: Date.now(),
  };

  await runTransaction(db, async (transaction) => {
    const existing = await transaction.get(ref);
    if (existing.exists()) return;
    transaction.set(ref, profile);
  });

  const created = await getDoc(ref);
  if (!created.exists()) return profile;
  const fresh = created.data() as PlayerProfile;
  const manat = resolvePlayerManat(fresh as unknown as Record<string, unknown>);
  return {
    ...fresh,
    odId: userId,
    manat,
    battleCards: normalizeBattleCards(fresh.battleCards),
    activeShields: fresh.activeShields ?? [],
    cosmetics: fresh.cosmetics ?? { ...EMPTY_PLAYER_COSMETICS },
    ...normalizeUserPlanState(fresh as unknown as Record<string, unknown>),
  };
}

export async function syncPlayerWithAlliance(
  userId: string,
  displayName: string,
  alliance: AllianceData | null
): Promise<void> {
  const ref = doc(db, 'players', userId);
  const snap = await getDoc(ref);
  const existingCards: BattleCardsMap = snap.exists()
    ? normalizeBattleCards((snap.data() as PlayerProfile).battleCards)
    : { ...EMPTY_BATTLE_CARDS };

  const isLeader = alliance?.leaderId === userId;

  await setDoc(
    ref,
    {
      odId: userId,
      displayName,
      allianceId: alliance?.id ?? null,
      allianceName: alliance?.name ?? null,
      isLeader: !!isLeader,
      score: alliance ? alliance.score || 50 : 0,
      battleCards: existingCards,
      updatedAt: Date.now(),
    },
    { merge: true }
  );
}

export async function syncAllianceMembers(alliance: AllianceData): Promise<void> {
  const tasks = (alliance.members || []).map(async (memberId) => {
    const ref = doc(db, 'players', memberId);
    const snap = await getDoc(ref);
    const displayName =
      memberId === alliance.leaderId
        ? alliance.leader
        : (snap.data() as PlayerProfile | undefined)?.displayName || 'Oyunçu';

    await setDoc(
      ref,
      {
        odId: memberId,
        displayName,
        allianceId: alliance.id,
        allianceName: alliance.name,
        isLeader: memberId === alliance.leaderId,
        score: alliance.score || 50,
        updatedAt: Date.now(),
      },
      { merge: true }
    );
  });

  await Promise.all(tasks);
}

export async function clearMemberAlliance(userId: string, displayName: string): Promise<void> {
  await syncPlayerWithAlliance(userId, displayName, null);
}

export const createAlliance = async (
  allianceName: string,
  region: string,
  currentUserId: string,
  currentUserName: string
) => {
  if (!allianceName.trim()) throw new Error('İttifaq adını daxil edin!');

  const coords = getRegionCoords(region !== 'Hamısı' ? region : 'Bakı');
  const newAllData = {
    name: allianceName.trim(),
    region: region !== 'Hamısı' ? region : 'Bakı',
    lat: coords.lat,
    lng: coords.lng,
    leaderId: currentUserId,
    leader: currentUserName,
    score: 50,
    members: [currentUserId],
    createdAt: Date.now(),
    flag: { ...DEFAULT_ALLIANCE_FLAG },
    fortressLevel: 1,
    fortressQualifyingMs: 0,
  };

  const docRef = await addDoc(collection(db, 'alliances'), newAllData);
  const created = { id: docRef.id, ...newAllData };

  await syncAllianceMembers(created);
  return created;
};

export const joinAlliance = async (
  alliance: AllianceData,
  currentUserId: string,
  currentUserName: string
) => {
  const updatedMembers = [...(alliance.members || []), currentUserId];
  const newScore = (alliance.score || 50) + 15;
  const allianceRef = doc(db, 'alliances', alliance.id);

  await updateDoc(allianceRef, { members: updatedMembers, score: newScore });
  const updated = { ...alliance, members: updatedMembers, score: newScore };

  await syncPlayerWithAlliance(currentUserId, currentUserName, updated);
  await syncAllianceMembers(updated);

  return updated;
};

export const leaveOrDeleteAlliance = async (
  activeAlliance: AllianceData,
  currentUserId: string,
  currentUserName: string
) => {
  const allianceRef = doc(db, 'alliances', activeAlliance.id);

  if (activeAlliance.leaderId === currentUserId || activeAlliance.members?.length <= 1) {
    await deleteDoc(allianceRef);
    await clearMemberAlliance(currentUserId, currentUserName);
  } else {
    const updatedMembers = activeAlliance.members.filter((m: string) => m !== currentUserId);
    await updateDoc(allianceRef, { members: updatedMembers });
    await clearMemberAlliance(currentUserId, currentUserName);
  }
};

export const sendChatMessage = async (
  text: string,
  currentUserName: string,
  channel: 'global' | 'alliance',
  options?: { userId?: string; allianceId?: string }
) => {
  if (!text.trim()) return;
  if (channel === 'alliance' && !options?.allianceId) {
    throw new Error('İttifaq çatı üçün ittifaq tələb olunur');
  }

  const collectionName = channel === 'global' ? 'global_chat' : 'alliance_chat';
  const payload: Record<string, string | number> = {
    user: currentUserName,
    userId: options?.userId || 'anonim',
    text: text.trim(),
    time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    createdAt: Date.now(),
  };

  if (channel === 'alliance') {
    payload.allianceId = options!.allianceId!;
  }

  await addDoc(collection(db, collectionName), payload);
};

export async function updateAllianceFlag(
  allianceId: string,
  flag: AllianceFlagConfig,
  actorId: string,
  options: LeaderCheckOptions = {}
): Promise<AllianceFlagConfig> {
  const allianceRef = doc(db, 'alliances', allianceId);
  const normalized = normalizeAllianceFlag(flag);
  if (normalized.imageUrl?.startsWith('blob:')) {
    delete normalized.imageUrl;
    delete normalized.imageUpdatedAt;
  }

  const knownLeader = options.isLeaderProfile === true;
  if (!knownLeader) {
    const snap = await withTimeout(getDoc(allianceRef), 4_000, 'İttifaq oxunmadı.');
    if (!snap.exists()) throw new Error('İttifaq tapılmadı');
    const data = { id: snap.id, ...snap.data() } as AllianceData;
    if (!isAllianceLeader(data, actorId, options)) {
      throw new Error('Yalnız lider bayrağı dəyişə bilər');
    }
  }

  const patch: { flag: AllianceFlagConfig; leaderId?: string } = { flag: normalized };
  if (knownLeader) patch.leaderId = actorId;

  await withTimeout(updateDoc(allianceRef, patch), 6_000, 'Bayraq saxlanması vaxtı bitdi.');
  return normalized;
}

export async function updateAllianceName(
  allianceId: string,
  nextName: string,
  actorId: string,
  options: LeaderCheckOptions = {}
): Promise<string> {
  const name = nextName.trim().replace(/\s+/g, ' ');
  if (name.length < 2) throw new Error('İttifaq adı ən azı 2 simvol olmalıdır');
  if (name.length > 32) throw new Error('İttifaq adı 32 simvoldan uzun ola bilməz');

  const allianceRef = doc(db, 'alliances', allianceId);
  const snap = await withTimeout(getDoc(allianceRef), 4_000, 'İttifaq oxunmadı.');
  if (!snap.exists()) throw new Error('İttifaq tapılmadı');
  const data = { id: snap.id, ...snap.data() } as AllianceData;
  if (!isAllianceLeader(data, actorId, options)) {
    throw new Error('Yalnız lider ittifaq adını dəyişə bilər');
  }

  const previousName = data.name?.trim() || '';
  if (previousName === name) return name;

  await withTimeout(
    updateDoc(allianceRef, {
      name,
      previousName,
      nameUpdatedAt: Date.now(),
    }),
    6_000,
    'Ad saxlanması vaxtı bitdi.'
  );

  const members = [...new Set([...(data.members ?? []), data.leaderId].filter(Boolean))];
  await Promise.all(
    members.map((memberId) =>
      updateDoc(doc(db, 'players', memberId), {
        allianceName: name,
        updatedAt: Date.now(),
      }).catch(() => undefined)
    )
  );

  return name;
}

export async function addPlayerScore(userId: string, amount: number): Promise<number> {
  const ref = doc(db, 'players', userId);
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const current = snap.exists() ? (snap.data() as PlayerProfile).score || 0 : 0;
    const next = current + amount;
    tx.set(ref, { score: next, updatedAt: Date.now() }, { merge: true });
    return next;
  });
}

export async function resetBattleCards(userId: string): Promise<void> {
  const ref = doc(db, 'players', userId);
  await setDoc(
    ref,
    { battleCards: { ...EMPTY_BATTLE_CARDS }, updatedAt: Date.now() },
    { merge: true }
  );
}
