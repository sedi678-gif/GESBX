import {
  BATTLE_CHALLENGE_DURATION_MS,
  officialRequiredClicks,
} from '@/app/lib/battleClick/battleClickConfig';
import { officialActiveUsers } from '../effects/damage';

export const ARENA_REACTION_DURATION_MS = BATTLE_CHALLENGE_DURATION_MS;
export const ARENA_TSUNAMI_DURATION_MS = 5_000;
export const ARENA_EARTHQUAKE_DURATION_MS = 10_000;
export const ARENA_ICE_FREEZE_MS = 10 * 60 * 1000;

export function officialReactionDurationMs(cardId: string, mode: string | null): number {
  if (cardId === 'felaket' && mode === 'tsunami') return ARENA_TSUNAMI_DURATION_MS;
  if (cardId === 'felaket') return ARENA_EARTHQUAKE_DURATION_MS;
  return ARENA_REACTION_DURATION_MS;
}
export const ARENA_REACTION_COLLECTION = 'reaction_events';

export type ArenaSizeTier = 'SMALL' | 'MEDIUM' | 'LARGE';
export type ArenaReactionStatus = 'ACTIVE' | 'SUCCESS' | 'FAILED' | 'EXPIRED' | 'CANCELLED';

/** Mövcud battle click bandı: ≤5 SMALL, ≤15 MEDIUM, əks halda LARGE. */
export function getAllianceSizeTier(activeUsers: unknown): ArenaSizeTier {
  const n = officialActiveUsers(activeUsers);
  if (n <= 5) return 'SMALL';
  if (n <= 15) return 'MEDIUM';
  return 'LARGE';
}

export function officialArenaRequiredClicks(cardId: string, activeUsers: unknown): number {
  const n = officialActiveUsers(activeUsers);
  const members = Array.from({ length: n }, (_, i) => `u${i}`);
  return officialRequiredClicks(cardId, members);
}

export function officialReactionChatText(cardId: string, mode: string | null): string {
  if (cardId === 'qutb' && mode === 'ice') return '❄️ Buz kartı aktivdir — müdafiə klikləri tələb olunur.';
  if (cardId === 'qutb') return '⚡ Yanğın kartı aktivdir — müdafiə klikləri tələb olunur.';
  if (cardId === 'felaket' && mode === 'tsunami') return '🌊 Tsunami kartı aktivdir — müdafiə klikləri tələb olunur.';
  if (cardId === 'felaket') return '⚡ Zəlzələ kartı aktivdir — müdafiə klikləri tələb olunur.';
  if (cardId === 'qul') return '⛓️ Qul edən kartı aktivdir — müdafiə klikləri tələb olunur.';
  if (cardId === 'usyan') return '⚔️ Üsyan kartı aktivdir — müdafiə klikləri tələb olunur.';
  return '⚡ Klik kartı aktivdir — müdafiə klikləri tələb olunur.';
}
