export const BATTLE_EVENT_SCHEMA_VERSION = 1;

export const BATTLE_EVENTS_COLLECTION = 'battles';
export const BATTLE_EVENT_SUBCOLLECTION = 'events';

export const BATTLE_EVENT_TYPES = [
  'battle_created',
  'player_joined',
  'player_left',
  'loadout_locked',
  'card_played',
  'energy_changed',
  'card_blocked',
  'card_countered',
  'click_started',
  'click_completed',
  'damage_applied',
  'score_changed',
  'turn_started',
  'turn_timeout',
  'battle_finished',
] as const;

export type BattleEventType = (typeof BATTLE_EVENT_TYPES)[number];

export type BattleStatus = 'open' | 'joining' | 'locked' | 'active' | 'finished';

export type BattleKind = 'open' | 'alliance_map';

export type BattleSide = 'attacker' | 'defender';

export type BattleEventMetaMap = {
  battle_created: {
    mode?: string;
    maxPlayers?: number;
  };
  player_joined: {
    side?: string;
    role?: string;
  };
  player_left: {
    reason?: string;
  };
  loadout_locked: {
    cardIds?: string[];
    slotCount?: number;
  };
  card_played: {
    cardId?: string;
    slotIndex?: number;
    side?: string;
    instanceId?: string;
    requestId?: string;
    usage?: number;
  };
  energy_changed: {
    energy?: number;
    delta?: number;
    reason?: string;
    cardId?: string;
    requestId?: string;
  };
  card_blocked: {
    cardId?: string;
    blockerCardId?: string;
    slotIndex?: number;
  };
  card_countered: {
    cardId?: string;
    counterCardId?: string;
  };
  click_started: {
    target?: string;
    required?: number;
  };
  click_completed: {
    clicks?: number;
    required?: number;
    success?: boolean;
    requestId?: string;
  };
  damage_applied: {
    amount?: number;
    targetPlayerId?: string;
    targetAllianceId?: string;
    source?: string;
    requestId?: string;
  };
  score_changed: {
    score?: number;
    delta?: number;
    scope?: 'player' | 'alliance';
    requestId?: string;
    cardId?: string;
  };
  turn_started: {
    turn?: number;
    side?: string;
  };
  turn_timeout: {
    turn?: number;
    side?: string;
  };
  battle_finished: {
    winnerPlayerId?: string;
    winnerAllianceId?: string;
    reason?: string;
    winnerSide?: string;
    attackerScore?: number;
    defenderScore?: number;
  };
};

export type BattleEventMeta<T extends BattleEventType = BattleEventType> = BattleEventMetaMap[T];

export interface BattleEvent<T extends BattleEventType = BattleEventType> {
  eventId: string;
  battleId: string;
  playerId: string;
  type: T;
  seq: number;
  /** Server timestamp, millis */
  createdAt: number;
  schemaVersion: typeof BATTLE_EVENT_SCHEMA_VERSION;
  meta: BattleEventMeta<T>;
}

export interface BattleRecord {
  id: string;
  createdBy: string;
  createdAt: number;
  updatedAt: number;
  status: BattleStatus;
  eventSeq: number;
  participantIds: string[];
  schemaVersion: typeof BATTLE_EVENT_SCHEMA_VERSION;
  kind?: BattleKind;
  attackerAllianceId?: string;
  defenderAllianceId?: string;
  attackerAllianceName?: string;
  defenderAllianceName?: string;
  attackerPlayerIds?: string[];
  defenderPlayerIds?: string[];
  attackerUids?: string[];
  defenderUids?: string[];
  joinEndsAt?: number;
  joinDurationMs?: number;
  turn?: number;
  turnSide?: BattleSide;
  turnPlayerId?: string;
  stateVersion?: number;
  turnStartAt?: number;
  turnEndAt?: number;
  turnDurationMs?: number;
  attackerScore?: number;
  defenderScore?: number;
  scoreVersion?: number;
  lastScoreRequestId?: string;
  winnerSide?: BattleSide | null;
  winnerAllianceId?: string | null;
  finishReason?: string;
  finishedAt?: number;
}

export interface AppendBattleEventInput<T extends BattleEventType = BattleEventType> {
  battleId: string;
  playerId: string;
  type: T;
  meta?: BattleEventMeta<T>;
}

export interface BattleAuditReport {
  battleId: string;
  eventCount: number;
  firstSeq: number | null;
  lastSeq: number | null;
  contiguous: boolean;
  missingSeq: number[];
  duplicateSeq: number[];
  events: BattleEvent[];
}

export function isBattleEventType(value: string): value is BattleEventType {
  return (BATTLE_EVENT_TYPES as readonly string[]).includes(value);
}
