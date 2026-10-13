export {
  BATTLE_CHALLENGE_CLICK_MAX,
  BATTLE_CHALLENGE_COLLECTION,
  BATTLE_CHALLENGE_DURATION_MS,
  allianceMemberCount,
  cardClickScale,
  challengeExpiresAt,
  officialClickTarget,
  officialRequiredClicks,
} from './battleClickConfig';

export type { BattleChallengeStatus, BattleClickTarget } from './battleClickConfig';

export {
  computeChallengeRequired,
  expireBattleChallenge,
  initialChallengeDoc,
  listenBattleChallenges,
  submitChallengeClick,
  viewBattleChallenge,
} from './battleClickService';

export type { BattleChallenge } from './battleClickService';
