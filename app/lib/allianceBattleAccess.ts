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
