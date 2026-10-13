export {
  BATTLE_FINISH_ALLIANCE_DRAW,
  BATTLE_FINISH_ALLIANCE_LOSS,
  BATTLE_FINISH_ALLIANCE_WIN,
  BATTLE_FINISH_PLAYER_DRAW,
  BATTLE_FINISH_PLAYER_LOSS,
  BATTLE_FINISH_PLAYER_WIN,
  BATTLE_FINISH_SCHEMA,
  BATTLE_FINISH_SCORE_WIN,
  BATTLE_FINISH_TURN_LIMIT,
  BATTLE_GLOBAL_SCORE_MAX,
  BATTLE_RESULT_COLLECTION,
  BATTLE_RESULT_DOC_ID,
  addGlobalScore,
  clampGlobalScore,
  isBattleFinishReason,
  officialAllianceFinishDelta,
  officialFinishDeltas,
  officialFinishReason,
  officialFinishWinner,
  finishReasonFromScores,
  officialPlayerFinishDelta,
} from './battleFinishConfig';

export type { BattleFinishReason } from './battleFinishConfig';

export {
  battleResultRef,
  finishBattle,
  listenBattleResult,
  stampJoinFailedResult,
  viewBattleFinishResult,
} from './battleFinishService';

export type { BattleFinishResult } from './battleFinishService';
