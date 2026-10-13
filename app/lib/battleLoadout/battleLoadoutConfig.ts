import { MODEL_CARD_DEFS, modelCardImageUrl } from '@/app/components/alliance/modelCardsCatalog';
import { UNLIMITED_CARD_STOCK } from '@/app/components/alliance/battleCardsConfig';

/** Rəsmi battle hovuzu — 13 model kart. */
export const BATTLE_LOADOUT_POOL = MODEL_CARD_DEFS.map((item) => item.id) as unknown as readonly [
  '2x',
  'casus',
  'duman',
  'guzgu',
  'joker',
  'ogru',
  'qaya',
  'qul',
  'qutb',
  'sehrbaz',
  'tikanli',
  'felaket',
  'usyan',
];

export type BattleLoadoutCardId = (typeof BATTLE_LOADOUT_POOL)[number];

export const BATTLE_LOADOUT_POOL_SIZE = 13;
export const BATTLE_LOADOUT_SIZE = 5;
export const BATTLE_LOADOUT_MAX_COPIES = 1;
export const BATTLE_LOADOUT_COLLECTION = 'loadouts';

export const BATTLE_LOADOUT_TITLES: Record<string, string> = {
  '2x': '2X Kartı',
  casus: 'Cəsus Kartı',
  duman: 'Duman Kartı',
  guzgu: 'Güzgü Kartı',
  joker: 'Joker Kartı',
  ogru: 'Oğru Kartı',
  qaya: 'Qaya Kartı',
  qul: 'Qul Edən Kartı',
  qutb: 'Qütblərin Seçimi',
  sehrbaz: 'Sehrbaz Kartı',
  tikanli: 'Tikanlı Məftil',
  felaket: 'Təbii Fəlakətlər',
  usyan: 'Üsyan Kartı',
};

export interface BattleLoadoutCardMeta {
  id: BattleLoadoutCardId;
  title: string;
  emoji: string;
  accent: string;
  image: string;
}

export function loadoutCardMeta(id: BattleLoadoutCardId): BattleLoadoutCardMeta {
  const model = MODEL_CARD_DEFS.find((item) => item.id === id);
  if (model) {
    return {
      id,
      title: model.title,
      emoji: model.emoji,
      accent: model.accent,
      image: modelCardImageUrl(model),
    };
  }
  return { id, title: BATTLE_LOADOUT_TITLES[id] ?? id, emoji: '🃏', accent: '#64748b', image: '' };
}

export const BATTLE_LOADOUT_CARD_METAS: BattleLoadoutCardMeta[] = BATTLE_LOADOUT_POOL.map(loadoutCardMeta);

const POOL_SET = new Set<string>(BATTLE_LOADOUT_POOL);

export function isBattleLoadoutCardId(value: string): value is BattleLoadoutCardId {
  return POOL_SET.has(value);
}

export function emptyLoadoutInventory(): Record<BattleLoadoutCardId, number> {
  const out = {} as Record<BattleLoadoutCardId, number>;
  for (const id of BATTLE_LOADOUT_POOL) out[id] = 0;
  return out;
}

export function unlimitedLoadoutInventory(): Record<BattleLoadoutCardId, number> {
  const out = emptyLoadoutInventory();
  for (const id of BATTLE_LOADOUT_POOL) out[id] = UNLIMITED_CARD_STOCK;
  return out;
}

/** Bütün oyunçular üçün bütün kartlar limitsizdir. */
export function resolveLoadoutInventory(
  _userId?: string,
  _raw?: Record<string, unknown> | null
): Record<BattleLoadoutCardId, number> {
  return unlimitedLoadoutInventory();
}

export function countSelected(cardIds: string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const id of cardIds) counts[id] = (counts[id] ?? 0) + 1;
  return counts;
}

export function validateBattleLoadout(
  rawIds: unknown,
  owned: Record<string, number>
): BattleLoadoutCardId[] {
  if (!Array.isArray(rawIds)) throw new Error('Kart siyahısı yanlışdır');

  const selected: BattleLoadoutCardId[] = [];
  const counts: Record<string, number> = {};

  for (const raw of rawIds) {
    if (typeof raw !== 'string') throw new Error('Naməlum kart ID');
    const id = raw.trim();
    if (!isBattleLoadoutCardId(id)) throw new Error('Bu kart battle hovuzunda yoxdur');
    counts[id] = (counts[id] ?? 0) + 1;
    if (counts[id] > BATTLE_LOADOUT_MAX_COPIES) {
      throw new Error(`${BATTLE_LOADOUT_TITLES[id] ?? id} ən çox ${BATTLE_LOADOUT_MAX_COPIES} dəfə seçilə bilər`);
    }
    const have = owned[id] ?? 0;
    if (have < counts[id]) throw new Error(`${BATTLE_LOADOUT_TITLES[id] ?? id} kartın yoxdur`);
    selected.push(id);
  }

  if (selected.length !== BATTLE_LOADOUT_SIZE) {
    throw new Error(`Dəqiq ${BATTLE_LOADOUT_SIZE} kart seçilməlidir`);
  }

  return selected;
}

if (BATTLE_LOADOUT_POOL.length !== BATTLE_LOADOUT_POOL_SIZE) {
  throw new Error(`Battle hovuzu ${BATTLE_LOADOUT_POOL_SIZE} kart olmalıdır`);
}
