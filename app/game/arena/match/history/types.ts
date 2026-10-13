import type { ArenaMatchResult, ArenaResultStatus } from '../types';

export const ARENA_HISTORY_PAGE_SIZE = 20;

export type ArenaHistoryOutcome = 'WIN' | 'LOSS' | 'DRAW';

export type ArenaHistoryCursor = {
  completedAt: number;
  matchId: string;
};

export type ArenaPublicTimelineKind =
  | 'card_played'
  | 'card_countered'
  | 'card_blocked'
  | 'card_reflected'
  | 'reaction_started'
  | 'reaction_succeeded'
  | 'reaction_failed'
  | 'match_completed';

export type ArenaPublicTimelineEvent = {
  id: string;
  at: number;
  kind: ArenaPublicTimelineKind;
  label: string;
  cardId: string | null;
};

export type ArenaHistoryEntry = {
  resultId: string;
  matchId: string;
  gameMode: '1v1' | '5v5';
  resultStatus: ArenaResultStatus;
  opponentLabel: string;
  viewerOutcome: ArenaHistoryOutcome;
  winnerScore: number;
  loserScore: number;
  finalDamage: number;
  completedAt: number;
  result: ArenaMatchResult;
};

export type ArenaHistoryPage = {
  entries: ArenaHistoryEntry[];
  nextCursor: ArenaHistoryCursor | null;
};

export type ArenaCardSummaryItem = {
  cardId: string;
  title: string;
  count: number;
};

export type ArenaMatchDetails =
  | {
      kind: 'active';
      matchId: string;
    }
  | {
      kind: 'completed';
      matchId: string;
      result: ArenaMatchResult;
      entry: ArenaHistoryEntry;
      timeline: ArenaPublicTimelineEvent[];
      cardSummary: ArenaCardSummaryItem[];
    };
