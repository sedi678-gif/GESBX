export interface AllianceBattleAuthority {
  leaderId?: string | null;
  assistantLeaderIds?: unknown;
}

export function canStartAllianceBattle(
  alliance: AllianceBattleAuthority,
  playerId: string,
): boolean {
  if (String(alliance.leaderId || '') === playerId) return true;
  return Array.isArray(alliance.assistantLeaderIds)
    && alliance.assistantLeaderIds.some((id) => String(id) === playerId);
}

export function canReuseActiveAllianceBattle(input: {
  status: string;
  attackerAllianceId: string;
  defenderAllianceId: string;
  requestedAttackerAllianceId: string;
  requestedDefenderAllianceId: string;
  arenaClosed: boolean;
}): boolean {
  return !input.arenaClosed
    && ['joining', 'locked', 'active'].includes(input.status)
    && input.attackerAllianceId === input.requestedAttackerAllianceId
    && input.defenderAllianceId === input.requestedDefenderAllianceId;
}

/** Canlı döyüş bu müddət boyu battle/arena sənədlərinə heç bir yazı almayıbsa — tərk edilmiş (zombi) sayılır. */
export const ALLIANCE_BATTLE_STALE_MS = 10 * 60 * 1000;

export function isStaleLiveAllianceBattle(input: {
  status: string;
  /** battle.updatedAt və arena.updatedAt arasındakı ən son fəaliyyət vaxtı (ms). */
  lastActivityAt: number;
  now: number;
}): boolean {
  if (input.status !== 'joining' && input.status !== 'locked' && input.status !== 'active') return false;
  if (!Number.isFinite(input.now)) return false;
  // Fəaliyyət vaxtı məlum deyilsə — hazırkı (bloklayan) davranışı saxla.
  if (!Number.isFinite(input.lastActivityAt) || input.lastActivityAt <= 0) return false;
  return input.now - input.lastActivityAt > ALLIANCE_BATTLE_STALE_MS;
}

export function isExpiredUnstartedAllianceBattle(input: {
  status: string;
  joinEndsAt: number;
  now: number;
  arenaStarted?: boolean;
}): boolean {
  const staleStartPhase = input.status === 'joining' || input.status === 'locked';
  return staleStartPhase
    && input.arenaStarted !== true
    && Number.isFinite(input.joinEndsAt)
    && input.joinEndsAt > 0
    && Number.isFinite(input.now)
    && input.now >= input.joinEndsAt + 2 * 60 * 1000;
}
