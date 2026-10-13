import { ARENA_CARD_IDS } from '../catalog';
import type { ArenaChainStep, ArenaLastPlay, ArenaInteractionEventType } from './types';

/** Sequential counter order already encoded in lastPlay; not a parallel window. */
export const ARENA_COUNTER_PRIORITY = ['qaya', 'guzgu', 'tikanli', 'usyan'] as const;

export const ARENA_REFLECT_MAX_DEPTH = 1;
export const ARENA_JOKER_COPY_MAX_DEPTH = 1;

export function qayaCounterOutcome(
  last: ArenaLastPlay | null,
  playerId: string
): { chain: ArenaChainStep; breaksMirror: boolean; cancels: boolean } {
  const breaksMirror = Boolean(last && last.cardId === 'guzgu' && last.playerId !== playerId);
  const cancels = Boolean(last && last.playerId !== playerId && !last.cancelled);
  return {
    breaksMirror,
    cancels,
    chain: breaksMirror || cancels ? 'CANCEL' : 'COUNTER',
  };
}

export function canReflectAttack(last: ArenaLastPlay | null, playerId: string): boolean {
  if (!last || last.playerId === playerId) return false;
  if (last.damage <= 0 || last.cancelled) return false;
  if (last.reflected || last.chain === 'REFLECT') return false;
  if ((last.reflectDepth ?? 0) >= ARENA_REFLECT_MAX_DEPTH) return false;
  return true;
}

export function pickJokerMimic(seed: string, opponentCardIds: string[]): string | null {
  const banned = new Set(['joker']);
  const pool = opponentCardIds.filter((id) => !banned.has(id) && id !== 'tikanli' && id !== 'usyan');
  const fallback = ARENA_CARD_IDS.filter((id) => !banned.has(id));
  const source = pool.length ? pool : fallback;
  const picked = pickStable(seed, source);
  if (!picked || banned.has(picked)) return null;
  return picked;
}

export function revealCasusCards(opponentCardIds: string[]): string[] {
  return sanitizeSpyReveal(opponentCardIds);
}

export function sanitizeSpyReveal(ids: string[]): string[] {
  return ids.filter((id) => id !== 'duman').slice(0, 3);
}

export function tikanliReplayAllowed(input: {
  lastCounterOk: boolean;
  countered: { playerId: string; cardId: string } | null;
  forcedReplay: { playerId: string; cardId: string } | null;
  lastPlay: ArenaLastPlay | null;
}): boolean {
  if (input.forcedReplay) return false;
  if (input.lastPlay?.chain === 'REPLAY') return false;
  if (!input.lastCounterOk || !input.countered) return false;
  return true;
}

export function arenaInteractionEvents(input: {
  cardId: string;
  chain: ArenaLastPlay['chain'];
  mimicCardId: string | null;
  replayed: boolean;
  replayRequired: boolean;
  hidden: boolean;
}): ArenaInteractionEventType[] {
  const events: ArenaInteractionEventType[] = ['CARD_PLAYED'];
  if (input.cardId === 'qaya' || input.cardId === 'guzgu' || input.cardId === 'tikanli' || input.cardId === 'usyan') {
    events.push('COUNTER_WINDOW_STARTED', 'COUNTER_PLAYED');
  }
  if (input.chain === 'CANCEL' || input.chain === 'COUNTER') events.push('CARD_BLOCKED', 'COUNTER_RESOLVED');
  if (input.chain === 'REFLECT') events.push('CARD_REFLECTED', 'COUNTER_RESOLVED');
  if (input.mimicCardId) events.push('CARD_COPIED');
  if (input.replayRequired) events.push('CARD_REPLAY_REQUIRED');
  if (input.replayed) events.push('CARD_REPLAYED');
  events.push('CARD_EFFECT_FINALIZED');
  if (input.hidden) {
    return events.filter((event) => event !== 'CARD_COPIED');
  }
  return events;
}

export function publicAuditCardId(cardId: string, hidden: boolean): string {
  return hidden || cardId === 'duman' ? 'hidden' : cardId;
}

function pickStable(seed: string, items: string[]): string | null {
  if (!items.length) return null;
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return items[Math.abs(hash) % items.length] ?? null;
}
