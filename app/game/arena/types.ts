import type { GameRole } from '../players/types';

export const ARENA_SLOT_ROLES: readonly GameRole[] = [
  'LIDER',
  'HELP_LIDER',
  'CLICKER',
  'MEMBER',
  'MEMBER',
];

export const ARENA_ROLE_LABEL: Record<GameRole, string> = {
  LIDER: 'Lider',
  HELP_LIDER: 'Köməkçi',
  CLICKER: 'Kliker',
  MEMBER: 'Üzv',
};

export interface ArenaSlotPlayer {
  id: string;
  name: string;
  role: GameRole;
  online: boolean;
  avatarUrl?: string;
}

export interface ArenaHandCardView {
  id: string;
  title: string;
  image?: string;
  emoji?: string;
  energyCostLabel: string;
  remainingUsesLabel: string;
  selected: boolean;
  disabled?: boolean;
}

export interface ArenaViewModel {
  homeAllianceName: string;
  awayAllianceName: string;
  matchState: { statusLabel: string };
  timer: { label: string };
  energy: { label: string; current: number; max: number };
  gameMode: '1v1' | '5v5';
  players: {
    home: Array<ArenaSlotPlayer | null>;
    away: Array<ArenaSlotPlayer | null>;
  };
    cards: { hand: ArenaHandCardView[] };
  activeCard: null;
  currentTurn: { playerId: string; label: string } | null;
  clickEvent: {
    visible: boolean;
    cardTitle: string;
    shareable?: boolean;
    modeLabel?: string;
    remainingSeconds?: number;
    currentClicks?: number;
    requiredClicks?: number;
    canClick?: boolean;
    chatText?: string;
    reactionId?: string;
  };
  effectLabel?: string;
  doubleActive?: boolean;
  spyReveal?: string[];
}

export const EMPTY_ARENA_VIEW: ArenaViewModel = {
    homeAllianceName: 'Sən',
    awayAllianceName: 'Rəqib',
  matchState: { statusLabel: 'Arena' },
  timer: { label: '--:--' },
  energy: { label: '-- / --', current: 0, max: 30 },
  gameMode: '5v5',
  players: {
    away: [null, null, null, null, null],
    home: [null, null, null, null, null],
  },
  cards: { hand: [] },
  activeCard: null,
  currentTurn: null,
  clickEvent: { visible: false, cardTitle: 'Klik kartı' },
};
