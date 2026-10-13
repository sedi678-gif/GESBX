import {
  ARENA_ENERGY_MAX,
  ARENA_ENERGY_START,
  ARENA_SLOT_COUNT,
  ARENA_TURN_DURATION_MS,
  ARENA_TURN_ROLES,
} from './config';
import { emptyArenaEffects } from './effects/types';
import type { ArenaMatchState, ArenaPlayerState, ArenaSide, ArenaTurnSeat } from './types';

function padSlots(ids: Array<string | null> | undefined): Array<string | null> {
  const next = [...(ids ?? [])].slice(0, ARENA_SLOT_COUNT);
  while (next.length < ARENA_SLOT_COUNT) next.push(null);
  return next.map((id) => {
    if (typeof id !== 'string') return null;
    const trimmed = id.trim();
    return trimmed ? trimmed : null;
  });
}

export function filledParticipantIds(
  homePlayerIds: Array<string | null> | undefined,
  awayPlayerIds: Array<string | null> | undefined
): string[] {
  const seen: Record<string, true> = {};
  const ids: string[] = [];
  [...padSlots(homePlayerIds), ...padSlots(awayPlayerIds)].forEach((id) => {
    if (!id || seen[id]) return;
    seen[id] = true;
    ids.push(id);
  });
  return ids;
}

export function filledTurnQueue(
  homePlayerIds: Array<string | null> | undefined,
  awayPlayerIds: Array<string | null> | undefined
): ArenaTurnSeat[] {
  const seats: ArenaTurnSeat[] = [];
  (['home', 'away'] as const).forEach((side) => {
    const ids = side === 'home' ? padSlots(homePlayerIds) : padSlots(awayPlayerIds);
    ids.forEach((playerId, slotIndex) => {
      if (!playerId) return;
      seats.push({
        playerId,
        side,
        slotIndex,
        role: ARENA_TURN_ROLES[slotIndex] ?? 'MEMBER',
      });
    });
  });
  return seats;
}

export function firstFilledSeat(
  homePlayerIds: Array<string | null> | undefined,
  awayPlayerIds: Array<string | null> | undefined
): ArenaTurnSeat {
  const seats = filledTurnQueue(homePlayerIds, awayPlayerIds);
  if (seats.length === 0) {
    throw new Error('Arena-da oyunçu yoxdur');
  }
  return seats[0];
}

export function nextFilledSeat(seats: ArenaTurnSeat[], current: ArenaTurnSeat): ArenaTurnSeat {
  if (seats.length === 0) {
    throw new Error('Arena-da oyunçu yoxdur');
  }
  const index = seats.findIndex(
    (seat) =>
      seat.playerId === current.playerId &&
      seat.side === current.side &&
      seat.slotIndex === current.slotIndex
  );
  const nextIndex = index < 0 ? 0 : (index + 1) % seats.length;
  return seats[nextIndex];
}

export function currentSeatFromMatch(match: Pick<ArenaMatchState, 'homePlayerIds' | 'awayPlayerIds' | 'currentTurn' | 'turnSide' | 'turnSlotIndex'>): ArenaTurnSeat {
  const seats = filledTurnQueue(match.homePlayerIds, match.awayPlayerIds);
  const exact = seats.find(
    (seat) =>
      seat.side === match.turnSide &&
      seat.slotIndex === match.turnSlotIndex &&
      seat.playerId === match.currentTurn
  );
  if (exact) return exact;
  const byId = seats.find((seat) => seat.playerId === match.currentTurn);
  if (byId) return byId;
  return firstFilledSeat(match.homePlayerIds, match.awayPlayerIds);
}

export function remainingTurnSeconds(turnExpiresAt: number, serverNow: number): number {
  if (!Number.isFinite(serverNow) || serverNow <= 0) return 0;
  if (!Number.isFinite(turnExpiresAt)) return 0;
  return Math.max(0, Math.ceil((turnExpiresAt - serverNow) / 1000));
}

export function buildPlayerMap(
  homePlayerIds: Array<string | null> | undefined,
  awayPlayerIds: Array<string | null> | undefined
): Record<string, ArenaPlayerState> {
  const players: Record<string, ArenaPlayerState> = {};
  filledTurnQueue(homePlayerIds, awayPlayerIds).forEach((seat) => {
    players[seat.playerId] = {
      playerId: seat.playerId,
      role: seat.role,
      side: seat.side,
      slotIndex: seat.slotIndex,
      energy: ARENA_ENERGY_START,
      maxEnergy: ARENA_ENERGY_MAX,
    };
  });
  return players;
}

