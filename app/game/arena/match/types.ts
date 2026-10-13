import type { ArenaTurnRole } from './config';
import type { ArenaEffectState } from './effects/types';
import type { ArenaScoreTick } from './effects/scoreHistory';
import type { ArenaReactionState } from './reaction/types';

export type { ArenaTurnRole };

export type ArenaSide = 'home' | 'away';
export type ArenaMatchStatus = 'active' | 'closed';
export type ArenaMatchPhase = 'loadout' | 'combat';
export type ArenaResultStatus = 'COMPLETED' | 'CANCELLED' | 'EXPIRED';

export type ArenaMatchResult = {
  status: ArenaResultStatus;
  resultId: string;
  matchId: string;
  gameMode: '1v1' | '5v5';
  winnerAllianceId: string | null;
  loserAllianceId: string | null;
  winnerPlayerId: string | null;
  loserPlayerId: string | null;
  winnerScore: number;
  loserScore: number;
  finalDamage: number;
  completedAt: number;
};

export type ArenaLoadoutCard = {
  cardId: string;
  maxUses: number;
  used: number;
  remaining: number;
};

export type ArenaPlayerLoadout = {
  playerId: string;
  matchId: string;
  cards: ArenaLoadoutCard[];
};

export type ArenaPlayerState = {
  playerId: string;
  role: ArenaTurnRole;
  side: ArenaSide;
  slotIndex: number;
  energy: number;
  maxEnergy: number;
};

export type ArenaTurnSeat = {
  playerId: string;
  role: ArenaTurnRole;
  side: ArenaSide;
  slotIndex: number;
};

export type ArenaMatchState = {
  matchId: string;
  status: ArenaMatchStatus;
  phase: ArenaMatchPhase;
  createdBy: string;
  homePlayerIds: Array<string | null>;
  awayPlayerIds: Array<string | null>;
  participantIds: string[];
  players: Record<string, ArenaPlayerState>;
  displayNames: Record<string, string>;
  currentTurn: string;
  turnSide: ArenaSide;
  turnSlotIndex: number;
  turnIndex: number;
  turnSeq: number;
  turnStartedAt: number;
  turnExpiresAt: number;
  turnDuration: number;
  lastActionId: string | null;
  lastActionTurnSeq: number;
  loadouts: Record<string, ArenaPlayerLoadout>;
  usedActionIds: Record<string, boolean>;
  gameMode: '1v1' | '5v5';
  homeAllianceId: string;
  awayAllianceId: string;
  sideScores: { home: number; away: number };
  scoreHistory: ArenaScoreTick[];
  effects: ArenaEffectState;
  reaction: ArenaReactionState | null;
  result: ArenaMatchResult | null;
  createdAt: number;
  updatedAt: number;
};

export type ArenaPresenceState = {
  playerId: string;
  online: boolean;
  updatedAt: number;
};
