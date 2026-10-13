import type { BattleRecord, BattleSide } from '@/app/lib/battleEventLog/battleEventTypes';
import { officialBattleLeader, readBoundedScore } from '@/app/lib/battleScore/battleScoreConfig';

export const BATTLE_RESULT_COLLECTION = 'result';
export const BATTLE_RESULT_DOC_ID = 'final';
export const BATTLE_FINISH_SCHEMA = 1;

/** Tam raund limiti — növbə bundan böyük olanda server bitirir. */
export const BATTLE_FINISH_TURN_LIMIT = 8;
/** Bir tərəf bu xala çatıb irəlidədirsə server bitirir. */
export const BATTLE_FINISH_SCORE_WIN = 40;

export const BATTLE_FINISH_PLAYER_WIN = 8;
export const BATTLE_FINISH_PLAYER_LOSS = 2;
export const BATTLE_FINISH_PLAYER_DRAW = 4;
export const BATTLE_FINISH_ALLIANCE_WIN = 6;
export const BATTLE_FINISH_ALLIANCE_LOSS = 0;
export const BATTLE_FINISH_ALLIANCE_DRAW = 3;

export const BATTLE_GLOBAL_SCORE_MAX = 1_000_000;
export const BATTLE_GLOBAL_SCORE_MIN = 0;

export type BattleFinishReason = 'join_failed' | 'score_reached' | 'turn_limit';

export function isBattleFinishReason(value: unknown): value is BattleFinishReason {
  return value === 'join_failed' || value === 'score_reached' || value === 'turn_limit';
}

export function clampGlobalScore(value: number): number {
  if (!Number.isFinite(value) || !Number.isInteger(value)) return 0;
  return Math.max(BATTLE_GLOBAL_SCORE_MIN, Math.min(BATTLE_GLOBAL_SCORE_MAX, value));
}

export function addGlobalScore(current: unknown, delta: number): number {
  const now = clampGlobalScore(Math.trunc(Number(current) || 0));
  if (!Number.isInteger(delta) || delta < 0 || delta > BATTLE_FINISH_PLAYER_WIN) {
    throw new Error('Qeyri-real ranking dəyişməsi rədd edildi');
  }
  if (delta > BATTLE_GLOBAL_SCORE_MAX - now) return BATTLE_GLOBAL_SCORE_MAX;
  return now + delta;
}

/** Winner yalnız battle score-dan — client sahəsi oxunmur. */
export function officialFinishWinner(battle: Pick<BattleRecord, 'attackerScore' | 'defenderScore' | 'attackerAllianceId' | 'defenderAllianceId'>): {
  winnerSide: BattleSide | null;
  winnerAllianceId: string | null;
  reasonLead: 'attacker' | 'defender' | 'draw';
  attackerScore: number;
  defenderScore: number;
} {
  const lead = officialBattleLeader(battle);
  return {
    winnerSide: lead.leaderSide,
    winnerAllianceId: lead.winnerAllianceId,
    reasonLead: lead.reason,
    attackerScore: lead.attackerScore,
    defenderScore: lead.defenderScore,
  };
}

export function officialFinishReason(battle: BattleRecord): BattleFinishReason | null {
  if (battle.status === 'finished') {
    return isBattleFinishReason(battle.finishReason) ? battle.finishReason : null;
  }
  if (battle.status !== 'active') return null;
  return finishReasonFromScores(battle.turn ?? 0, battle.attackerScore, battle.defenderScore);
}

export function finishReasonFromScores(
  turn: number,
  attackerScore: unknown,
  defenderScore: unknown
): BattleFinishReason | null {
  const atk = readBoundedScore(attackerScore);
  const def = readBoundedScore(defenderScore);
  if (atk >= BATTLE_FINISH_SCORE_WIN || def >= BATTLE_FINISH_SCORE_WIN) {
    return 'score_reached';
  }
  if (turn > BATTLE_FINISH_TURN_LIMIT) return 'turn_limit';
  return null;
}

export function officialPlayerFinishDelta(won: boolean | null): number {
  if (won === true) return BATTLE_FINISH_PLAYER_WIN;
  if (won === false) return BATTLE_FINISH_PLAYER_LOSS;
  return BATTLE_FINISH_PLAYER_DRAW;
}

export function officialAllianceFinishDelta(won: boolean | null): number {
  if (won === true) return BATTLE_FINISH_ALLIANCE_WIN;
  if (won === false) return BATTLE_FINISH_ALLIANCE_LOSS;
  return BATTLE_FINISH_ALLIANCE_DRAW;
}

export function officialFinishDeltas(input: {
  reason: BattleFinishReason;
  winnerSide: BattleSide | null;
  attackerPlayerIds: string[];
  defenderPlayerIds: string[];
  attackerAllianceId: string | null;
  defenderAllianceId: string | null;
}): {
  playerDeltas: Record<string, number>;
  allianceDeltas: Record<string, number>;
} {
  const playerDeltas: Record<string, number> = {};
  const allianceDeltas: Record<string, number> = {};
  if (input.reason === 'join_failed') return { playerDeltas, allianceDeltas };

  const atkWon = input.winnerSide == null ? null : input.winnerSide === 'attacker';
  const defWon = input.winnerSide == null ? null : input.winnerSide === 'defender';
  for (const id of input.attackerPlayerIds) {
    playerDeltas[id] = officialPlayerFinishDelta(atkWon);
  }
  for (const id of input.defenderPlayerIds) {
    playerDeltas[id] = officialPlayerFinishDelta(defWon);
  }
  if (input.attackerAllianceId) {
    allianceDeltas[input.attackerAllianceId] = officialAllianceFinishDelta(atkWon);
  }
  if (input.defenderAllianceId) {
    allianceDeltas[input.defenderAllianceId] = officialAllianceFinishDelta(defWon);
  }
  return { playerDeltas, allianceDeltas };
}
