import { serverTimestamp } from 'firebase/firestore';
import { BATTLE_LOADOUT_POOL, type BattleLoadoutCardId } from '@/app/lib/battleLoadout/battleLoadoutConfig';
import type { BattleRecord, BattleSide } from '@/app/lib/battleEventLog/battleEventTypes';
import { resolveCardEffect, type EffectKind } from '@/app/lib/battleEffects';
import { defaultCardVariant, officialInfoDamage, type CardVariant } from '@/app/lib/battleEffects/infoDamage';

export const BATTLE_SCORE_COLLECTION = 'scores';
export const BATTLE_SCORE_SCHEMA_VERSION = 1;
export const BATTLE_PLAY_EVENT_COUNT = 6;

/** 2^31-1-dən aşağı — wrap/overflow yoxdur. */
export const BATTLE_SCORE_MAX = 1_000_000;
export const BATTLE_SCORE_MIN = 0;
export const BATTLE_DAMAGE_MAX = 500;
export const BATTLE_PLAYER_DELTA_MAX = 10;
export const BATTLE_ALLIANCE_DELTA_MAX = 8;
export const BATTLE_STEAL_MAX = 6;

export type BattleCardEffectKind = EffectKind;

export interface OfficialCardEffect {
  cardId: BattleLoadoutCardId;
  kind: EffectKind;
  damage: number;
  playerDelta: number;
  allianceDelta: number;
  steal: number;
}

function isSafeInt(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && Number.isSafeInteger(value);
}

export function officialCardEffect(cardId: string, variant?: CardVariant | null, memberCount?: unknown): OfficialCardEffect | null {
  const resolved = resolveCardEffect(cardId, variant);
  if (!resolved) return null;
  const chosen = variant === undefined ? defaultCardVariant(cardId) : variant;
  const damage = memberCount === undefined ? resolved.damage : officialInfoDamage(cardId, memberCount, chosen);
  if (!isSafeInt(damage) || damage < 0 || damage > BATTLE_DAMAGE_MAX) return null;
  if (!isSafeInt(resolved.playerDelta) || resolved.playerDelta < 0 || resolved.playerDelta > BATTLE_PLAYER_DELTA_MAX) {
    return null;
  }
  if (
    !isSafeInt(resolved.allianceDelta) ||
    resolved.allianceDelta < 0 ||
    resolved.allianceDelta > BATTLE_ALLIANCE_DELTA_MAX
  ) {
    return null;
  }
  if (!isSafeInt(resolved.steal) || resolved.steal < 0 || resolved.steal > BATTLE_STEAL_MAX) return null;
  return {
    cardId: resolved.cardId,
    kind: resolved.primary,
    damage,
    playerDelta: resolved.playerDelta,
    allianceDelta: resolved.allianceDelta,
    steal: resolved.steal,
  };
}

export const BATTLE_CARD_EFFECTS = Object.fromEntries(
  BATTLE_LOADOUT_POOL.map((id) => [id, officialCardEffect(id)])
) as Record<BattleLoadoutCardId, OfficialCardEffect>;

export function readBoundedScore(value: unknown): number {
  if (!isSafeInt(value)) return 0;
  if (value < BATTLE_SCORE_MIN || value > BATTLE_SCORE_MAX) return 0;
  return value;
}

/** Mükafat: mənfi, float, overflow və limit-dən böyük delta reject. */
export function addOfficialScore(current: number, delta: number, maxDelta: number): number {
  if (!isSafeInt(current) || current < BATTLE_SCORE_MIN || current > BATTLE_SCORE_MAX) {
    throw new Error('Score vəziyyəti yanlışdır');
  }
  if (!isSafeInt(delta) || !isSafeInt(maxDelta)) throw new Error('Score dəyişməsi yanlışdır');
  if (delta < 0) throw new Error('Mənfi score dəyişməsi rədd edildi');
  if (delta > maxDelta) throw new Error('Qeyri-real score dəyişməsi rədd edildi');
  if (delta > BATTLE_SCORE_MAX - current) throw new Error('Score overflow rədd edildi');
  return current + delta;
}

