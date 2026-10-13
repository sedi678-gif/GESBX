import { isBattleEventType, type BattleEventMeta, type BattleEventType } from './battleEventTypes';

const MAX_STRING = 80;
const MAX_ID = 64;
const MAX_CARD_IDS = 13;
const MAX_META_KEYS = 8;

const META_KEYS: Record<BattleEventType, readonly string[]> = {
  battle_created: ['mode', 'maxPlayers'],
  player_joined: ['side', 'role'],
  player_left: ['reason'],
  loadout_locked: ['cardIds', 'slotCount'],
  card_played: ['cardId', 'slotIndex', 'side', 'instanceId', 'requestId', 'usage'],
  energy_changed: ['energy', 'delta', 'reason', 'cardId', 'requestId'],
  card_blocked: ['cardId', 'blockerCardId', 'slotIndex'],
  card_countered: ['cardId', 'counterCardId'],
  click_started: ['target', 'required'],
  click_completed: ['clicks', 'required', 'success', 'requestId'],
  damage_applied: ['amount', 'targetPlayerId', 'targetAllianceId', 'source', 'requestId'],
  score_changed: ['score', 'delta', 'scope', 'requestId', 'cardId'],
  turn_started: ['turn', 'side'],
  turn_timeout: ['turn', 'side'],
  battle_finished: ['winnerAllianceId', 'reason', 'winnerSide', 'attackerScore', 'defenderScore'],
};

function clipString(value: unknown, max = MAX_STRING): string | undefined {
  if (typeof value !== 'string') return undefined;
  const text = value.trim().slice(0, max);
  return text || undefined;
}

function clipId(value: unknown): string | undefined {
  return clipString(value, MAX_ID);
}

function clipInt(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  return Math.trunc(value);
}

function clipBool(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function clipCardIds(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const ids = value
    .map((item) => clipId(item))
    .filter((item): item is string => Boolean(item))
    .slice(0, MAX_CARD_IDS);
  return ids.length ? ids : undefined;
}

export function sanitizePlayerId(playerId: unknown): string {
  const id = clipId(playerId);
  if (!id) throw new Error('Event üçün player ID tələb olunur');
  return id;
}

export function sanitizeBattleId(battleId: unknown): string {
  const id = clipId(battleId);
  if (!id) throw new Error('Event üçün battle ID tələb olunur');
  return id;
}

export function sanitizeBattleEventType(type: unknown): BattleEventType {
  if (typeof type !== 'string' || !isBattleEventType(type)) {
    throw new Error('Naməlum battle event növü');
  }
  return type;
}

export function sanitizeBattleEventMeta<T extends BattleEventType>(
  type: T,
  raw?: BattleEventMeta<T> | Record<string, unknown> | null
): BattleEventMeta<T> {
  const allowed = META_KEYS[type];
  const input = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const out: Record<string, unknown> = {};

  for (const key of allowed) {
    if (Object.keys(out).length >= MAX_META_KEYS) break;
    const value = (input as Record<string, unknown>)[key];
    if (value == null) continue;

    switch (key) {
      case 'cardIds':
        {
          const ids = clipCardIds(value);
          if (ids) out[key] = ids;
        }
        break;
      case 'success':
        {
          const flag = clipBool(value);
          if (flag !== undefined) out[key] = flag;
        }
        break;
      case 'maxPlayers':
      case 'slotCount':
      case 'slotIndex':
      case 'usage':
      case 'energy':
      case 'delta':
      case 'required':
      case 'clicks':
      case 'amount':
      case 'score':
      case 'turn':
      case 'attackerScore':
      case 'defenderScore':
        {
          const num = clipInt(value);
          if (num !== undefined) out[key] = num;
        }
        break;
      case 'scope':
        if (value === 'player' || value === 'alliance') out[key] = value;
        break;
      case 'winnerSide':
        if (value === 'attacker' || value === 'defender') out[key] = value;
        break;
      default:
        {
          const text = clipString(value);
          if (text) out[key] = text;
        }
        break;
    }
  }

  return out as BattleEventMeta<T>;
}

