import { BattleCardId } from '../alliance/types';

import { BATTLE_CARD_ASSETS } from '../alliance/battleCardAssets';

import { EMPTY_BATTLE_CARDS } from '../alliance/battleCardsConfig';



export type ShieldDurationId = '12h' | '1d' | '3d' | '7d';



export type DisasterType = 'earthquake' | 'tsunami' | 'fire';



export const WEEKLY_CARD_LIMIT = 7;



export const DISASTER_LABELS: Record<DisasterType, string> = {

  earthquake: 'Zəlzələ',

  tsunami: 'Sunami',

  fire: 'Yangın',

};



export interface BattleCardProduct {

  id: BattleCardId;

  name: string;

  price: number;

  desc: string;

}



export interface ShieldProduct {

  id: ShieldDurationId;

  name: string;

  price: number;

  durationMs: number;

  desc: string;

}



/** Mağaza kartları — Firebase `purchaseBattleCard` ilə sinxron */

export const BATTLE_CARD_PRODUCTS: BattleCardProduct[] = [

  { id: 'zombi', name: 'Zombi Kartı', price: 500, desc: BATTLE_CARD_ASSETS.zombi.desc },

  { id: 'yarasa', name: 'Yarasa Kartı', price: 450, desc: BATTLE_CARD_ASSETS.yarasa.desc },

  { id: 'duman', name: 'Duman Kartı', price: 400, desc: BATTLE_CARD_ASSETS.duman.desc },

  { id: 'mutant', name: 'Mutant Kartı', price: 700, desc: BATTLE_CARD_ASSETS.mutant.desc },

  { id: 'standing', name: 'Standing Kartı', price: 650, desc: BATTLE_CARD_ASSETS.standing.desc },

  { id: 'it', name: 'İt Kartı', price: 550, desc: BATTLE_CARD_ASSETS.it.desc },

];



export const SHIELD_PRODUCTS: ShieldProduct[] = [

  {

    id: '12h',

    name: 'Qalxan — 12 saat',

    price: 800,

    durationMs: 12 * 60 * 60 * 1000,

    desc: 'Zəlzələ, sunami və yangından 12 saat qorunma.',

  },

  {

    id: '1d',

    name: 'Qalxan — 1 gün',

    price: 1400,

    durationMs: 24 * 60 * 60 * 1000,

    desc: 'Bütün fəlakətlərdən 24 saat qorunma.',

  },

  {

    id: '3d',

    name: 'Qalxan — 3 gün',

    price: 3200,

    durationMs: 3 * 24 * 60 * 60 * 1000,

    desc: 'Uzunmüddətli qala müdafiəsi.',

  },

  {

    id: '7d',

    name: 'Qalxan — 7 gün',

    price: 6000,

    durationMs: 7 * 24 * 60 * 60 * 1000,

    desc: 'Həftəlik tam qorunma.',

  },

];



export const ALL_DISASTERS: DisasterType[] = ['earthquake', 'tsunami', 'fire'];



export function getWeekId(date = new Date()): string {

  const d = new Date(date);

  d.setHours(0, 0, 0, 0);

  const day = d.getDay();

  const diff = day === 0 ? -6 : 1 - day;

  d.setDate(d.getDate() + diff);

  return d.toISOString().slice(0, 10);

}



export function emptyWeeklyPurchases(): Record<BattleCardId, number> {

  return { ...EMPTY_BATTLE_CARDS };

}



export function formatShieldExpiry(expiresAt: number): string {

  const diff = expiresAt - Date.now();

  if (diff <= 0) return 'Bitib';

  const hours = Math.floor(diff / (60 * 60 * 1000));

  if (hours >= 24) return `${Math.floor(hours / 24)} gün qaldı`;

  return `${hours} saat qaldı`;

}


