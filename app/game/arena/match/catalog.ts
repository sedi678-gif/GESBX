import {
  BATTLE_LOADOUT_POOL,
  isBattleLoadoutCardId,
  loadoutCardMeta,
  type BattleLoadoutCardId,
} from '@/app/lib/battleLoadout/battleLoadoutConfig';

export const ARENA_LOADOUT_SIZE = 5;
export const ARENA_CARD_MAX_USES = 3;
export const ARENA_CARD_POOL_SIZE = 13;

export type ArenaCardId = BattleLoadoutCardId;

export const ARENA_CARD_IDS = BATTLE_LOADOUT_POOL;

/** Server cost cədvəli — client cost qəbul edilmir. */
export const ARENA_CARD_ENERGY_COSTS: Record<ArenaCardId, number> = {
  sehrbaz: 5,
  '2x': 5,
  qaya: 5,
  casus: 5,
  duman: 4,
  joker: 4,
  guzgu: 4,
  qul: 4,
  tikanli: 4,
  usyan: 4,
  ogru: 3,
  felaket: 3,
  qutb: 3,
};

export const ARENA_CARD_TITLES: Record<ArenaCardId, string> = {
  sehrbaz: 'Sehrbaz',
  '2x': '2X',
  qaya: 'Daş Adam',
  casus: 'Casus',
  duman: 'Duman',
  joker: 'Joker',
  guzgu: 'Güzgü',
  qul: 'Qul edən',
  tikanli: 'Tikanlı Məftil',
  usyan: 'Üsyan',
  ogru: 'Oğru',
  felaket: 'Zəlzələ / Tsunami',
  qutb: 'Yanğın / Buz',
};

export function isArenaCardId(value: string): value is ArenaCardId {
  return isBattleLoadoutCardId(value);
}

export function officialArenaCardCost(cardId: string): number {
  if (!isArenaCardId(cardId)) return 0;
  const cost = ARENA_CARD_ENERGY_COSTS[cardId];
  return Number.isInteger(cost) && cost > 0 ? cost : 0;
}

export function arenaCardTitle(cardId: string): string {
  if (!isArenaCardId(cardId)) return cardId;
  return ARENA_CARD_TITLES[cardId];
}

export function arenaCardMeta(cardId: ArenaCardId) {
  const model = loadoutCardMeta(cardId);
  return {
    id: cardId,
    title: ARENA_CARD_TITLES[cardId],
    emoji: model.emoji,
    accent: model.accent,
    image: model.image,
    cost: officialArenaCardCost(cardId),
  };
}

export const ARENA_CARD_CATALOG = ARENA_CARD_IDS.map(arenaCardMeta);

if (ARENA_CARD_IDS.length !== ARENA_CARD_POOL_SIZE) {
  throw new Error(`Arena kataloqu ${ARENA_CARD_POOL_SIZE} kart olmalıdır`);
}
