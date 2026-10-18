import type { ArenaMatchState } from './types';

export const ARENA_PRESENCE_HEARTBEAT_MS = 4_000;
export const ARENA_PRESENCE_STALE_MS = 12_000;

export function isArenaPlayerOffline(
  presence: { online?: boolean; updatedAt?: number } | undefined,
  now: number,
  matchCreatedAt?: number,
): boolean {
  if (!Number.isFinite(now) || now <= 0) return false;
  if (!presence || presence.updatedAt === undefined) {
    return Number.isFinite(matchCreatedAt) && now - Number(matchCreatedAt) > ARENA_PRESENCE_STALE_MS;
  }
  if (!presence.online) return true;
  return !Number.isFinite(presence.updatedAt) || now - Number(presence.updatedAt) > ARENA_PRESENCE_STALE_MS;
}

export function canArenaPlayerControl(
  match: ArenaMatchState,
  actorPlayerId: string,
  targetPlayerId: string,
  presence: Record<string, { online?: boolean; updatedAt?: number }>,
  now: number,
): boolean {
  if (actorPlayerId === targetPlayerId) return true;
  const actor = match.players[actorPlayerId];
  const target = match.players[targetPlayerId];
  return Boolean(
    actor && target && actor.side === target.side &&
    isArenaPlayerOffline(presence[targetPlayerId], now, match.createdAt)
  );
}
