import { BATTLE_FINISH_SCORE_WIN, BATTLE_FINISH_TURN_LIMIT } from '@/app/lib/battleFinish/battleFinishConfig';
import type { ArenaMatchResult, ArenaMatchState, ArenaResultStatus, ArenaSide } from './types';

function firstPlayer(ids: Array<string | null>): string | null {
  return ids.find((id): id is string => Boolean(id)) ?? null;
}

export function officialArenaFinishReason(match: ArenaMatchState): 'score_reached' | 'turn_limit' | null {
  if (match.status !== 'active') return null;
  if (match.reaction?.status === 'ACTIVE') return null;
  const home = match.sideScores.home;
  const away = match.sideScores.away;
  if (home >= BATTLE_FINISH_SCORE_WIN || away >= BATTLE_FINISH_SCORE_WIN) {
    return 'score_reached';
  }
  if (match.turnIndex > BATTLE_FINISH_TURN_LIMIT) return 'turn_limit';
  return null;
}

export function officialArenaLeader(match: ArenaMatchState): {
  winnerSide: ArenaSide | null;
  winnerScore: number;
  loserScore: number;
} {
  const home = match.sideScores.home;
  const away = match.sideScores.away;
  if (home > away) return { winnerSide: 'home', winnerScore: home, loserScore: away };
  if (away > home) return { winnerSide: 'away', winnerScore: away, loserScore: home };
  return { winnerSide: null, winnerScore: home, loserScore: away };
}

export function officialArenaFinalDamage(match: ArenaMatchState): number {
  return Math.max(0, Math.trunc(match.sideScores.home) + Math.trunc(match.sideScores.away));
}

export function buildArenaMatchResult(
  match: ArenaMatchState,
  serverNow: number,
  status: ArenaResultStatus = 'COMPLETED'
): ArenaMatchResult {
  const lead = officialArenaLeader(match);
  const winnerSide = lead.winnerSide;
  const loserSide: ArenaSide | null = winnerSide === 'home' ? 'away' : winnerSide === 'away' ? 'home' : null;
  const winnerAllianceId =
    winnerSide === 'home' ? match.homeAllianceId || null : winnerSide === 'away' ? match.awayAllianceId || null : null;
  const loserAllianceId =
    loserSide === 'home' ? match.homeAllianceId || null : loserSide === 'away' ? match.awayAllianceId || null : null;
  const winnerPlayerId =
    winnerSide === 'home' ? firstPlayer(match.homePlayerIds) : winnerSide === 'away' ? firstPlayer(match.awayPlayerIds) : null;
  const loserPlayerId =
    loserSide === 'home' ? firstPlayer(match.homePlayerIds) : loserSide === 'away' ? firstPlayer(match.awayPlayerIds) : null;
  return {
    status,
    resultId: `${match.matchId}_final`,
    matchId: match.matchId,
    gameMode: match.gameMode,
    winnerAllianceId: match.gameMode === '5v5' ? winnerAllianceId : null,
    loserAllianceId: match.gameMode === '5v5' ? loserAllianceId : null,
    winnerPlayerId: match.gameMode === '1v1' ? winnerPlayerId : null,
    loserPlayerId: match.gameMode === '1v1' ? loserPlayerId : null,
    winnerScore: lead.winnerScore,
    loserScore: lead.loserScore,
    finalDamage: officialArenaFinalDamage(match),
    completedAt: serverNow,
  };
}

export function applyArenaMatchCompletion(
  match: ArenaMatchState,
  serverNow: number,
  status: ArenaResultStatus = 'COMPLETED'
): ArenaMatchState {
  if (match.status === 'closed' && match.result) return match;
  const reason = officialArenaFinishReason(match);
  if (status === 'COMPLETED' && !reason) {
    throw new Error('REJECT');
  }
  return {
    ...match,
    status: 'closed',
    result: buildArenaMatchResult(match, serverNow, status),
    updatedAt: serverNow,
  };
}
