import { ARENA_ENERGY_MAX, ARENA_ENERGY_START, ARENA_TURN_DURATION_MS } from './config';
import { energiesEqual } from './turnOrder';
import type { ArenaMatchState, ArenaPlayerState } from './types';

function requireServerNow(serverNow: number): number {
  if (!Number.isFinite(serverNow) || serverNow <= 0) {
    throw new Error('Server saatı yoxdur');
  }
  return serverNow;
}

export function assertArenaMatchActive(match: ArenaMatchState): void {
  if (match.status !== 'active') {
    throw new Error('Match aktiv deyil');
  }
}

export function assertArenaTimeoutAllowed(match: ArenaMatchState, serverNow: number): void {
  assertArenaMatchActive(match);
  if (match.phase !== 'combat') {
    throw new Error('REJECT');
  }
  const now = requireServerNow(serverNow);
  if (now < match.turnExpiresAt) {
    throw new Error('Növbə vaxtı hələ bitməyib');
  }
}

export function assertArenaActionAllowed(input: {
  match: ArenaMatchState;
  playerId: string;
  actionId: string;
  serverNow: number;
}): 'ok' | 'duplicate' {
  const { match, playerId, actionId } = input;
  assertArenaMatchActive(match);
  requireServerNow(input.serverNow);
  if (match.phase !== 'combat') {
    throw new Error('REJECT');
  }
  if (!actionId.trim()) {
    throw new Error('Action id yoxdur');
  }
  if (match.currentTurn !== playerId) {
    throw new Error('REJECT');
  }
  if (match.lastActionTurnSeq === match.turnSeq) {
    if (match.lastActionId === actionId) return 'duplicate';
    throw new Error('REJECT');
  }
  if (input.serverNow >= match.turnExpiresAt) {
    throw new Error('Növbə vaxtı bitib');
  }
  return 'ok';
}

export function assertEnergyUntouched(
  before: Record<string, ArenaPlayerState>,
  after: Record<string, ArenaPlayerState>
): void {
  if (!energiesEqual(before, after)) {
    throw new Error('Energy client tərəfindən dəyişdirilə bilməz');
  }
}

export function assertStartEnergy(players: Record<string, ArenaPlayerState>): void {
  for (const player of Object.values(players)) {
    if (player.energy !== ARENA_ENERGY_START || player.maxEnergy !== ARENA_ENERGY_MAX) {
      throw new Error('Energy yalnız 30/30 ilə başlaya bilər');
    }
    if (player.energy > ARENA_ENERGY_MAX) {
      throw new Error('Energy 30-dan yuxarı ola bilməz');
    }
  }
}

export function assertTurnClock(match: Pick<ArenaMatchState, 'turnStartedAt' | 'turnExpiresAt' | 'turnDuration'>): void {
  if (match.turnDuration !== ARENA_TURN_DURATION_MS) {
    throw new Error('Turn duration 15000 olmalıdır');
  }
  if (match.turnExpiresAt !== match.turnStartedAt + ARENA_TURN_DURATION_MS) {
    throw new Error('turnExpiresAt server timestamp-dən hesablanmalıdır');
  }
}

export function rejectClientEnergyWrite(): never {
  throw new Error('Energy client tərəfindən dəyişdirilə bilməz');
}

export function clientCannotWriteMatchFields(): readonly string[] {
  return [
    'energy',
    'selected cards',
    'remaining uses',
    'used count',
    'card cost',
    'maxUses',
    'turnIndex',
    'currentTurn',
    'turnStartedAt',
    'turnExpiresAt',
    'status',
    'lastActionId',
    'lastActionTurnSeq',
    'winner',
    'loser',
    'final score',
    'final damage',
    'completedAt',
    'result',
  ];
}
