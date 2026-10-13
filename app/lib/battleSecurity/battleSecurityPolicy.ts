import type { BattleRecord, BattleSide, BattleStatus } from '@/app/lib/battleEventLog/battleEventTypes';
import { sanitizeBattleId, sanitizePlayerId } from '@/app/lib/battleEventLog/sanitizeBattleEventMeta';
import { isBattleLoadoutCardId } from '@/app/lib/battleLoadout/battleLoadoutConfig';
import {
  BATTLE_CARD_MAX_USES,
  canPlayOnTurn,
  cardUsageCount,
  officialCardCooldownMs,
  turnEndAtMs,
  viewTurnTimer,
} from '@/app/lib/battlePlay/battlePlayConfig';
import { officialCardEnergyCost, BATTLE_ENERGY_MAX, clampBattleEnergy } from '@/app/lib/battleEnergy/battleEnergyConfig';
import {
  applyOfficialBattleScores,
  officialCardEffect,
  officialBattleLeader,
  readBoundedScore,
  type OfficialCardEffect,
} from '@/app/lib/battleScore/battleScoreConfig';
import { officialFinishWinner } from '@/app/lib/battleFinish/battleFinishConfig';
import { officialRequiredClicks } from '@/app/lib/battleClick/battleClickConfig';
import { replayBattleRequest } from '@/app/lib/battleReconnect/replayBattleRequest';

export type ChallengeView = {
  challengeId: string;
  battleId: string;
  targetAllianceId: string;
  requiredClicks: number;
  currentClicks: number;
  expiresAt: number;
  status: 'active' | 'succeeded' | 'expired';
};

function requireServerNow(serverNow: number): number {
  if (!Number.isFinite(serverNow) || serverNow <= 0) {
    throw new Error('Server saatı yoxdur');
  }
  return serverNow;
}