/** Oğurluq: yalnız mövcud xal qədər; nəticə 0-dan aşağı düşə bilməz. */
export function takeOfficialScore(current: number, amount: number, maxAmount: number): { next: number; taken: number } {
  if (!isSafeInt(current) || current < BATTLE_SCORE_MIN || current > BATTLE_SCORE_MAX) {
    throw new Error('Score vəziyyəti yanlışdır');
  }
  if (!isSafeInt(amount) || amount < 0 || amount > maxAmount) {
    throw new Error('Qeyri-real oğurluq rədd edildi');
  }
  const taken = current < amount ? current : amount;
  return { next: current - taken, taken };
}

export function applyOfficialBattleScores(input: {
  side: BattleSide;
  attackerScore: number;
  defenderScore: number;
  playerScore: number;
  effect: OfficialCardEffect;
}) {
  const playerScore = addOfficialScore(input.playerScore, input.effect.playerDelta, BATTLE_PLAYER_DELTA_MAX);
  const ownBefore = input.side === 'attacker' ? input.attackerScore : input.defenderScore;
  const oppBefore = input.side === 'attacker' ? input.defenderScore : input.attackerScore;
  const stolen = takeOfficialScore(oppBefore, input.effect.steal, BATTLE_STEAL_MAX);
  const ownAfter = addOfficialScore(
    ownBefore,
    input.effect.allianceDelta + stolen.taken + input.effect.damage,
    BATTLE_ALLIANCE_DELTA_MAX + BATTLE_STEAL_MAX + BATTLE_DAMAGE_MAX
  );

  const attackerScore = input.side === 'attacker' ? ownAfter : stolen.next;
  const defenderScore = input.side === 'defender' ? ownAfter : stolen.next;

  return {
    damage: input.effect.damage,
    playerDelta: input.effect.playerDelta,
    allianceDelta: input.effect.allianceDelta,
    steal: input.effect.steal,
    taken: stolen.taken,
    playerScore,
    attackerScore,
    defenderScore,
    ownAllianceAfter: ownAfter,
    oppAllianceAfter: stolen.next,
  };
}

export function officialBattleLeader(battle: Pick<BattleRecord, 'attackerScore' | 'defenderScore' | 'attackerAllianceId' | 'defenderAllianceId'>): {
  attackerScore: number;
  defenderScore: number;
  leaderSide: BattleSide | null;
  winnerAllianceId: string | null;
  reason: 'attacker' | 'defender' | 'draw';
} {
  const attackerScore = readBoundedScore(battle.attackerScore);
  const defenderScore = readBoundedScore(battle.defenderScore);
  if (attackerScore > defenderScore) {
    return {
      attackerScore,
      defenderScore,
      leaderSide: 'attacker',
      winnerAllianceId: battle.attackerAllianceId ?? null,
      reason: 'attacker',
    };
  }
  if (defenderScore > attackerScore) {
    return {
      attackerScore,
      defenderScore,
      leaderSide: 'defender',
      winnerAllianceId: battle.defenderAllianceId ?? null,
      reason: 'defender',
    };
  }
  return {
    attackerScore,
    defenderScore,
    leaderSide: null,
    winnerAllianceId: null,
    reason: 'draw',
  };
}

export function initialBattleScoreDoc(battleId: string, playerId: string) {
  return {
    battleId,
    playerId,
    score: 0,
    maxScore: BATTLE_SCORE_MAX,
    lastRequestId: null as string | null,
    schemaVersion: BATTLE_SCORE_SCHEMA_VERSION,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
}

for (const id of BATTLE_LOADOUT_POOL) {
  if (!officialCardEffect(id)) {
    throw new Error(`Kart effekti tapılmadı: ${id}`);
  }
}
