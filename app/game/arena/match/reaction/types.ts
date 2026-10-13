import type { ArenaSide } from '../types';
import type { ArenaCardMode } from '../effects/damage';
import type { ArenaPeakWindow } from '../effects/scoreHistory';
import type { ArenaReactionStatus, ArenaSizeTier } from './config';

export type ArenaReactionPendingKind = 'damage' | 'qul' | 'usyan';

export type ArenaReactionPending = {
  kind: ArenaReactionPendingKind;
  damage: number;
  attackerId: string;
  attackerSide: ArenaSide;
  defenderSide: ArenaSide;
  peak: ArenaPeakWindow | null;
};

export type ArenaReactionState = {
  active: boolean;
  reactionId: string;
  matchId: string;
  sourcePlayerId: string;
  sourceAllianceId: string;
  targetAllianceId: string;
  targetSide: ArenaSide;
  cardId: string;
  mode: ArenaCardMode | null;
  startedAt: number;
  expiresAt: number;
  durationMs: number;
  requiredClicks: number;
  currentClicks: number;
  status: ArenaReactionStatus;
  sizeTier: ArenaSizeTier;
  usedActionIds: Record<string, boolean>;
  clickers: Record<string, boolean>;
  pending: ArenaReactionPending;
  chatForwarded: boolean;
  chatText: string;
};

export type ArenaReactionEventType =
  | 'reactionCreated'
  | 'clickReceived'
  | 'clickRejected'
  | 'reactionSucceeded'
  | 'reactionFailed'
  | 'reactionExpired'
  | 'chatForwarded';

export type ArenaReactionEvent = {
  type: ArenaReactionEventType;
  matchId: string;
  reactionId: string;
  playerId: string;
  timestamp: number;
  cardId: string;
  currentClicks: number;
  requiredClicks: number;
  actionId: string;
};