export function applyArenaSeat(
  match: ArenaMatchState,
  playerId: string,
  side: ArenaSide,
  displayName?: string
): ArenaMatchState {
  const id = playerId.trim();
  if (!id) return match;
  if (match.players[id]) return match;
  const slots = [...(side === 'home' ? match.homePlayerIds : match.awayPlayerIds)];
  const empty = slots.findIndex((seat) => !seat);
  if (empty < 0) return match;
  slots[empty] = id;
  const homePlayerIds = side === 'home' ? slots : match.homePlayerIds;
  const awayPlayerIds = side === 'away' ? slots : match.awayPlayerIds;
  const rebuilt = buildPlayerMap(homePlayerIds, awayPlayerIds);
  return {
    ...match,
    homePlayerIds,
    awayPlayerIds,
    players: { ...match.players, [id]: rebuilt[id] },
    participantIds: filledParticipantIds(homePlayerIds, awayPlayerIds),
    displayNames: displayName?.trim()
      ? { ...match.displayNames, [id]: displayName.trim().slice(0, 32) }
      : match.displayNames,
  };
}

export function energiesEqual(
  before: Record<string, ArenaPlayerState>,
  after: Record<string, ArenaPlayerState>
): boolean {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const key of keys) {
    const a = before[key];
    const b = after[key];
    if (!a || !b) return false;
    if (a.energy !== b.energy || a.maxEnergy !== b.maxEnergy) return false;
  }
  return true;
}

export function createMatchSnapshot(input: {
  matchId: string;
  createdBy: string;
  homePlayerIds: Array<string | null>;
  awayPlayerIds: Array<string | null>;
  displayNames?: Record<string, string>;
  serverNow: number;
  gameMode?: '1v1' | '5v5';
  homeAllianceId?: string;
  awayAllianceId?: string;
}): ArenaMatchState {
  const homePlayerIds = padSlots(input.homePlayerIds);
  const awayPlayerIds = padSlots(input.awayPlayerIds);
  const first = firstFilledSeat(homePlayerIds, awayPlayerIds);
  const players = buildPlayerMap(homePlayerIds, awayPlayerIds);
  return {
    matchId: input.matchId,
    status: 'active',
    createdBy: input.createdBy,
    homePlayerIds,
    awayPlayerIds,
    participantIds: filledParticipantIds(homePlayerIds, awayPlayerIds),
    players,
    displayNames: input.displayNames ?? {},
    phase: 'combat',
    loadouts: {},
    usedActionIds: {},
    gameMode: input.gameMode === '5v5' ? '5v5' : '1v1',
    homeAllianceId: input.homeAllianceId ?? '',
    awayAllianceId: input.awayAllianceId ?? '',
    sideScores: { home: 0, away: 0 },
    scoreHistory: [],
    effects: emptyArenaEffects(),
    reaction: null,
    result: null,
    currentTurn: first.playerId,
    turnSide: first.side,
    turnSlotIndex: first.slotIndex,
    turnIndex: 0,
    turnSeq: 0,
    turnStartedAt: input.serverNow,
    turnExpiresAt: input.serverNow + ARENA_TURN_DURATION_MS,
    turnDuration: ARENA_TURN_DURATION_MS,
    lastActionId: null,
    lastActionTurnSeq: -1,
    createdAt: input.serverNow,
    updatedAt: input.serverNow,
  };
}

export function advanceMatchTurn(match: ArenaMatchState, serverNow: number): ArenaMatchState {
  const seats = filledTurnQueue(match.homePlayerIds, match.awayPlayerIds);
  const next = nextFilledSeat(seats, currentSeatFromMatch(match));
  return {
    ...match,
    currentTurn: next.playerId,
    turnSide: next.side,
    turnSlotIndex: next.slotIndex,
    turnIndex: match.turnIndex + 1,
    turnSeq: match.turnSeq + 1,
    turnStartedAt: serverNow,
    turnExpiresAt: serverNow + ARENA_TURN_DURATION_MS,
    turnDuration: ARENA_TURN_DURATION_MS,
    lastActionId: null,
    lastActionTurnSeq: -1,
    updatedAt: serverNow,
  };
}

export function roleLabelAz(role: ArenaTurnSeat['role']): string {
  if (role === 'LIDER') return 'Lider';
  if (role === 'HELP_LIDER') return 'Köməkçi';
  if (role === 'CLICKER') return 'Kliker';
  return 'Üzv';
}

export function turnLabel(match: ArenaMatchState): string {
  const seat = currentSeatFromMatch(match);
  const name = match.displayNames[seat.playerId]?.trim() || seat.playerId.slice(0, 8);
  return `Turn: ${roleLabelAz(seat.role)} ${name}`;
}

export function sideSlots(
  match: ArenaMatchState,
  side: ArenaSide
): Array<string | null> {
  return side === 'home' ? match.homePlayerIds : match.awayPlayerIds;
}
