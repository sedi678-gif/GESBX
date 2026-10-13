import { db } from '../../../firebase';
import {
  doc,
  getDoc,
  runTransaction,
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
import { incrementQuestProgress } from '@/app/lib/allianceQuestService';
import { resolvePlayerManat, manatWritePatch } from '@/app/lib/manat';
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
  const product = BATTLE_CARD_PRODUCTS.find((p) => p.id === cardId);
  if (!product) throw new Error('Kart tapılmadı');

  const playerRef = doc(db, 'players', userId);
  const weeklyRef = doc(db, 'alliance_weekly_shop', allianceId);
  const allianceRef = doc(db, 'alliances', allianceId);
  const weekId = getWeekId();

  await runTransaction(db, async (transaction) => {
    const playerSnap = await transaction.get(playerRef);
    const weeklySnap = await transaction.get(weeklyRef);
    const allianceSnap = await transaction.get(allianceRef);

    if (!playerSnap.exists()) throw new Error('Oyunçu profili tapılmadı');
    if (!allianceSnap.exists()) throw new Error('İttifaq tapılmadı');

    const player = playerSnap.data();
    const alliance = allianceSnap.data();
    const members: string[] = alliance.members ?? [];

    if (!members.includes(userId)) {
      throw new Error('Yalnız öz ittifaqın üçün kart ala bilərsən');
    }

    const balance = resolvePlayerManat(player);
    const unlimitedBuyer = isSuperAdmin(userId);
    if (!unlimitedBuyer && balance < product.price) throw new Error('Balansda kifayət qədər manat yoxdur');

    let weekly: AllianceWeeklyShop = weeklySnap.exists()
      ? (weeklySnap.data() as AllianceWeeklyShop)
      : { weekId, cardPurchases: emptyWeeklyPurchases(), updatedAt: Date.now() };

    if (weekly.weekId !== weekId) {
      weekly = { weekId, cardPurchases: emptyWeeklyPurchases(), updatedAt: Date.now() };
    }

    const used = weekly.cardPurchases[cardId] ?? 0;
    if (!unlimitedBuyer && used >= WEEKLY_CARD_LIMIT) {
      throw new Error(`Həftəlik limit dolub: ${product.name} (7/7)`);
    }

    const cards = normalizeBattleCards(player.battleCards as BattleCardsMap);
    if (!unlimitedBuyer) cards[cardId] = (cards[cardId] ?? 0) + 1;

    transaction.set(
      playerRef,
      {
        ...manatWritePatch(unlimitedBuyer ? balance : balance - product.price),
        battleCards: cards,
        allianceId,
        allianceName: alliance.name ?? player.allianceName ?? null,
        updatedAt: Date.now(),
      },
      { merge: true }
    );

    if (!unlimitedBuyer) {
      transaction.set(
        weeklyRef,
        {
          weekId,
          cardPurchases: { ...weekly.cardPurchases, [cardId]: used + 1 },
          updatedAt: Date.now(),
        },
        { merge: true }
      );
    }
  });

  void incrementQuestProgress(allianceId, 'shop_buy', 1);
}

export async function purchaseShield(
  userId: string,
  durationId: ShieldDurationId
): Promise<void> {
  const product = SHIELD_PRODUCTS.find((p) => p.id === durationId);
  if (!product) throw new Error('Qalxan tapılmadı');

  const playerRef = doc(db, 'players', userId);
  const now = Date.now();
  let allianceIdForQuest: string | null = null;

  await runTransaction(db, async (transaction) => {
    const playerSnap = await transaction.get(playerRef);
    if (!playerSnap.exists()) throw new Error('Oyunçu profili tapılmadı');

    const player = playerSnap.data();
    allianceIdForQuest = player.allianceId ?? null;
    const balance = resolvePlayerManat(player);
    if (balance < product.price) throw new Error('Balansda kifayət qədər manat yoxdur');

    const existing: ActiveShield[] = (player.activeShields ?? []).filter(
      (s: ActiveShield) => s.expiresAt > now
    );

    const newShield: ActiveShield = {
      id: `shield_${now}`,
      durationId: product.id,
      name: product.name,
      expiresAt: now + product.durationMs,
      protectsAgainst: [...ALL_DISASTERS],
      purchasedAt: now,
    };

    transaction.set(
      playerRef,
      {
        ...manatWritePatch(balance - product.price),
        activeShields: [...existing, newShield],
        updatedAt: now,
      },
      { merge: true }
    );
  });

  if (allianceIdForQuest) {
    void incrementQuestProgress(allianceIdForQuest, 'shop_buy', 1);
  }
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
