import { db } from '../../../firebase';
import { doc, getDoc, runTransaction, setDoc } from 'firebase/firestore';
import {
  PlayerCosmetics,
  EMPTY_PLAYER_COSMETICS,
  VipTier,
} from '../alliance/types';
import {
  COSMETIC_PRODUCTS,
  getCosmeticProduct,
  isVipActive,
  canPurchaseCosmetic,
  resolveBannerGradient,
  DEFAULT_BANNER,
} from './cosmeticsConfig';
import { resolvePlayerManat, manatWritePatch } from '@/app/lib/manat';

function normalizeCosmetics(raw: PlayerCosmetics | undefined): PlayerCosmetics {
  return {
    owned: raw?.owned ?? [],
    equipped: raw?.equipped ?? {},
    vip: raw?.vip ?? { tier: 'none', expiresAt: 0 },
  };
}

function getEquipSlot(category: string): keyof PlayerCosmetics['equipped'] | null {
  switch (category) {
    case 'nameStyle':
      return 'nameStyleId';
    case 'frame':
      return 'frameId';
    case 'banner':
      return 'bannerId';
    case 'badge':
      return 'badgeId';
    default:
      return null;
  }
}

async function syncCosmeticsToUserProfile(userId: string, cosmetics: PlayerCosmetics): Promise<void> {
  const bannerGradient = resolveBannerGradient(cosmetics, DEFAULT_BANNER);
  await setDoc(
    doc(db, 'users', userId),
    {
      bannerGradient,
      equippedCosmetics: cosmetics.equipped,
      vipTier: isVipActive(cosmetics) ? cosmetics.vip.tier : 'none',
      vipExpiresAt: cosmetics.vip.expiresAt,
      updatedAt: Date.now(),
    },
    { merge: true }
  );
}

export async function purchaseCosmetic(userId: string, productId: string): Promise<void> {
  const product = getCosmeticProduct(productId);
  if (!product) throw new Error('Məhsul tapılmadı');

  const playerRef = doc(db, 'players', userId);

  await runTransaction(db, async (transaction) => {
    const playerSnap = await transaction.get(playerRef);
    if (!playerSnap.exists()) throw new Error('Oyunçu profili tapılmadı');

    const player = playerSnap.data();
    const cosmetics = normalizeCosmetics(player.cosmetics as PlayerCosmetics | undefined);
    const check = canPurchaseCosmetic(product, cosmetics);
    if (!check.ok) throw new Error(check.reason || 'Alına bilməz');

    const balance = resolvePlayerManat(player);
    if (balance < product.price) throw new Error('Balansda kifayət qədər manat yoxdur');

    const next: PlayerCosmetics = {
      ...cosmetics,
      owned:
        product.category === 'vip'
          ? cosmetics.owned
          : [...cosmetics.owned, productId],
    };

    if (product.category === 'vip' && product.vipTier && product.vipDurationMs) {
      const now = Date.now();
      const base = cosmetics.vip.expiresAt > now ? cosmetics.vip.expiresAt : now;
      const tierRank: Record<VipTier, number> = { none: 0, gold: 1, platinum: 2 };
      const newTier =
        tierRank[product.vipTier] >= tierRank[cosmetics.vip.tier]
          ? product.vipTier
          : cosmetics.vip.tier;
      next.vip = {
        tier: newTier === 'none' ? product.vipTier : newTier,
        expiresAt: base + product.vipDurationMs,
      };
    } else if (product.category !== 'vip') {
      const slot = getEquipSlot(product.category);
      if (slot && !next.equipped[slot]) {
        next.equipped = { ...next.equipped, [slot]: productId };
      }
    }

    transaction.set(
      playerRef,
      {
        ...manatWritePatch(balance - product.price),
        cosmetics: next,
        updatedAt: Date.now(),
      },
      { merge: true }
    );
  });

  const refreshed = await getDoc(playerRef);
  const cosmetics = normalizeCosmetics(refreshed.data()?.cosmetics as PlayerCosmetics | undefined);
  await syncCosmeticsToUserProfile(userId, cosmetics);
}

export async function equipCosmetic(userId: string, productId: string): Promise<void> {
  const product = getCosmeticProduct(productId);
  if (!product) throw new Error('Məhsul tapılmadı');
  if (product.category === 'vip') throw new Error('VIP paketi geyinilə bilməz');

  const slot = getEquipSlot(product.category);
  if (!slot) throw new Error('Yanlış kateqoriya');

  const playerRef = doc(db, 'players', userId);

  await runTransaction(db, async (transaction) => {
    const playerSnap = await transaction.get(playerRef);
    if (!playerSnap.exists()) throw new Error('Oyunçu profili tapılmadı');

    const player = playerSnap.data();
    const cosmetics = normalizeCosmetics(player.cosmetics as PlayerCosmetics | undefined);

    if (!cosmetics.owned.includes(productId)) {
      throw new Error('Bu kosmetikaya sahib deyilsən');
    }

    const equipped = { ...cosmetics.equipped, [slot]: productId };

    transaction.set(
      playerRef,
      {
        cosmetics: { ...cosmetics, equipped },
        updatedAt: Date.now(),
      },
      { merge: true }
    );
  });

  const refreshed = await getDoc(playerRef);
  const cosmetics = normalizeCosmetics(refreshed.data()?.cosmetics as PlayerCosmetics | undefined);
  await syncCosmeticsToUserProfile(userId, cosmetics);
}

export async function unequipCosmeticSlot(
  userId: string,
  slot: keyof PlayerCosmetics['equipped']
): Promise<void> {
  const playerRef = doc(db, 'players', userId);
  const playerSnap = await getDoc(playerRef);
  if (!playerSnap.exists()) return;

  const cosmetics = normalizeCosmetics(playerSnap.data()?.cosmetics as PlayerCosmetics | undefined);
  const equipped = { ...cosmetics.equipped };
  delete equipped[slot];

  await setDoc(
    playerRef,
    { cosmetics: { ...cosmetics, equipped }, updatedAt: Date.now() },
    { merge: true }
  );
  await syncCosmeticsToUserProfile(userId, { ...cosmetics, equipped });
}

export async function getPlayerCosmetics(userId: string): Promise<PlayerCosmetics> {
  const snap = await getDoc(doc(db, 'players', userId));
  if (!snap.exists()) return { ...EMPTY_PLAYER_COSMETICS };
  return normalizeCosmetics(snap.data()?.cosmetics as PlayerCosmetics | undefined);
}

export { normalizeCosmetics, syncCosmeticsToUserProfile };
