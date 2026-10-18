import { db } from '../../../firebase';
import {
  doc,
  setDoc,
  getDoc,
  collection,
  addDoc,
  runTransaction,
  serverTimestamp,
} from 'firebase/firestore';
import { getRegionCoords } from './regionCoords';
import {
  AllianceData,
  AllianceFlagConfig,
  PlayerProfile,
  EMPTY_PLAYER_COSMETICS,
} from './types';
import { normalizeAllianceFlag } from './allianceFlagConfig';
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
  void _legacyUserId;
  void _displayName;
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
    transaction.set(ref, { ...profile, identityVerifiedAt: serverTimestamp() });
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

export const createAlliance = async (
  allianceName: string,
  region: string,
  currentUserId: string,
  currentUserName: string
) => {
  if (!allianceName.trim()) throw new Error('İttifaq adını daxil edin!');
  void currentUserName;

  const coords = getRegionCoords(region !== 'Hamısı' ? region : 'Bakı');
  const newAllData = {
    name: allianceName.trim(),
    region: region !== 'Hamısı' ? region : 'Bakı',
    lat: coords.lat,
    lng: coords.lng,
  };

  return callSecureFunction<
    { userId: string; name: string; region: string; lat: number; lng: number },
    AllianceData
  >('createAlliance', {
    userId: currentUserId,
    name: newAllData.name,
    region: newAllData.region,
    lat: newAllData.lat,
    lng: newAllData.lng,
  });
};

export const joinAlliance = async (
  alliance: AllianceData,
  currentUserId: string,
  currentUserName: string
) => {
  void currentUserName;
  const result = await callSecureFunction<
    { userId: string; allianceId: string },
    { id: string; members: string[]; score: number }
  >('joinAlliance', { userId: currentUserId, allianceId: alliance.id });
  return { ...alliance, members: result.members, score: result.score };
};

export const leaveOrDeleteAlliance = async (
  activeAlliance: AllianceData,
  currentUserId: string,
  currentUserName: string
) => {
  void currentUserName;
  await callSecureFunction<{ userId: string; allianceId: string }, { deleted: boolean }>(
    'leaveAlliance',
    { userId: currentUserId, allianceId: activeAlliance.id },
  );
};

export async function setAllianceAssistantLeader(
  allianceId: string,
  userId: string,
  assistantLeaderId: string,
  promote: boolean,
): Promise<string[]> {
  const result = await callSecureFunction<
    { allianceId: string; userId: string; assistantLeaderId: string; promote: boolean },
    { assistantLeaderIds: string[] }
  >('setAllianceAssistantLeader', { allianceId, userId, assistantLeaderId, promote });
  return result.assistantLeaderIds;
}

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

  const patch: { flag: AllianceFlagConfig } = { flag: normalized };

  await callSecureFunction('updateAllianceFlag', { userId: actorId, allianceId, flag: patch.flag });
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

  await callSecureFunction('updateAllianceName', { userId: actorId, allianceId, name });

  return name;
}

