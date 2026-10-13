import { BATTLE_LOADOUT_POOL, isBattleLoadoutCardId, type BattleLoadoutCardId } from '@/app/lib/battleLoadout/battleLoadoutConfig';
import type { BattleRecord, BattleSide } from '@/app/lib/battleEventLog/battleEventTypes';

export const BATTLE_CARD_MAX_USES = 3;
export const BATTLE_TURN_DURATION_MS = 15_000;
export const BATTLE_PLAY_COLLECTION = 'energy';
export const BATTLE_PLAY_REQUESTS_COLLECTION = 'energy_requests';

/** Rəsmi cooldown — client dəyəri qəbul edilmir. */
export const BATTLE_CARD_COOLDOWN_MS: Record<BattleLoadoutCardId, number> = {
  '2x': 8_000,
  casus: 6_000,
  duman: 5_000,
  guzgu: 10_000,
  joker: 12_000,
  ogru: 8_000,
  qaya: 7_000,
  qul: 14_000,
  qutb: 12_000,
  sehrbaz: 8_000,
  tikanli: 10_000,
  felaket: 14_000,
  usyan: 12_000,
};

export function officialCardCooldownMs(cardId: string): number {
  if (!isBattleLoadoutCardId(cardId)) return 0;
  const ms = BATTLE_CARD_COOLDOWN_MS[cardId];
  return Number.isInteger(ms) && ms > 0 ? ms : 0;
}

export function officialCardCooldownSec(cardId: string): number {
  return Math.round(officialCardCooldownMs(cardId) / 1000);
}

export function readCardUsage(raw: unknown, fallbackIds: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
      const n = Math.trunc(Number(value));
      if (n > 0) out[key] = n;
    }
  }
  if (Array.isArray(fallbackIds)) {
    for (const id of fallbackIds) {
      if (typeof id !== 'string' || !id) continue;
      out[id] = Math.max(out[id] ?? 0, 1);
    }
  }
  return out;
}

export function readCooldownUntil(raw: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      out[key] = value;
      continue;
    }
    if (value && typeof value === 'object' && 'toMillis' in value) {
      const ms = (value as { toMillis: () => number }).toMillis();
      if (Number.isFinite(ms)) out[key] = ms;
    }
  }
  return out;
}

export function cardUsageCount(usage: Record<string, number>, cardId: string): number {
  return Math.max(0, Math.trunc(usage[cardId] ?? 0));
}

export function nextTurnState(battle: BattleRecord, playedSide: BattleSide): {
  turn: number;
  turnSide: BattleSide;
  turnPlayerId: string;
} {
  const attackers = battle.attackerPlayerIds ?? [];
  const defenders = battle.defenderPlayerIds ?? [];
  const turn = battle.turn && battle.turn > 0 ? battle.turn : 1;

  if (playedSide === 'attacker') {
    if (defenders.length === 0) {
      const nextTurn = turn + 1;
      const idx = Math.max(0, (nextTurn - 1) % Math.max(attackers.length, 1));
      return {
        turn: nextTurn,
        turnSide: 'attacker',
        turnPlayerId: attackers[idx] || attackers[0] || '',
      };
    }
    const idx = Math.max(0, (turn - 1) % Math.max(defenders.length, 1));
    const turnPlayerId = defenders[idx] || defenders[0] || '';
    return { turn, turnSide: 'defender', turnPlayerId };
  }

  const nextTurn = turn + 1;
  const idx = Math.max(0, (nextTurn - 1) % Math.max(attackers.length, 1));
  const turnPlayerId = attackers[idx] || attackers[0] || battle.turnPlayerId || '';
  return { turn: nextTurn, turnSide: 'attacker', turnPlayerId };
}

export function initialTurnState(battle: Pick<BattleRecord, 'attackerPlayerIds'>): {
  turn: number;
  turnSide: BattleSide;
  turnPlayerId: string;
  stateVersion: number;
} {
  const attackers = battle.attackerPlayerIds ?? [];
  return {
    turn: 1,
    turnSide: 'attacker',
    turnPlayerId: attackers[0] || '',
    stateVersion: 1,
  };
}

export function canPlayOnTurn(battle: BattleRecord, playerId: string): boolean {
  if (battle.status !== 'active') return false;
  if (!battle.turnPlayerId) return false;
  return battle.turnPlayerId === playerId;
}

export function turnEndAtMs(battle: Pick<BattleRecord, 'turnStartAt' | 'turnEndAt' | 'turnDurationMs'>): number {
  if (battle.turnEndAt && battle.turnEndAt > 0) return battle.turnEndAt;
  const start = battle.turnStartAt ?? 0;
  const duration = battle.turnDurationMs && battle.turnDurationMs > 0 ? battle.turnDurationMs : BATTLE_TURN_DURATION_MS;
  return start > 0 ? start + duration : 0;
}

/** Client yalnız serverNow (sinxron saat) ilə countdown göstərir. */
export function viewTurnTimer(
  battle: BattleRecord,
  serverNow: number
): {
  turnStartAt: number;
  turnEndAt: number;
  remainingMs: number;
  expired: boolean;
  ready: boolean;
} {
  const turnStartAt = battle.turnStartAt ?? 0;
  const turnEndAt = turnEndAtMs(battle);
  const ready = serverNow > 0 && turnStartAt > 0 && battle.status === 'active';
  const remainingMs = ready ? Math.max(0, turnEndAt - serverNow) : 0;
  return {
    turnStartAt,
    turnEndAt,
    remainingMs,
    expired: ready && serverNow >= turnEndAt,
    ready,
  };
}

for (const id of BATTLE_LOADOUT_POOL) {
  if (officialCardCooldownMs(id) <= 0) {
    throw new Error(`Kart cooldown tapılmadı: ${id}`);
  }
}
