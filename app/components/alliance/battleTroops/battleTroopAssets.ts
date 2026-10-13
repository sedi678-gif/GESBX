import type { BattleCardId } from '../types';

export const TROOP_BATTLE_DURATION_MS = 9000;
export const TROOP_ATTACK_PHASE_RATIO = 0.72;

/** Köhnə sprite qoşunları silindi */
export type TroopState = 'attack' | 'death';
export type TroopSpriteCardId = never;

export const BATTLE_TROOP_TEXTURE_PATHS = {} as const;

export function isTroopSpriteCard(_cardId: BattleCardId): _cardId is TroopSpriteCardId {
  return false;
}

export type TroopTexturePair = { attack: unknown; death: unknown };

export async function loadBattleTroopTextures(): Promise<
  Partial<Record<TroopSpriteCardId, TroopTexturePair>>
> {
  return {};
}
