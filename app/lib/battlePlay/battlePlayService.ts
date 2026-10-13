import { doc, runTransaction, serverTimestamp } from 'firebase/firestore';
import { db } from '@/firebase';
import { requireFirebaseAuth } from '@/app/lib/firebaseAuth';
import { battleEventWrite, battleFromData, battleRef, newBattleEventRef } from '@/app/lib/battleEventLog/battleEventLog';
import type { BattleRecord, BattleSide } from '@/app/lib/battleEventLog/battleEventTypes';
import { sanitizeBattleId, sanitizePlayerId } from '@/app/lib/battleEventLog/sanitizeBattleEventMeta';
import { BATTLE_LOADOUT_COLLECTION, isBattleLoadoutCardId } from '@/app/lib/battleLoadout/battleLoadoutConfig';
import {
  BATTLE_CARD_COSTS_COLLECTION,
  BATTLE_ENERGY_COLLECTION,
  BATTLE_ENERGY_MAX,
  BATTLE_ENERGY_REQUESTS_COLLECTION,
  clampBattleEnergy,
  makeEnergyRequestId,
  officialCardEnergyCost,
  sanitizeEnergyRequestId,
} from '@/app/lib/battleEnergy/battleEnergyConfig';
import {
  BATTLE_CARD_MAX_USES,
  BATTLE_TURN_DURATION_MS,
  canPlayOnTurn,
  cardUsageCount,
  nextTurnState,
  officialCardCooldownMs,
  readCardUsage,
  readCooldownUntil,
  viewTurnTimer,
} from './battlePlayConfig';
import { serverNowMs, syncServerClock } from './battleServerClock';
import { assertTurnTimeoutAllowed } from '@/app/lib/battleSecurity/battleSecurityPolicy';
import {
  BATTLE_PLAY_EVENT_COUNT,
  BATTLE_SCORE_MAX,
  applyOfficialBattleScores,
  initialBattleScoreDoc,
  officialCardEffect,
  readBoundedScore,
} from '@/app/lib/battleScore/battleScoreConfig';
import { battleScoreRef } from '@/app/lib/battleScore/battleScoreService';
import { resolveCardEffect } from '@/app/lib/battleEffects';
import { normalizeCardVariant } from '@/app/lib/battleEffects/infoDamage';
import {
  cardClickScale,
  initialChallengeDoc,
  officialClickTarget,
  officialRequiredClicks,
} from '@/app/lib/battleClick';
import { replayBattleRequest } from '@/app/lib/battleReconnect/replayBattleRequest';
import { finishBattle } from '@/app/lib/battleFinish/battleFinishService';
import { finishReasonFromScores } from '@/app/lib/battleFinish/battleFinishConfig';
import {
  isDefenseOffline,
  officialDefenseAiPick,
} from '@/app/lib/battleDefense/battleDefenseConfig';
import {
  battlePresenceRef,
  defenseSnapshotRef,
} from '@/app/lib/battleDefense/battleDefenseService';
import { timestampToMs } from '@/app/lib/battleEventLog/battleEventLog';

export type PlayBattleMode = 'player' | 'defense_ai';

export interface PlayBattleCardInput {
  battleId: string;
  playerId: string;
  cardId: unknown;
  requestId?: unknown;
  expectedStateVersion: unknown;
  expectedEventSeq: unknown;
  slotIndex?: unknown;
  mode?: PlayBattleMode;
  variant?: unknown;
}

export interface PlayBattleCardResult {
  accepted: true;
  duplicate: boolean;
  cardId: string;
  cost: number;
  energyBefore: number;
  energyAfter: number;
  usage: number;
  usageMax: number;
  cooldownUntil: number;
  requestId: string;
  eventSeq: number;
  stateVersion: number;
  turn: number;
  turnSide: BattleSide;
  turnPlayerId: string;
  damage: number;
  playerDelta: number;
  allianceDelta: number;
  steal: number;
  playerScore: number;
  attackerScore: number;
  defenderScore: number;
  effects: string[];
  clickRequired: number;
}

const WRITE_MS = 12_000;
const playLocks = new Set<string>();

function battleEnergyRef(battleId: string, playerId: string) {
  return doc(db, 'battles', battleId, BATTLE_ENERGY_COLLECTION, playerId);
}

function energyRequestRef(battleId: string, requestId: string) {
  return doc(db, 'battles', battleId, BATTLE_ENERGY_REQUESTS_COLLECTION, requestId);
}

