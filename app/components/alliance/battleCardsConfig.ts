import { isSuperAdmin } from '@/app/lib/adminConfig';
import { BattleCard, BattleCardId, BattleCardsMap } from './types';
import { BATTLE_CARD_ASSETS } from './battleCardAssets';



export const ALLIANCE_SOCKET_URL =

  process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:4000';



/** Aktiv kart ID-ləri (köhnə barbar / sadikIt / joker silinib) */

export const ALL_CARD_IDS: BattleCardId[] = [

  'zombi',

  'yarasa',

  'duman',

  'mutant',

  'standing',

  'it',

];



/** Firestore köhnə profillərdən çıxarılan kartlar */

export const LEGACY_BATTLE_CARD_IDS = ['barbar', 'sadikIt', 'joker'] as const;



export const BATTLE_CARDS_SCHEMA_VERSION = 4;



export const EMPTY_BATTLE_CARDS: BattleCardsMap = {

  zombi: 0,

  yarasa: 0,

  duman: 0,

  mutant: 0,

  standing: 0,

  it: 0,

};



/** Firebase-dən oxunan kartları cari sxemə uyğunlaşdırır */

export function normalizeBattleCards(

  raw?: Partial<BattleCardsMap> | Record<string, number> | null

): BattleCardsMap {

  const out = { ...EMPTY_BATTLE_CARDS };

  if (!raw) return out;

  for (const id of ALL_CARD_IDS) {

    const v = Number(raw[id]);

    if (Number.isFinite(v) && v > 0) out[id] = Math.floor(v);

  }

  return out;

}



export const BATTLE_CARD_DEFS: { id: BattleCardId; name: string }[] = [

  { id: 'zombi', name: BATTLE_CARD_ASSETS.zombi.title },

  { id: 'yarasa', name: BATTLE_CARD_ASSETS.yarasa.title },

  { id: 'duman', name: BATTLE_CARD_ASSETS.duman.title },

  { id: 'mutant', name: BATTLE_CARD_ASSETS.mutant.title },

  { id: 'standing', name: BATTLE_CARD_ASSETS.standing.title },

  { id: 'it', name: BATTLE_CARD_ASSETS.it.title },

];



export function battleCardsMapToList(cards: BattleCardsMap): BattleCard[] {

  return BATTLE_CARD_DEFS.map((def) => ({

    id: def.id,

    name: def.name,

    count: cards[def.id] ?? 0,

  }));

}



export function totalBattleCards(cards: BattleCardsMap): number {

  return Object.values(cards).reduce((sum, n) => sum + n, 0);

}

export const UNLIMITED_CARD_STOCK = 9999;

export function unlimitedBattleCards(): BattleCardsMap {
  const out = { ...EMPTY_BATTLE_CARDS };
  for (const id of ALL_CARD_IDS) out[id] = UNLIMITED_CARD_STOCK;
  return out;
}

export function isUnlimitedStock(count: number): boolean {
  return Number.isFinite(count) && count >= UNLIMITED_CARD_STOCK;
}

export function formatCardCount(count: number): string {
  if (!Number.isFinite(count) || isUnlimitedStock(count)) return '∞';
  return String(count);
}

export function formatCardTotal(cards: Array<{ count: number }>): string {
  if (cards.length > 0 && cards.every((card) => isUnlimitedStock(card.count))) return '∞';
  return formatCardCount(cards.reduce((sum, card) => sum + card.count, 0));
}

export function resolveBattleCardsForUser(
  _userId?: string,
  _raw?: Partial<BattleCardsMap> | Record<string, number> | null
): BattleCardsMap {
  return unlimitedBattleCards();
}


