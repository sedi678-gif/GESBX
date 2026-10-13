export {
  BATTLE_ALLIANCE_DELTA_MAX,
  BATTLE_CARD_EFFECTS,
  BATTLE_DAMAGE_MAX,
  BATTLE_PLAY_EVENT_COUNT,
  BATTLE_PLAYER_DELTA_MAX,
  BATTLE_SCORE_COLLECTION,
  BATTLE_SCORE_MAX,
  BATTLE_SCORE_MIN,
  BATTLE_STEAL_MAX,
  addOfficialScore,
  applyOfficialBattleScores,
  initialBattleScoreDoc,
  officialBattleLeader,
  officialCardEffect,
  readBoundedScore,
  takeOfficialScore,
} from './battleScoreConfig';

export type { BattleCardEffectKind, OfficialCardEffect } from './battleScoreConfig';

export { battleScoreRef, listenPlayerBattleScore, viewPlayerBattleScore } from './battleScoreService';
export type { BattlePlayerScore } from './battleScoreService';