function cardCostRef(cardId: string) {
  return doc(db, BATTLE_CARD_COSTS_COLLECTION, cardId);
}

function loadoutRef(battleId: string, playerId: string) {
  return doc(db, 'battles', battleId, BATTLE_LOADOUT_COLLECTION, playerId);
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
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

function readCostFromDatabase(raw: Record<string, unknown> | undefined, cardId: string): number {
  const catalog = officialCardEnergyCost(cardId);
  if (catalog <= 0) return 0;
  if (!raw) return catalog;
  const stored = Math.trunc(Number(raw.energyCost));
  if (!Number.isInteger(stored) || stored <= 0) throw new Error('Kart energy cost database-də yanlışdır');
  if (stored !== catalog) throw new Error('Kart energy cost database ilə uyğun gəlmir');
  return stored;
}

function requireInt(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${label} tələb olunur`);
  return Math.trunc(value);
}

function resultFromReceipt(requestId: string, prev: Record<string, unknown>): PlayBattleCardResult {
  return {
    accepted: true,
    duplicate: true,
    cardId: String(prev.cardId ?? ''),
    cost: Number(prev.cost) || 0,
    energyBefore: Number(prev.energyBefore) || 0,
    energyAfter: Number(prev.energyAfter) || 0,
    usage: Number(prev.usageAfter) || 0,
    usageMax: BATTLE_CARD_MAX_USES,
    cooldownUntil: typeof prev.cooldownUntil === 'number' ? prev.cooldownUntil : 0,
    requestId,
    eventSeq: Number(prev.eventSeq) || 0,
    stateVersion: Number(prev.stateVersion) || 0,
    turn: Number(prev.turn) || 0,
    turnSide: prev.turnSide === 'defender' ? 'defender' : 'attacker',
    turnPlayerId: String(prev.turnPlayerId ?? ''),
    damage: Number(prev.damage) || 0,
    playerDelta: Number(prev.playerDelta) || 0,
    allianceDelta: Number(prev.allianceDelta) || 0,
    steal: Number(prev.steal) || 0,
    playerScore: Number(prev.playerScoreAfter) || 0,
    attackerScore: Number(prev.attackerScoreAfter) || 0,
    defenderScore: Number(prev.defenderScoreAfter) || 0,
    effects: Array.isArray(prev.effectKinds) ? prev.effectKinds.map(String) : [],
    clickRequired: Number(prev.clickRequired) || 0,
  };
}

export async function playOfflineDefenseTurn(input: {
  battleId: string;
  actorId: string;
  expectedStateVersion: unknown;
  expectedEventSeq: unknown;
}): Promise<PlayBattleCardResult | { skipped: true; reason: string }> {
  try {
    return await playBattleCard({
      battleId: input.battleId,
      playerId: input.actorId,
      cardId: '',
      expectedStateVersion: input.expectedStateVersion,
      expectedEventSeq: input.expectedEventSeq,
      mode: 'defense_ai',
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (
      /online-dır|Müdafiə loadout yoxdur|Oynana bilən|müdafiə növbəsində|AI növbəsini|növbən deyil|Battle aktiv deyil|state dəyişib|Loadout tapılmadı|Energy tapılmadı/i.test(
        msg
      )
    ) {
      return { skipped: true, reason: msg };
    }
    throw err;
  }
}

export async function playBattleCard(input: PlayBattleCardInput): Promise<PlayBattleCardResult> {
  const user = await requireFirebaseAuth();
  const aiMode = input.mode === 'defense_ai';
  let playerId = sanitizePlayerId(input.playerId);
  const battleId = sanitizeBattleId(input.battleId);
  if (!aiMode && (typeof input.cardId !== 'string' || !isBattleLoadoutCardId(input.cardId.trim()))) {
    throw new Error('Bu kart battle hovuzunda yoxdur');
  }
  let cardId = typeof input.cardId === 'string' ? input.cardId.trim() : '';
  const requestId =
    input.requestId == null ? makeEnergyRequestId() : sanitizeEnergyRequestId(input.requestId);
  const expectedStateVersion = requireInt(input.expectedStateVersion, 'Battle state version');
  const expectedEventSeq = requireInt(input.expectedEventSeq, 'Battle event seq');
  const slotIndex =
    typeof input.slotIndex === 'number' && Number.isFinite(input.slotIndex)
      ? Math.trunc(input.slotIndex)
      : undefined;

  await syncServerClock().catch(() => {});
  const now = serverNowMs();
  if (now <= 0) throw new Error('Server saatı yoxdur');

  const flightKey = `play:${battleId}:${requestId}`;
  const playerLock = aiMode ? `${battleId}:defense_ai` : `${battleId}:${playerId}`;

  return replayBattleRequest(flightKey, async () => {
    if (playLocks.has(playerLock)) throw new Error('Kart artıq oynanılır');
    playLocks.add(playerLock);

    try {
      const played = await withTimeout(
    runTransaction(db, async (tx) => {
      const parentRef = battleRef(battleId);
      const receiptRef = energyRequestRef(battleId, requestId);
      const parentSnap = await tx.get(parentRef);
      const receiptSnap = await tx.get(receiptRef);

      if (receiptSnap.exists()) {
        return resultFromReceipt(requestId, receiptSnap.data() as Record<string, unknown>);
      }

      if (!parentSnap.exists()) throw new Error('Battle tapılmadı');
      const battle = battleFromData(parentSnap.id, parentSnap.data());
      if (battle.status !== 'active') throw new Error('Battle aktiv deyil');

      if (aiMode) {
        const turnId = sanitizePlayerId(battle.turnPlayerId || '');
        if (!turnId) throw new Error('Növbə təyin olunmayıb');
        if (sideOf(battle, turnId) !== 'defender') throw new Error('AI yalnız müdafiə növbəsində oynayır');
        const callerOk =
          (battle.attackerUids ?? []).includes(user.uid) || (battle.defenderUids ?? []).includes(user.uid);
        if (!callerOk) throw new Error('Yalnız iştirakçı AI növbəsini irəli apara bilər');
        playerId = turnId;
      }

      const energyRef = battleEnergyRef(battleId, playerId);
      const scoreRef = battleScoreRef(battleId, playerId);
      const handRef = loadoutRef(battleId, playerId);
      const energySnap = await tx.get(energyRef);
      const scoreSnap = await tx.get(scoreRef);
      const handSnap = await tx.get(handRef);

      if (!(battle.participantIds ?? []).includes(playerId)) throw new Error('Bu döyüşdə deyilsən');
      if (!canPlayOnTurn(battle, playerId)) throw new Error('İndi sənin növbən deyil');
      if (viewTurnTimer(battle, now).expired) throw new Error('Növbə vaxtı bitib');

      const side = sideOf(battle, playerId);
      if (!side) throw new Error('Bu döyüşə qoşulmamısan');
      if (!aiMode && battle.kind === 'alliance_map' && !uidOwnsPlayerSlot(battle, playerId, user.uid, side)) {
        throw new Error('Bu hesabın loadout-u deyil');
      }

      if ((battle.stateVersion ?? 0) !== expectedStateVersion) {
        throw new Error('Battle state dəyişib');
      }
      if (battle.eventSeq !== expectedEventSeq) {
        throw new Error('Battle state dəyişib');
      }

      let handIds: string[] = [];
      if (aiMode) {
        const presenceSnap = await tx.get(battlePresenceRef(battleId, playerId));
        const lastSeen = presenceSnap.exists()
          ? timestampToMs((presenceSnap.data() as { lastSeen?: unknown }).lastSeen)
          : 0;
        if (!isDefenseOffline(lastSeen || null, now)) {
          throw new Error('Müdafiəçi online-dır — AI oynamır');
        }
        const snapSnap = await tx.get(defenseSnapshotRef(battleId, playerId));
        if (!snapSnap.exists()) throw new Error('Müdafiə loadout yoxdur');
        handIds = Array.isArray(snapSnap.data()?.cardIds)
          ? (snapSnap.data()?.cardIds as unknown[]).map(String)
          : [];
        if (handIds.length < 1) throw new Error('Müdafiə loadout yoxdur');
        if (!energySnap.exists()) throw new Error('Energy tapılmadı');
        const energyData = energySnap.data() as Record<string, unknown>;
        const pick = officialDefenseAiPick({
          cardIds: handIds,
          energy: clampBattleEnergy(Number(energyData.energy)),
          cardUsage: readCardUsage(energyData.cardUsage, energyData.usedCardIds),
          cooldownUntil: readCooldownUntil(energyData.cardCooldownUntil),
          serverNow: now,
        });
        if (!pick) throw new Error('Oynana bilən müdafiə kartı yoxdur');
        cardId = pick;
      } else {
        if (!handSnap.exists()) throw new Error('Loadout tapılmadı');
        handIds = Array.isArray(handSnap.data()?.cardIds)
          ? (handSnap.data()?.cardIds as unknown[]).map(String)
          : [];
        if (!handIds.includes(cardId)) throw new Error('Bu kart seçilmiş 5-likdə yoxdur');
      }

      const costRef = cardCostRef(cardId);
      const costSnap = await tx.get(costRef);

      const cost = readCostFromDatabase(
        costSnap.exists() ? (costSnap.data() as Record<string, unknown>) : undefined,
        cardId
      );
      if (cost <= 0) throw new Error('Kart energy cost tapılmadı');

      const cooldownMs = officialCardCooldownMs(cardId);
      if (cooldownMs <= 0) throw new Error('Kart cooldown tapılmadı');

      if (!energySnap.exists()) throw new Error('Energy tapılmadı');
      const energyData = energySnap.data() as Record<string, unknown>;
      const energy = clampBattleEnergy(Number(energyData.energy));
      const usage = readCardUsage(energyData.cardUsage, energyData.usedCardIds);
      const cooldowns = readCooldownUntil(energyData.cardCooldownUntil);
      const used = cardUsageCount(usage, cardId);
      if (used >= BATTLE_CARD_MAX_USES) throw new Error('Kart 3 istifadəyə çatıb');
      if (energy < cost) throw new Error('Kifayət qədər energy yoxdur');

      const readyAt = cooldowns[cardId] ?? 0;
      if (readyAt > now) throw new Error('Kart cooldown-dadır');

      const energyAfter = energy - cost;
      if (energyAfter < 0 || energyAfter > BATTLE_ENERGY_MAX) throw new Error('Energy mənfi ola bilməz');

      const variant = normalizeCardVariant(cardId, aiMode ? undefined : input.variant);
      const ownAllianceId = side === 'attacker' ? battle.attackerAllianceId : battle.defenderAllianceId;
      const oppAllianceId = side === 'attacker' ? battle.defenderAllianceId : battle.attackerAllianceId;
      const targetAllianceId =
        officialClickTarget(cardId) === 'own' ? ownAllianceId || '' : oppAllianceId || '';
      const needsChallenge = cardClickScale(cardId) > 0 && Boolean(targetAllianceId);
      const allianceSnap =
        needsChallenge && targetAllianceId ? await tx.get(doc(db, 'alliances', targetAllianceId)) : null;
      const resolved = resolveCardEffect(cardId, variant);
      const effect = officialCardEffect(cardId, variant, allianceSnap?.data()?.members);
      if (!resolved || !effect) throw new Error('Kart effekti tapılmadı');

      const applied = applyOfficialBattleScores({
        side,
        attackerScore: readBoundedScore(battle.attackerScore),
        defenderScore: readBoundedScore(battle.defenderScore),
        playerScore: scoreSnap.exists() ? readBoundedScore(scoreSnap.data()?.score) : 0,
        effect,
      });

      const usageAfter = used + 1;
      const cooldownUntil = now + cooldownMs;
      const nextTurn = nextTurnState(battle, side);
      const seq1 = battle.eventSeq + 1;
      const seq2 = battle.eventSeq + 2;
      const seq3 = battle.eventSeq + 3;
      const seq4 = battle.eventSeq + 4;
      const seq5 = battle.eventSeq + 5;
      const seq6 = battle.eventSeq + BATTLE_PLAY_EVENT_COUNT;
      const stateVersion = (battle.stateVersion ?? 0) + 1;
      const playEvent = newBattleEventRef(battleId);
      const energyEvent = newBattleEventRef(battleId);
      const damageEvent = newBattleEventRef(battleId);
      const playerScoreEvent = newBattleEventRef(battleId);
      const ownScoreEvent = newBattleEventRef(battleId);
      const oppScoreEvent = newBattleEventRef(battleId);
      const requiredClicks = needsChallenge
        ? officialRequiredClicks(cardId, allianceSnap?.data()?.members)
        : 0;

      if (!costSnap.exists()) {
        tx.set(costRef, {
          cardId,
          energyCost: cost,
          cooldownMs,
          schemaVersion: 1,
          updatedAt: serverTimestamp(),
        });
      }

      tx.set(receiptRef, {
        requestId,
        battleId,
        playerId,
        cardId,
        side,
        cost,
        energyBefore: energy,
        energyAfter,
        usageAfter,
        cooldownUntil,
        eventSeq: seq6,
        stateVersion,
        turn: nextTurn.turn,
        turnSide: nextTurn.turnSide,
        turnPlayerId: nextTurn.turnPlayerId,
        damage: applied.damage,
        playerDelta: applied.playerDelta,
        allianceDelta: applied.allianceDelta,
        steal: applied.steal,
        taken: applied.taken,
        playerScoreAfter: applied.playerScore,
        attackerScoreAfter: applied.attackerScore,
        defenderScoreAfter: applied.defenderScore,
        ownAllianceAfter: applied.ownAllianceAfter,
        oppAllianceAfter: applied.oppAllianceAfter,
        effectKinds: resolved.kinds,
        clickRequired: requiredClicks,
        targetAllianceId: targetAllianceId || null,
        challengeId: requiredClicks > 0 ? requestId : null,
        schemaVersion: 1,
        createdAt: serverTimestamp(),
      });

      if (requiredClicks > 0) {
        tx.set(
          doc(db, 'battles', battleId, 'challenges', requestId),
          initialChallengeDoc({
            challengeId: requestId,
            battleId,
            cardId,
            requestId,
            targetAllianceId,
            requiredClicks,
            createdBy: playerId,
          })
        );
      }

      tx.update(energyRef, {
        energy: energyAfter,
        maxEnergy: BATTLE_ENERGY_MAX,
        cardUsage: { ...usage, [cardId]: usageAfter },
        cardCooldownUntil: { ...cooldowns, [cardId]: cooldownUntil },
        lastRequestId: requestId,
        updatedAt: serverTimestamp(),
      });

      if (scoreSnap.exists()) {
        tx.update(scoreRef, {
          score: applied.playerScore,
          maxScore: BATTLE_SCORE_MAX,
          lastRequestId: requestId,
          updatedAt: serverTimestamp(),
        });
      } else {
        tx.set(scoreRef, {
          ...initialBattleScoreDoc(battleId, playerId),
          score: applied.playerScore,
          lastRequestId: requestId,
        });
      }

      tx.update(parentRef, {
        eventSeq: seq6,
        updatedAt: serverTimestamp(),
        status: 'active',
        turn: nextTurn.turn,
        turnSide: nextTurn.turnSide,
        turnPlayerId: nextTurn.turnPlayerId,
        stateVersion,
        turnStartAt: serverTimestamp(),
        turnDurationMs: BATTLE_TURN_DURATION_MS,
        attackerScore: applied.attackerScore,
        defenderScore: applied.defenderScore,
        scoreVersion: (battle.scoreVersion ?? 0) + 1,
        lastScoreRequestId: requestId,
      });

      tx.set(
        playEvent,
        battleEventWrite({
          eventId: playEvent.id,
          battleId,
          playerId,
          type: 'card_played',
          seq: seq1,
          meta: {
            cardId,
            side,
            requestId,
            usage: usageAfter,
            ...(slotIndex !== undefined ? { slotIndex } : {}),
          },
        })
      );

      tx.set(
        energyEvent,
        battleEventWrite({
          eventId: energyEvent.id,
          battleId,
          playerId,
          type: 'energy_changed',
          seq: seq2,
          meta: {
            energy: energyAfter,
            delta: -cost,
            reason: 'card_played',
            cardId,
            requestId,
          },
        })
      );

      tx.set(
        damageEvent,
        battleEventWrite({
          eventId: damageEvent.id,
          battleId,
          playerId,
          type: 'damage_applied',
          seq: seq3,
          meta: {
            amount: applied.damage,
            source: cardId,
            requestId,
            ...(oppAllianceId ? { targetAllianceId: oppAllianceId } : {}),
          },
        })
      );

      tx.set(
        playerScoreEvent,
        battleEventWrite({
          eventId: playerScoreEvent.id,
          battleId,
          playerId,
          type: 'score_changed',
          seq: seq4,
          meta: {
            score: applied.playerScore,
            delta: applied.playerDelta,
            scope: 'player',
            requestId,
            cardId,
          },
        })
      );

      tx.set(
        ownScoreEvent,
        battleEventWrite({
          eventId: ownScoreEvent.id,
          battleId,
          playerId,
          type: 'score_changed',
          seq: seq5,
          meta: {
            score: applied.ownAllianceAfter,
            delta: applied.allianceDelta + applied.taken,
            scope: 'alliance',
            requestId,
            cardId,
          },
        })
      );

      tx.set(
        oppScoreEvent,
        battleEventWrite({
          eventId: oppScoreEvent.id,
          battleId,
          playerId,
          type: 'score_changed',
          seq: seq6,
          meta: {
            score: applied.oppAllianceAfter,
            delta: -applied.taken,
            scope: 'alliance',
            requestId,
            cardId,
          },
        })
      );

      return {
        accepted: true as const,
        duplicate: false,
        cardId,
        cost,
        energyBefore: energy,
        energyAfter,
        usage: usageAfter,
        usageMax: BATTLE_CARD_MAX_USES,
        cooldownUntil,
        requestId,
        eventSeq: seq6,
        stateVersion,
        turn: nextTurn.turn,
        turnSide: nextTurn.turnSide,
        turnPlayerId: nextTurn.turnPlayerId,
        damage: applied.damage,
        playerDelta: applied.playerDelta,
        allianceDelta: applied.allianceDelta,
        steal: applied.taken,
        playerScore: applied.playerScore,
        attackerScore: applied.attackerScore,
        defenderScore: applied.defenderScore,
        effects: resolved.kinds,
        clickRequired: requiredClicks,
      };
    }),
    WRITE_MS,
    'Kart oynanılmadı.'
      );
      if (finishReasonFromScores(played.turn, played.attackerScore, played.defenderScore)) {
        await finishBattle({ battleId, playerId }).catch(() => {});
      }
      return played;
    } finally {
      playLocks.delete(playerLock);
    }
  });
}

export async function timeoutBattleTurn(input: {
  battleId: string;
  playerId: string;
  expectedStateVersion: unknown;
}): Promise<BattleRecord> {
  await requireFirebaseAuth();
  const playerId = sanitizePlayerId(input.playerId);
  const battleId = sanitizeBattleId(input.battleId);
  const expectedStateVersion = requireInt(input.expectedStateVersion, 'Battle state version');

  await syncServerClock().catch(() => {});
  const now = serverNowMs();
  if (now <= 0) throw new Error('Server saatı yoxdur');

  const lockKey = `timeout:${battleId}:${expectedStateVersion}`;
  return replayBattleRequest(lockKey, async () => {
    const battle = await withTimeout(
      runTransaction(db, async (tx) => {
        const parentRef = battleRef(battleId);
        const parentSnap = await tx.get(parentRef);
        if (!parentSnap.exists()) throw new Error('Battle tapılmadı');
        const battle = battleFromData(parentSnap.id, parentSnap.data());

        if (battle.status !== 'active') throw new Error('Battle aktiv deyil');
        if ((battle.stateVersion ?? 0) !== expectedStateVersion) {
          return battle;
        }
        assertTurnTimeoutAllowed({
          battle,
          playerId,
          expectedStateVersion,
          serverNow: now,
        });

        const timedSide = battle.turnSide ?? 'attacker';
        const nextTurn = nextTurnState(battle, timedSide);
        const seq = battle.eventSeq + 1;
        const stateVersion = (battle.stateVersion ?? 0) + 1;
        const eventDoc = newBattleEventRef(battleId);

        tx.update(parentRef, {
          eventSeq: seq,
          updatedAt: serverTimestamp(),
          status: 'active',
          turn: nextTurn.turn,
          turnSide: nextTurn.turnSide,
          turnPlayerId: nextTurn.turnPlayerId,
          stateVersion,
          turnStartAt: serverTimestamp(),
          turnDurationMs: BATTLE_TURN_DURATION_MS,
        });
        tx.set(
          eventDoc,
          battleEventWrite({
            eventId: eventDoc.id,
            battleId,
            playerId,
            type: 'turn_timeout',
            seq,
            meta: { turn: battle.turn, side: timedSide },
          })
        );

        return {
          ...battle,
          eventSeq: seq,
          updatedAt: Date.now(),
          turn: nextTurn.turn,
          turnSide: nextTurn.turnSide,
          turnPlayerId: nextTurn.turnPlayerId,
          stateVersion,
          turnDurationMs: BATTLE_TURN_DURATION_MS,
        };
      }),
      WRITE_MS,
      'Turn timeout yazılmadı.'
    );
    if (
      battle.status === 'active' &&
      finishReasonFromScores(battle.turn ?? 0, battle.attackerScore, battle.defenderScore)
    ) {
      await finishBattle({ battleId, playerId }).catch(() => {});
    }
    return battle;
  });
}
