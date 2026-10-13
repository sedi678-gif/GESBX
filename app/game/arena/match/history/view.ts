import type { ArenaMatchResult, ArenaMatchState, ArenaSide } from '../types';
import type { ArenaHistoryEntry, ArenaHistoryOutcome } from './types';

export function arenaViewerOutcome(
  result: ArenaMatchResult,
  viewerPlayerId: string,
  viewerSide: ArenaSide | null,
  homeAllianceId: string,
  awayAllianceId: string
): ArenaHistoryOutcome {
  const draw =
    result.winnerScore === result.loserScore && result.winnerAllianceId == null && result.winnerPlayerId == null;
  if (draw) return 'DRAW';
  if (result.status === 'CANCELLED' || result.status === 'EXPIRED') {
    if (draw) return 'DRAW';
  }
  if (result.gameMode === '1v1') {
    if (!result.winnerPlayerId) return 'DRAW';
    return result.winnerPlayerId === viewerPlayerId ? 'WIN' : 'LOSS';
  }
  if (!result.winnerAllianceId || !viewerSide) return 'DRAW';
  const viewerAlliance = viewerSide === 'home' ? homeAllianceId : awayAllianceId;
  return viewerAlliance && result.winnerAllianceId === viewerAlliance ? 'WIN' : 'LOSS';
}

export function arenaOpponentLabel(match: Pick<ArenaMatchState, 'gameMode' | 'homePlayerIds' | 'awayPlayerIds' | 'displayNames' | 'homeAllianceId' | 'awayAllianceId' | 'players'>, viewerPlayerId: string): string {
  const side = match.players[viewerPlayerId]?.side;
  if (match.gameMode === '5v5') {
    const opp = side === 'home' ? match.awayAllianceId : match.homeAllianceId;
    return opp.trim() || 'Rəqib ittifaq';
  }
  const oppIds = side === 'home' ? match.awayPlayerIds : match.homePlayerIds;
  const oppId = oppIds.find((id): id is string => Boolean(id));
  if (!oppId) return 'Rəqib';
  return match.displayNames[oppId]?.trim() || oppId.slice(0, 8);
}

export function toArenaHistoryEntry(
  match: ArenaMatchState,
  viewerPlayerId: string
): ArenaHistoryEntry | null {
  const result = match.result;
  if (match.status !== 'closed' || !result) return null;
  const side = match.players[viewerPlayerId]?.side ?? null;
  return {
    resultId: result.resultId,
    matchId: result.matchId,
    gameMode: result.gameMode,
    resultStatus: result.status,
    opponentLabel: arenaOpponentLabel(match, viewerPlayerId),
    viewerOutcome: arenaViewerOutcome(
      result,
      viewerPlayerId,
      side,
      match.homeAllianceId,
      match.awayAllianceId
    ),
    winnerScore: result.winnerScore,
    loserScore: result.loserScore,
    finalDamage: result.finalDamage,
    completedAt: result.completedAt,
    result,
  };
}

export function isArenaHistoryParticipant(match: ArenaMatchState, playerId: string): boolean {
  if (match.participantIds.includes(playerId)) return true;
  if (match.createdBy === playerId) return true;
  return match.homePlayerIds.includes(playerId) || match.awayPlayerIds.includes(playerId);
}
