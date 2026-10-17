import { db } from '../../../firebase';
import {
  doc,
  getDoc,
  collection,
  onSnapshot,
  Unsubscribe,
} from 'firebase/firestore';
import { BattleCardId, BattleCardsMap, ActiveShield, AllianceWeeklyShop } from '../alliance/types';
import {
  BATTLE_CARD_PRODUCTS,
  SHIELD_PRODUCTS,
  ShieldDurationId,
  WEEKLY_CARD_LIMIT,
  getWeekId,
  emptyWeeklyPurchases,
  ALL_DISASTERS,
} from './shopConfig';
import { EMPTY_BATTLE_CARDS, normalizeBattleCards } from '../alliance/battleCardsConfig';
import { resolvePlayerManat } from '@/app/lib/manat';
import { callSecureFunction } from '@/app/lib/secureFunctions';
import { purchaseFortressLevel as purchaseFortressLevelCore } from '@/app/lib/allianceFortressService';
import type { AllianceFortressLevel } from '@/app/lib/allianceFortressConfig';
import { isSuperAdmin } from '@/app/lib/adminConfig';

export function listenWeeklyShop(
  allianceId: string,
  callback: (data: AllianceWeeklyShop | null) => void
): Unsubscribe {
  const ref = doc(db, 'alliance_weekly_shop', allianceId);
  return onSnapshot(ref, (snap) => {
    if (!snap.exists()) {
      callback(null);
      return;
    }
    const data = snap.data() as AllianceWeeklyShop;
    const weekId = getWeekId();
    if (data.weekId !== weekId) {
      callback({ weekId, cardPurchases: emptyWeeklyPurchases(), updatedAt: Date.now() });
    } else {
      callback({
        weekId: data.weekId,
        cardPurchases: { ...emptyWeeklyPurchases(), ...data.cardPurchases },
        updatedAt: data.updatedAt,
      });
    }
  });
}

export function getRemainingWeekly(
  weekly: AllianceWeeklyShop | null,
  cardId: BattleCardId,
  userId?: string
): number {
  if (userId) return Number.POSITIVE_INFINITY;
  const weekId = getWeekId();
  if (!weekly || weekly.weekId !== weekId) return WEEKLY_CARD_LIMIT;
  const used = weekly.cardPurchases[cardId] ?? 0;
  return Math.max(0, WEEKLY_CARD_LIMIT - used);
}

export async function purchaseBattleCard(
  userId: string,
  allianceId: string,
  cardId: BattleCardId
): Promise<void> {
  await callSecureFunction('purchaseBattleCard', { userId, allianceId, cardId });
}

export async function purchaseShield(
  userId: string,
  durationId: ShieldDurationId
): Promise<void> {
  await callSecureFunction('purchaseShield', { userId, durationId });
}

export async function getPlayerManat(userId: string): Promise<number> {
  const snap = await getDoc(doc(db, 'players', userId));
  if (!snap.exists()) return 0;
  return resolvePlayerManat(snap.data());
}

/** @deprecated getPlayerManat istifadə edin */
export async function getPlayerCoins(userId: string): Promise<number> {
  return getPlayerManat(userId);
}

export async function purchaseFortressLevel(
  userId: string,
  allianceId: string,
  level: AllianceFortressLevel
): Promise<void> {
  await purchaseFortressLevelCore(userId, allianceId, level);
}
