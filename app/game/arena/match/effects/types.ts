import type { ArenaSide } from '../types';
import type { ArenaCardMode } from './damage';
import type { ArenaPeakWindow } from './scoreHistory';

export type ArenaChainStep = 'ATTACK' | 'COUNTER' | 'REFLECT' | 'CANCEL' | 'REPLAY';

export type ArenaInteractionEventType =
  | 'CARD_PLAYED'
  | 'COUNTER_WINDOW_STARTED'
  | 'COUNTER_PLAYED'
  | 'COUNTER_RESOLVED'
  | 'CARD_REFLECTED'
  | 'CARD_BLOCKED'
  | 'CARD_COPIED'
  | 'CARD_REPLAY_REQUIRED'
  | 'CARD_REPLAYED'
  | 'CARD_EFFECT_FINALIZED';

export type ArenaClickEvent = {
  cardId: string;
  mode: ArenaCardMode | null;
  playerId: string;
  createdAt: number;
  sharedToChat: boolean;
};

export type ArenaLastPlay = {
  playerId: string;
  side: ArenaSide;
  cardId: string;
  mode: ArenaCardMode | null;
  damage: number;
  hidden: boolean;
  cancelled: boolean;
  reflected: boolean;
  chain: ArenaChainStep;
  reflectDepth?: number;
};

export type ArenaSlaveState = {
  attackerId: string;
  defenderSide: ArenaSide;
  peak: ArenaPeakWindow;
  status: 'pending' | 'success' | 'failed';
  at: number;
};

export type ArenaForcedReplay = {
  playerId: string;
  cardId: string;
  remaining: number;
  ownerSide: ArenaSide;
};

export type ArenaEffectState = {
  pendingDoubleFor: string | null;
  pendingHideNext: boolean;
  frozenUntil: { home: number; away: number };
  lastPlay: ArenaLastPlay | null;
  lastCounterOk: boolean;
  countered: { playerId: string; cardId: string } | null;
  forcedReplay: ArenaForcedReplay | null;
  slave: ArenaSlaveState | null;
  clickEvent: ArenaClickEvent | null;
  spyReveal: Record<string, string[]>;
  jokerMimic: string | null;
  chain: Array<{ step: ArenaChainStep; cardId: string; playerId: string }>;
  lastSummary: string;
  lastEvents: ArenaInteractionEventType[];
};

export type ArenaEffectResult = {
  cardId: string;
  mode: ArenaCardMode | null;
  effectType: string;
  damage: number;
  multiplier: number;
  chain: ArenaChainStep;
  mimicCardId: string | null;
  revealedCardIds: string[];
  replaced: { playerId: string; from: string; to: string } | null;
  hiddenFromOpponent: boolean;
  peak: ArenaPeakWindow | null;
  slaveStatus: ArenaSlaveState['status'] | null;
  clickEvent: ArenaClickEvent | null;
  summary: string;
};

export function emptyArenaEffects(): ArenaEffectState {
  return {
    pendingDoubleFor: null,
    pendingHideNext: false,
    frozenUntil: { home: 0, away: 0 },
    lastPlay: null,
    lastCounterOk: false,
    countered: null,
    forcedReplay: null,
    slave: null,
    clickEvent: null,
    spyReveal: {},
    jokerMimic: null,
    chain: [],
    lastSummary: '',
    lastEvents: [],
  };
}
