export {
  BATTLE_CARD_COOLDOWN_MS,
  BATTLE_CARD_MAX_USES,
  BATTLE_TURN_DURATION_MS,
  canPlayOnTurn,
  cardUsageCount,
  initialTurnState,
  nextTurnState,
  officialCardCooldownMs,
  officialCardCooldownSec,
  readCardUsage,
  readCooldownUntil,
  turnEndAtMs,
  viewTurnTimer,
} from './battlePlayConfig';

export { listenServerClock, serverNowMs, syncServerClock } from './battleServerClock';

export { playBattleCard, playOfflineDefenseTurn, timeoutBattleTurn } from './battlePlayService';

export type { PlayBattleCardInput, PlayBattleCardResult } from './battlePlayService';