function requireInt(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${label} tələb olunur`);
  return Math.trunc(value);
}

function sideOf(battle: BattleRecord, playerId: string): BattleSide | null {
  if ((battle.attackerPlayerIds ?? []).includes(playerId)) return 'attacker';
  if ((battle.defenderPlayerIds ?? []).includes(playerId)) return 'defender';
  return null;
}

function uidOwnsPlayerSlot(battle: BattleRecord, playerId: string, uid: string, side: BattleSide): boolean {
  const ids = side === 'attacker' ? battle.attackerPlayerIds ?? [] : battle.defenderPlayerIds ?? [];
  const uids = side === 'attacker' ? battle.attackerUids ?? [] : battle.defenderUids ?? [];
  const index = ids.indexOf(playerId);
  return index >= 0 && uids[index] === uid;
}

export function officialPlayCardId(cardId: unknown): string {
  if (typeof cardId !== 'string' || !isBattleLoadoutCardId(cardId.trim())) {
    throw new Error('Bu kart battle hovuzunda yoxdur');
  }
  return cardId.trim();
}

export function assertBattleParticipant(battle: BattleRecord, playerId: string) {
  if (!(battle.participantIds ?? []).includes(playerId)) {
    throw new Error('Bu döyüşdə deyilsən');
  }
}

export function assertBattleActive(battle: Pick<BattleRecord, 'status'>, action: 'play' | 'click' | 'timeout') {
  if (battle.status !== 'active') {
    throw new Error(action === 'click' ? 'Challenge bitib' : 'Battle aktiv deyil');
  }
}

export function assertOwnedBattleId(inputBattleId: unknown, battle: Pick<BattleRecord, 'id'>) {
  const battleId = sanitizeBattleId(inputBattleId);
  if (battleId !== battle.id) throw new Error('Battle ID uyğun gəlmir');
  return battleId;
}

export function assertServerClockNotClient(serverNow: number, clientNow: number) {
  requireServerNow(serverNow);
  if (clientNow !== serverNow) {
    /* client clock ignored — serverNow wins */
  }
  return serverNow;
}

/** Kart oynama hücumlarını rədd edir. Client energy/score/damage/winner qəbul edilmir. */
export function assertPlayCardAllowed(input: {
  battle: BattleRecord;
  playerId: unknown;
  uid: string;
  cardId: unknown;
  expectedStateVersion: unknown;
  expectedEventSeq: unknown;
  handIds: string[];
  energy: unknown;
  cardUsage: Record<string, number>;
  cooldownUntil: Record<string, number>;
  serverNow: number;
  claimedEnergy?: unknown;
  claimedDamage?: unknown;
  claimedScore?: unknown;
  claimedWinner?: unknown;
  receiptExists?: boolean;
}): {
  cardId: string;
  cost: number;
  effect: OfficialCardEffect;
  energyAfter: number;
  usageAfter: number;
  duplicate: boolean;
} {
  if (input.receiptExists) {
    return {
      cardId: typeof input.cardId === 'string' ? input.cardId : '',
      cost: 0,
      effect: officialCardEffect('qaya') as OfficialCardEffect,
      energyAfter: clampBattleEnergy(Number(input.energy)),
      usageAfter: 0,
      duplicate: true,
    };
  }

  const playerId = sanitizePlayerId(input.playerId);
  assertOwnedBattleId(input.battle.id, input.battle);
  const cardId = officialPlayCardId(input.cardId);
  const now = requireServerNow(input.serverNow);
  assertBattleActive(input.battle, 'play');
  assertBattleParticipant(input.battle, playerId);
  if (!canPlayOnTurn(input.battle, playerId)) throw new Error('İndi sənin növbən deyil');

  const timer = viewTurnTimer(input.battle, now);
  if (timer.expired) throw new Error('Növbə vaxtı bitib');

  const side = sideOf(input.battle, playerId);
  if (!side) throw new Error('Bu döyüşə qoşulmamısan');
  if (input.battle.kind === 'alliance_map' && !uidOwnsPlayerSlot(input.battle, playerId, input.uid, side)) {
    throw new Error('Bu hesabın loadout-u deyil');
  }

  if ((input.battle.stateVersion ?? 0) !== requireInt(input.expectedStateVersion, 'Battle state version')) {
    throw new Error('Battle state dəyişib');
  }
  if (input.battle.eventSeq !== requireInt(input.expectedEventSeq, 'Battle event seq')) {
    throw new Error('Battle state dəyişib');
  }

  if (!input.handIds.includes(cardId)) throw new Error('Bu kart seçilmiş 5-likdə yoxdur');

  const cost = officialCardEnergyCost(cardId);
  if (cost <= 0) throw new Error('Kart energy cost tapılmadı');
  if (officialCardCooldownMs(cardId) <= 0) throw new Error('Kart cooldown tapılmadı');

  const energy = clampBattleEnergy(Number(input.energy));
  if (input.claimedEnergy != null && Number(input.claimedEnergy) !== energy) {
    throw new Error('Saxta energy rədd edildi');
  }
  const used = cardUsageCount(input.cardUsage, cardId);
  if (used >= BATTLE_CARD_MAX_USES) throw new Error('Kart 3 istifadəyə çatıb');
  if (energy < cost) throw new Error('Kifayət qədər energy yoxdur');
  if (energy > BATTLE_ENERGY_MAX) throw new Error('Energy limiti aşıldı');

  const readyAt = input.cooldownUntil[cardId] ?? 0;
  if (readyAt > now) throw new Error('Kart cooldown-dadır');

  const energyAfter = energy - cost;
  if (energyAfter < 0 || energyAfter > BATTLE_ENERGY_MAX) throw new Error('Energy mənfi ola bilməz');

  const effect = officialCardEffect(cardId);
  if (!effect) throw new Error('Kart effekti tapılmadı');
  if (input.claimedDamage != null && Number(input.claimedDamage) !== effect.damage) {
    throw new Error('Saxta damage rədd edildi');
  }
  if (input.claimedScore != null && Number(input.claimedScore) !== effect.playerDelta) {
    throw new Error('Saxta score rədd edildi');
  }
  if (input.claimedWinner != null) {
    throw new Error('Saxta winner rədd edildi');
  }

  return {
    cardId,
    cost,
    effect,
    energyAfter,
    usageAfter: used + 1,
    duplicate: false,
  };
}

export function applyOfficialPlayScores(input: {
  battle: BattleRecord;
  playerId: string;
  effect: OfficialCardEffect;
  playerScore: unknown;
}) {
  const side = sideOf(input.battle, input.playerId);
  if (!side) throw new Error('Bu döyüşə qoşulmamısan');
  return applyOfficialBattleScores({
    side,
    attackerScore: readBoundedScore(input.battle.attackerScore),
    defenderScore: readBoundedScore(input.battle.defenderScore),
    playerScore: readBoundedScore(input.playerScore),
    effect: input.effect,
  });
}

export function assertTurnTimeoutAllowed(input: {
  battle: BattleRecord;
  playerId: unknown;
  expectedStateVersion: unknown;
  serverNow: number;
}) {
  const playerId = sanitizePlayerId(input.playerId);
  const now = requireServerNow(input.serverNow);
  assertBattleActive(input.battle, 'timeout');
  assertBattleParticipant(input.battle, playerId);
  if ((input.battle.stateVersion ?? 0) !== requireInt(input.expectedStateVersion, 'Battle state version')) {
    throw new Error('Battle state dəyişib');
  }
  const endAt = turnEndAtMs(input.battle);
  if (endAt <= 0 || now < endAt) throw new Error('Növbə hələ bitməyib');
}

export function assertChallengeClickAllowed(input: {
  battle: Pick<BattleRecord, 'id' | 'status'>;
  challenge: ChallengeView;
  playerId: unknown;
  playerAllianceId: string;
  allianceMemberIds: string[];
  allianceLeaderId: string;
  clickAlreadyExists: boolean;
  serverNow: number;
}) {
  const playerId = sanitizePlayerId(input.playerId);
  const now = requireServerNow(input.serverNow);
  if (input.challenge.battleId && input.challenge.battleId !== input.battle.id) {
    throw new Error('Battle ID uyğun gəlmir');
  }
  if (input.clickAlreadyExists) return { duplicate: true as const };
  if (input.challenge.status !== 'active') throw new Error('Challenge bitib');
  if (input.battle.status === 'finished') throw new Error('Battle aktiv deyil');
  if (input.challenge.expiresAt > 0 && now >= input.challenge.expiresAt) {
    throw new Error('Challenge bitib');
  }
  if (!input.playerAllianceId || input.playerAllianceId !== input.challenge.targetAllianceId) {
    throw new Error('Yalnız hədəf ittifaq klik edə bilər');
  }
  if (!input.allianceMemberIds.includes(playerId) && input.allianceLeaderId !== playerId) {
    throw new Error('İttifaq üzvü deyilsən');
  }
  if (input.challenge.currentClicks >= input.challenge.requiredClicks) {
    throw new Error('Challenge artıq bitib');
  }
  return { duplicate: false as const };
}

export function officialWinnerFromScores(battle: Pick<BattleRecord, 'attackerScore' | 'defenderScore' | 'attackerAllianceId' | 'defenderAllianceId'>) {
  return officialFinishWinner({
    attackerScore: readBoundedScore(battle.attackerScore),
    defenderScore: readBoundedScore(battle.defenderScore),
    attackerAllianceId: battle.attackerAllianceId,
    defenderAllianceId: battle.defenderAllianceId,
  });
}

export function assertFinishWinnerNotFromClient(input: {
  battle: Pick<BattleRecord, 'attackerScore' | 'defenderScore' | 'attackerAllianceId' | 'defenderAllianceId'>;
  claimedWinnerSide?: unknown;
  claimedWinnerAllianceId?: unknown;
  claimedWinnerPlayerId?: unknown;
}) {
  const official = officialWinnerFromScores(input.battle);
  if (input.claimedWinnerPlayerId != null) {
    throw new Error('Saxta winner rədd edildi');
  }
  if (input.claimedWinnerSide != null && input.claimedWinnerSide !== official.winnerSide) {
    throw new Error('Saxta winner rədd edildi');
  }
  if (
    input.claimedWinnerAllianceId != null &&
    input.claimedWinnerAllianceId !== official.winnerAllianceId
  ) {
    throw new Error('Saxta winner rədd edildi');
  }
  return official;
}

export function assertRewardOnce(receiptExists: boolean) {
  if (receiptExists) return { duplicate: true as const, apply: false };
  return { duplicate: false as const, apply: true };
}

/** Player/alliance xalı yalnız bitmiş battle-ın rəsmi deltasından. */
export function assertScoreFromOfficialResult(input: {
  lastScoreBattleId: unknown;
  previousBattleId?: unknown;
  claimedDelta: unknown;
  officialDelta: number;
  maxDelta: number;
}) {
  const battleId = sanitizeBattleId(input.lastScoreBattleId);
  if (input.previousBattleId && sanitizeBattleId(input.previousBattleId) === battleId) {
    throw new Error('Təkrar score rədd edildi');
  }
  if (!Number.isInteger(input.officialDelta) || input.officialDelta < 0 || input.officialDelta > input.maxDelta) {
    throw new Error('Score dəyişməsi yanlışdır');
  }
  if (input.claimedDelta !== input.officialDelta) {
    throw new Error('Saxta score rədd edildi');
  }
  return { battleId, delta: input.officialDelta };
}

export function assertReconnectSnapshot(input: {
  hintedBattleId: unknown;
  liveBattle: BattleRecord | null;
  playerId: unknown;
  claimedEnergy?: unknown;
  claimedScore?: unknown;
  claimedTimerEnd?: unknown;
}) {
  const playerId = sanitizePlayerId(input.playerId);
  if (!input.liveBattle) throw new Error('Canlı battle tapılmadı');
  const live = input.liveBattle;
  const hinted = typeof input.hintedBattleId === 'string' && input.hintedBattleId.trim()
    ? sanitizeBattleId(input.hintedBattleId)
    : live.id;
  if (hinted !== live.id) throw new Error('Battle ID uyğun gəlmir');
  const liveStatus: BattleStatus[] = ['joining', 'locked', 'active'];
  if (!liveStatus.includes(live.status)) throw new Error('Battle aktiv deyil');
  assertBattleParticipant(live, playerId);
  const lead = officialBattleLeader(live);
  return {
    battleId: live.id,
    energy: null as number | null,
    attackerScore: lead.attackerScore,
    defenderScore: lead.defenderScore,
    ignoredClientEnergy: input.claimedEnergy,
    ignoredClientScore: input.claimedScore,
    ignoredClientTimer: input.claimedTimerEnd,
  };
}

export function officialClickNeed(cardId: string, members: unknown): number {
  return officialRequiredClicks(cardId, members);
}

export function inFlightReplay<T>(key: string, run: () => Promise<T>): Promise<T> {
  return replayBattleRequest(key, run);
}

export function fixtureBattle(overrides: Partial<BattleRecord> = {}): BattleRecord {
  return {
    id: 'bat_audit_1',
    createdBy: 'p1',
    createdAt: 1,
    updatedAt: 1,
    status: 'active',
    eventSeq: 4,
    participantIds: ['p1', 'p2'],
    schemaVersion: 1,
    kind: 'alliance_map',
    attackerAllianceId: 'a1',
    defenderAllianceId: 'a2',
    attackerPlayerIds: ['p1'],
    defenderPlayerIds: ['p2'],
    attackerUids: ['u1'],
    defenderUids: ['u2'],
    turn: 1,
    turnSide: 'attacker',
    turnPlayerId: 'p1',
    stateVersion: 2,
    turnStartAt: 1_000_000,
    turnDurationMs: 15_000,
    attackerScore: 0,
    defenderScore: 0,
    ...overrides,
  };
}
