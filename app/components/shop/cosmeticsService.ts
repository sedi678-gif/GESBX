import { db } from '../../../firebase';
import { doc, getDoc } from 'firebase/firestore';
import {
  PlayerCosmetics,
  EMPTY_PLAYER_COSMETICS,
} from '../alliance/types';
import { getCosmeticProduct } from './cosmeticsConfig';
import { callSecureFunction } from '@/app/lib/secureFunctions';

function normalizeCosmetics(raw: PlayerCosmetics | undefined): PlayerCosmetics {
  return {
    owned: raw?.owned ?? [],
    equipped: raw?.equipped ?? {},
    vip: raw?.vip ?? { tier: 'none', expiresAt: 0 },
  };
}

export async function purchaseCosmetic(userId: string, productId: string): Promise<void> {
  const product = getCosmeticProduct(productId);
  if (!product) throw new Error('Məhsul tapılmadı');
  await callSecureFunction('purchaseCosmetic', { userId, productId });
}

export async function equipCosmetic(userId: string, productId: string): Promise<void> {
  const product = getCosmeticProduct(productId);
  if (!product) throw new Error('Məhsul tapılmadı');
  if (product.category === 'vip') throw new Error('VIP paketi geyinilə bilməz');
  await callSecureFunction('equipCosmetic', { userId, productId });
}

export async function unequipCosmeticSlot(
  userId: string,
  slot: keyof PlayerCosmetics['equipped']
): Promise<void> {
  await callSecureFunction('unequipCosmeticSlot', { userId, slot });
}

export async function getPlayerCosmetics(userId: string): Promise<PlayerCosmetics> {
  const snap = await getDoc(doc(db, 'players', userId));
  if (!snap.exists()) return { ...EMPTY_PLAYER_COSMETICS };
  return normalizeCosmetics(snap.data()?.cosmetics as PlayerCosmetics | undefined);
}

export { normalizeCosmetics };
