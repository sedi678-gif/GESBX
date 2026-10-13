import {
  doc,
  getDoc,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from '@/firebase';
import { requireFirebaseAuth } from '@/app/lib/firebaseAuth';
import {
  BATTLE_EVENT_SCHEMA_VERSION,
  type BattleRecord,
  type BattleSide,
} from '@/app/lib/battleEventLog/battleEventTypes';
import {
  battleFromData,
  battleRef,
  battleEventWrite,
  makeBattleId,
  newBattleEventRef,
  timestampToMs,
} from '@/app/lib/battleEventLog/battleEventLog';
import { sanitizePlayerId } from '@/app/lib/battleEventLog/sanitizeBattleEventMeta';
import { BATTLE_ENERGY_COLLECTION, initialBattleEnergyDoc } from '@/app/lib/battleEnergy/battleEnergyConfig';
import { BATTLE_SCORE_COLLECTION, initialBattleScoreDoc } from '@/app/lib/battleScore/battleScoreConfig';
import { BATTLE_TURN_DURATION_MS, initialTurnState } from '@/app/lib/battlePlay/battlePlayConfig';
import { replayBattleRequest } from '@/app/lib/battleReconnect/replayBattleRequest';
import { ARENA_MATCH_COLLECTION } from '@/app/game/arena/match/config';
import { seatArenaCombatantInTx } from '@/app/game/arena/match/matchService';
import { stampJoinFailedResult } from '@/app/lib/battleFinish/battleFinishService';
import { readStoredDefenseLoadout } from '@/app/lib/battleDefense/battleDefenseConfig';
import { stampDefenseSnapshot } from '@/app/lib/battleDefense/battleDefenseService';
import { serverNowMs, syncServerClock } from '@/app/lib/battlePlay/battleServerClock';
import type { AllianceData } from '@/app/components/alliance/types';

export const ALLIANCE_BATTLE_COOLDOWN_MS = 3 * 60 * 60 * 1000;
export const ALLIANCE_BATTLE_JOIN_MS = 15_000;
export const ALLIANCE_BATTLE_MIN_PER_SIDE = 1;
export const ALLIANCE_BATTLE_MAX_PER_SIDE = 5;
export const ALLIANCE_BATTLE_COOLDOWN_COLLECTION = 'alliance_battle_cooldowns';

export interface AllianceBattleCooldown {
  allianceId: string;
  lastBattleId: string | null;
  lastBattleAt: number;
  cooldownUntil: number;
  attackerAllianceId: string | null;
}

export interface AllianceBattleGate {
  allianceId: string;
  canAttack: boolean;
  cooldownUntil: number;
  lastBattleId: string | null;
  lastBattleAt: number;
  attackerAllianceId: string | null;
}

export interface AllianceBattleView {
  battle: BattleRecord;
  phase: 'joining' | 'locked' | 'finished' | 'active' | 'open';
  joinRemainingMs: number;
  joinOpen: boolean;
  canJoin: boolean;
}

const WRITE_MS = 12_000;

function cooldownRef(allianceId: string) {
  return doc(db, ALLIANCE_BATTLE_COOLDOWN_COLLECTION, allianceId);
}

function allianceRef(allianceId: string) {
  return doc(db, 'alliances', allianceId);
}

function playerRef(playerId: string) {
  return doc(db, 'players', playerId);
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

function cooldownFromData(allianceId: string, data: Record<string, unknown> | undefined): AllianceBattleCooldown {
  return {
    allianceId,
    lastBattleId: data?.lastBattleId ? String(data.lastBattleId) : null,
    lastBattleAt: timestampToMs(data?.lastBattleAt),
    cooldownUntil: timestampToMs(data?.cooldownUntil),
    attackerAllianceId: data?.attackerAllianceId ? String(data.attackerAllianceId) : null,
  };
}

export function viewAllianceBattleGate(
  allianceId: string,
  cooldown: Pick<AllianceBattleCooldown, 'cooldownUntil' | 'lastBattleId' | 'lastBattleAt' | 'attackerAllianceId'> | null,
  now = Date.now()
): AllianceBattleGate {
  const cooldownUntil = cooldown?.cooldownUntil ?? 0;
  return {
    allianceId,
    canAttack: !cooldown || cooldownUntil <= 0 || now >= cooldownUntil,
    cooldownUntil,
    lastBattleId: cooldown?.lastBattleId ?? null,
    lastBattleAt: cooldown?.lastBattleAt ?? 0,
    attackerAllianceId: cooldown?.attackerAllianceId ?? null,
  };
}

/** createdAt/joinEndsAt 0 və ya epoch olarsa pəncərəni bitmiş sayma. */
const JOIN_CLOCK_MIN_MS = 1_000_000_000_000;

export function officialJoinEndsAt(
  battle: Pick<BattleRecord, 'joinEndsAt' | 'joinDurationMs' | 'createdAt'>,
  now = Date.now()
): number {
  const duration =
    battle.joinDurationMs && battle.joinDurationMs > 0 ? battle.joinDurationMs : ALLIANCE_BATTLE_JOIN_MS;
  if ((battle.joinEndsAt ?? 0) > JOIN_CLOCK_MIN_MS) return battle.joinEndsAt as number;
  if ((battle.createdAt ?? 0) > JOIN_CLOCK_MIN_MS) return (battle.createdAt as number) + duration;
  return now + duration;
}

export function viewAllianceBattle(battle: BattleRecord, now = Date.now()): AllianceBattleView {
  const joinEndsAt = officialJoinEndsAt(battle, now);
  const joinRemainingMs = Math.max(0, joinEndsAt - now);
  const timeLocked = battle.status === 'joining' && now >= joinEndsAt;
  const phase =
    battle.status === 'finished'
      ? 'finished'
      : battle.status === 'active'
        ? 'active'
        : battle.status === 'locked' || timeLocked
          ? 'locked'
          : battle.status === 'joining'
            ? 'joining'
            : 'open';
  return {
    battle,
    phase,
    joinRemainingMs: phase === 'joining' ? joinRemainingMs : 0,
    joinOpen: phase === 'joining' && joinRemainingMs > 0,
    canJoin: battle.status === 'joining' || battle.status === 'locked' || battle.status === 'active',
  };
}

export async function identifyAlliance(allianceId: string): Promise<AllianceData> {
  const id = String(allianceId || '').trim();
  if (!id) throw new Error('İttifaq ID tələb olunur');
  const snap = await getDoc(allianceRef(id));
  if (!snap.exists()) throw new Error('İttifaq tapılmadı');
  return { id: snap.id, ...snap.data() } as AllianceData;
}

export async function getAllianceBattleGate(allianceId: string): Promise<AllianceBattleGate> {
  const snap = await getDoc(cooldownRef(allianceId));
  return viewAllianceBattleGate(
    allianceId,
    snap.exists() ? cooldownFromData(allianceId, snap.data() as Record<string, unknown>) : null
  );
}

export function listenAllianceBattleGate(
  allianceId: string,
  onChange: (gate: AllianceBattleGate) => void
): Unsubscribe {
  return onSnapshot(cooldownRef(allianceId), (snap) => {
    onChange(
      viewAllianceBattleGate(
        allianceId,
        snap.exists() ? cooldownFromData(allianceId, snap.data() as Record<string, unknown>) : null
      )
    );
  });
}

export async function startAllianceMapBattle(input: {
  playerId: string;
  defenderAllianceId: string;
}): Promise<BattleRecord> {
  const authUser = await requireFirebaseAuth();
  const playerId = sanitizePlayerId(input.playerId);
  const defenderAllianceId = String(input.defenderAllianceId || '').trim();
  if (!defenderAllianceId) throw new Error('Hədəf ittifaq seçilməyib');

  return replayBattleRequest(`start:${playerId}:${defenderAllianceId}`, () =>
    withTimeout(
      runTransaction(db, async (tx) => {
        const playerSnap = await tx.get(playerRef(playerId));
        if (!playerSnap.exists()) throw new Error('Oyunçu tapılmadı');
        const player = playerSnap.data();
        const attackerAllianceId = String(player.allianceId || '');
        if (!attackerAllianceId) throw new Error('Hücum üçün ittifaqda olmalısan');
        if (attackerAllianceId === defenderAllianceId) throw new Error('Öz ittifaqına hücum edilə bilməz');

        const attackerSnap = await tx.get(allianceRef(attackerAllianceId));
        const defenderSnap = await tx.get(allianceRef(defenderAllianceId));
        if (!attackerSnap.exists() || !defenderSnap.exists()) throw new Error('İttifaq tapılmadı');

        const attacker = attackerSnap.data();
        const defender = defenderSnap.data();
        const attackerMembers: string[] = Array.isArray(attacker.members) ? attacker.members.map(String) : [];
        if (!attackerMembers.includes(playerId) && attacker.leaderId !== playerId) {
          throw new Error('Yalnız öz ittifaqın adından hücum edə bilərsən');
        }

        const cdRef = cooldownRef(defenderAllianceId);
        const cdSnap = await tx.get(cdRef);
        const existingCd = cdSnap.exists()
          ? cooldownFromData(defenderAllianceId, cdSnap.data() as Record<string, unknown>)
          : null;

        if (existingCd?.lastBattleId) {
          const liveSnap = await tx.get(battleRef(existingCd.lastBattleId));
          if (liveSnap.exists()) {
            const live = battleFromData(liveSnap.id, liveSnap.data());
            const arenaSnap = await tx.get(doc(db, ARENA_MATCH_COLLECTION, live.id));
            const arenaClosed =
              arenaSnap.exists() && (arenaSnap.data() as { status?: string }).status === 'closed';
            if (!arenaClosed && live.status === 'joining' && live.attackerAllianceId === attackerAllianceId) {
              return live;
            }
            if (
              !arenaClosed &&
              (live.status === 'joining' || live.status === 'locked' || live.status === 'active')
            ) {
              throw new Error('Bu ittifaqda aktiv döyüş var');
            }
          }
        }

        if (existingCd && existingCd.cooldownUntil > Date.now()) {
          throw new Error('Bu ittifaqa son 3 saat ərzində hücum edilib');
        }

        const battleId = makeBattleId();
        const parent = battleRef(battleId);
        const eventDoc = newBattleEventRef(battleId);

        tx.set(parent, {
          createdBy: playerId,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          status: 'joining',
          eventSeq: 1,
          participantIds: [playerId],
          schemaVersion: BATTLE_EVENT_SCHEMA_VERSION,
          kind: 'alliance_map',
          attackerAllianceId,
          defenderAllianceId,
          attackerAllianceName: String(attacker.name || 'Hücum'),
          defenderAllianceName: String(defender.name || 'Müdafiə'),
          attackerPlayerIds: [playerId],
          defenderPlayerIds: [],
          attackerUids: [authUser.uid],
          defenderUids: [],
          joinDurationMs: ALLIANCE_BATTLE_JOIN_MS,
          attackerScore: 0,
          defenderScore: 0,
          scoreVersion: 0,
          lastScoreRequestId: null,
        });

        tx.set(
          eventDoc,
          battleEventWrite({
            eventId: eventDoc.id,
            battleId,
            playerId,
            type: 'battle_created',
            seq: 1,
            meta: { mode: 'alliance', maxPlayers: ALLIANCE_BATTLE_MAX_PER_SIDE * 2 },
          })
        );
        tx.set(doc(db, 'battles', battleId, BATTLE_ENERGY_COLLECTION, playerId), initialBattleEnergyDoc(battleId, playerId));
        tx.set(doc(db, 'battles', battleId, BATTLE_SCORE_COLLECTION, playerId), initialBattleScoreDoc(battleId, playerId));

        tx.set(cdRef, {
          lastBattleId: battleId,
          lastBattleAt: serverTimestamp(),
          cooldownUntil: new Date(Date.now() + ALLIANCE_BATTLE_COOLDOWN_MS),
          attackerAllianceId,
          updatedAt: serverTimestamp(),
        });

        return {
          id: battleId,
          createdBy: playerId,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          status: 'joining' as const,
          eventSeq: 1,
          participantIds: [playerId],
          schemaVersion: BATTLE_EVENT_SCHEMA_VERSION,
          kind: 'alliance_map' as const,
          attackerAllianceId,
          defenderAllianceId,
          attackerAllianceName: String(attacker.name || 'Hücum'),
          defenderAllianceName: String(defender.name || 'Müdafiə'),
          attackerPlayerIds: [playerId],
          defenderPlayerIds: [],
          attackerUids: [authUser.uid],
          defenderUids: [],
          joinEndsAt: Date.now() + ALLIANCE_BATTLE_JOIN_MS,
          joinDurationMs: ALLIANCE_BATTLE_JOIN_MS,
          attackerScore: 0,
          defenderScore: 0,
          scoreVersion: 0,
        };
      }),
      WRITE_MS,
      'Hücum sorğusu vaxtı bitdi.'
    )
  );
}

export async function joinAllianceMapBattle(input: {
  battleId: string;
  playerId: string;
}): Promise<BattleRecord> {
  const authUser = await requireFirebaseAuth();
  const playerId = sanitizePlayerId(input.playerId);
  const battleId = String(input.battleId || '').trim();
  await syncServerClock().catch(() => {});

  return replayBattleRequest(`join:${battleId}:${playerId}`, () =>
    withTimeout(
    runTransaction(db, async (tx) => {
      const parentRef = battleRef(battleId);
      const parentSnap = await tx.get(parentRef);
      if (!parentSnap.exists()) throw new Error('Battle tapılmadı');
      const battle = battleFromData(parentSnap.id, parentSnap.data());
      if (battle.kind !== 'alliance_map') throw new Error('Bu battle xəritə döyüşü deyil');
      if (battle.status === 'finished') throw new Error('Battle bitib');
      if (battle.status !== 'joining' && battle.status !== 'locked' && battle.status !== 'active') {
        throw new Error('Bu döyüşə qoşulmaq olmur');
      }
      const now = serverNowMs() || Date.now();
      if (battle.status === 'joining' && now >= officialJoinEndsAt(battle, now)) {
        throw new Error('Qoşulma müddəti bitib');
      }

      const attackers = battle.attackerPlayerIds ?? [];
      const defenders = battle.defenderPlayerIds ?? [];
      if (attackers.includes(playerId) || defenders.includes(playerId)) {
        const onAttack = attackers.includes(playerId);
        const uids = onAttack ? battle.attackerUids ?? [] : battle.defenderUids ?? [];
        if (uids.includes(authUser.uid)) return battle;
        const nextUids = [...uids, authUser.uid];
        const seqBind = battle.eventSeq + 1;
        tx.update(parentRef, {
          eventSeq: seqBind,
          updatedAt: serverTimestamp(),
          ...(onAttack ? { attackerUids: nextUids } : { defenderUids: nextUids }),
        });
        return {
          ...battle,
          eventSeq: seqBind,
          attackerUids: onAttack ? nextUids : battle.attackerUids ?? [],
          defenderUids: onAttack ? battle.defenderUids ?? [] : nextUids,
        };
      }

      const energyRef = doc(db, 'battles', battleId, BATTLE_ENERGY_COLLECTION, playerId);
      const scoreRef = doc(db, 'battles', battleId, BATTLE_SCORE_COLLECTION, playerId);
      const energySnap = await tx.get(energyRef);
      const scoreSnap = await tx.get(scoreRef);
      const playerSnap = await tx.get(playerRef(playerId));
      if (!playerSnap.exists()) throw new Error('Oyunçu tapılmadı');
      const allianceId = String(playerSnap.data().allianceId || '');

      let side: BattleSide;
      if (allianceId && allianceId === battle.attackerAllianceId) side = 'attacker';
      else if (allianceId && allianceId === battle.defenderAllianceId) side = 'defender';
      else throw new Error('Yalnız döyüşən ittifaqların üzvləri qoşula bilər');

      const attackerSnap = await tx.get(allianceRef(battle.attackerAllianceId || ''));
      const defenderSnap = await tx.get(allianceRef(battle.defenderAllianceId || ''));
      const home = side === 'attacker' ? attackerSnap.data() : defenderSnap.data();
      const members: string[] = Array.isArray(home?.members) ? home.members.map(String) : [];
      if (!members.includes(playerId) && home?.leaderId !== playerId) {
        throw new Error('İttifaq üzvü deyilsən');
      }

      const nextAttackers = side === 'attacker' ? [...attackers, playerId] : attackers;
      const nextDefenders = side === 'defender' ? [...defenders, playerId] : defenders;
      const nextAtkUids =
        side === 'attacker' ? [...(battle.attackerUids ?? []), authUser.uid] : battle.attackerUids ?? [];
      const nextDefUids =
        side === 'defender' ? [...(battle.defenderUids ?? []), authUser.uid] : battle.defenderUids ?? [];
      if (nextAttackers.length > ALLIANCE_BATTLE_MAX_PER_SIDE) throw new Error('Hücum tərəfi doludur (5/5)');
      if (nextDefenders.length > ALLIANCE_BATTLE_MAX_PER_SIDE) throw new Error('Müdafiə tərəfi doludur (5/5)');

      const seq = battle.eventSeq + 1;
      const eventDoc = newBattleEventRef(battleId);
      tx.update(parentRef, {
        eventSeq: seq,
        updatedAt: serverTimestamp(),
        participantIds: [...nextAttackers, ...nextDefenders],
        attackerPlayerIds: nextAttackers,
        defenderPlayerIds: nextDefenders,
        attackerUids: nextAtkUids,
        defenderUids: nextDefUids,
      });
      tx.set(
        eventDoc,
        battleEventWrite({
          eventId: eventDoc.id,
          battleId,
          playerId,
          type: 'player_joined',
          seq,
          meta: { side },
        })
      );
      if (!energySnap.exists()) {
        tx.set(energyRef, initialBattleEnergyDoc(battleId, playerId));
      }
      if (!scoreSnap.exists()) {
        tx.set(scoreRef, initialBattleScoreDoc(battleId, playerId));
      }

      await seatArenaCombatantInTx(
        tx,
        battleId,
        playerId,
        side === 'attacker' ? 'home' : 'away'
      );

      return {
        ...battle,
        eventSeq: seq,
        updatedAt: Date.now(),
        participantIds: [...nextAttackers, ...nextDefenders],
        attackerPlayerIds: nextAttackers,
        defenderPlayerIds: nextDefenders,
        attackerUids: nextAtkUids,
        defenderUids: nextDefUids,
      };
    }),
    WRITE_MS,
    'Qoşulma vaxtı bitdi.'
    )
  );
}

export async function seatOfflineDefenders(battleId: string, actorId: string): Promise<number> {
  await requireFirebaseAuth();
  const actor = sanitizePlayerId(actorId);
  const id = String(battleId || '').trim();
  let seated = 0;

  for (let step = 0; step < ALLIANCE_BATTLE_MAX_PER_SIDE; step += 1) {
    const added = await withTimeout(
      runTransaction(db, async (tx) => {
        const parentRef = battleRef(id);
        const parentSnap = await tx.get(parentRef);
        if (!parentSnap.exists()) return false;
        const battle = battleFromData(parentSnap.id, parentSnap.data());
        if (battle.status !== 'joining' && battle.status !== 'locked') return false;
        if (!(battle.attackerPlayerIds ?? []).includes(actor)) return false;
        const defenders = battle.defenderPlayerIds ?? [];
        if (defenders.length >= ALLIANCE_BATTLE_MAX_PER_SIDE) return false;

        const allianceSnap = await tx.get(allianceRef(battle.defenderAllianceId || ''));
        if (!allianceSnap.exists()) return false;
        const home = allianceSnap.data();
        const members: string[] = Array.isArray(home?.members) ? home.members.map(String) : [];
        const leaderId = String(home?.leaderId || '');
        const candidates = [...new Set([leaderId, ...members].filter(Boolean))].filter(
          (player) => !defenders.includes(player)
        );
        const snaps = await Promise.all(candidates.slice(0, 8).map((player) => tx.get(playerRef(player))));
        const pick = snaps.find((snap) => snap.exists() && readStoredDefenseLoadout(snap.data() as Record<string, unknown>).length >= 1);
        if (!pick) return false;

        const playerId = pick.id;
        const nextDefenders = [...defenders, playerId];
        const attackers = battle.attackerPlayerIds ?? [];
        const seq = battle.eventSeq + 1;
        const eventDoc = newBattleEventRef(id);
        const energyRef = doc(db, 'battles', id, BATTLE_ENERGY_COLLECTION, playerId);
        const scoreRef = doc(db, 'battles', id, BATTLE_SCORE_COLLECTION, playerId);
        const energySnap = await tx.get(energyRef);
        const scoreSnap = await tx.get(scoreRef);
        const snapSnap = await tx.get(doc(db, 'battles', id, 'defense_loadouts', playerId));

        tx.update(parentRef, {
          eventSeq: seq,
          updatedAt: serverTimestamp(),
          participantIds: [...attackers, ...nextDefenders],
          defenderPlayerIds: nextDefenders,
        });
        tx.set(
          eventDoc,
          battleEventWrite({
            eventId: eventDoc.id,
            battleId: id,
            playerId,
            type: 'player_joined',
            seq,
            meta: { side: 'defender', role: 'offline_defense' },
          })
        );
        if (!energySnap.exists()) tx.set(energyRef, initialBattleEnergyDoc(id, playerId));
        if (!scoreSnap.exists()) tx.set(scoreRef, initialBattleScoreDoc(id, playerId));
        stampDefenseSnapshot(tx, id, playerId, pick.data() as Record<string, unknown>, snapSnap.exists());
        return true;
      }),
      WRITE_MS,
      'Offline müdafiə oturmadı.'
    );
    if (!added) break;
    seated += 1;
  }

  return seated;
}

export async function lockAllianceMapBattle(battleId: string, actorId: string): Promise<BattleRecord> {
  await requireFirebaseAuth();
  const playerId = sanitizePlayerId(actorId);
  const id = String(battleId || '').trim();

  return replayBattleRequest(`lock:${id}`, () =>
    withTimeout(
    runTransaction(db, async (tx) => {
      const parentRef = battleRef(id);
      const parentSnap = await tx.get(parentRef);
      if (!parentSnap.exists()) throw new Error('Battle tapılmadı');
      const battle = battleFromData(parentSnap.id, parentSnap.data());
      if (battle.status === 'locked' || battle.status === 'finished' || battle.status === 'active') {
        return battle;
      }
      if (battle.status !== 'joining') throw new Error('Battle qoşulma mərhələsində deyil');

      const attackers = battle.attackerPlayerIds ?? [];
      const defenders = battle.defenderPlayerIds ?? [];
      const ok = attackers.length >= ALLIANCE_BATTLE_MIN_PER_SIDE;
      const seq = battle.eventSeq + 1;
      const eventDoc = newBattleEventRef(id);
      const status = ok ? 'locked' : 'finished';

      tx.update(parentRef, ok
        ? {
            eventSeq: seq,
            updatedAt: serverTimestamp(),
            status,
          }
        : {
            eventSeq: seq,
            updatedAt: serverTimestamp(),
            status,
            finishReason: 'join_failed',
            winnerSide: null,
            winnerAllianceId: null,
          });
      tx.set(
        eventDoc,
        ok
          ? battleEventWrite({
              eventId: eventDoc.id,
              battleId: id,
              playerId,
              type: 'loadout_locked',
              seq,
              meta: { slotCount: attackers.length + defenders.length },
            })
          : battleEventWrite({
              eventId: eventDoc.id,
              battleId: id,
              playerId,
              type: 'battle_finished',
              seq,
              meta: { reason: 'join_failed' },
            })
      );
      if (!ok) stampJoinFailedResult(tx, { ...battle, eventSeq: battle.eventSeq });

      return { ...battle, eventSeq: seq, updatedAt: Date.now(), status };
    }),
    WRITE_MS,
    'Lock yazılması vaxtı bitdi.'
    )
  );
}

export async function activateAllianceBattle(battleId: string, actorId: string): Promise<BattleRecord> {
  await requireFirebaseAuth();
  const playerId = sanitizePlayerId(actorId);
  const id = String(battleId || '').trim();

  return replayBattleRequest(`activate:${id}`, () =>
    withTimeout(
    runTransaction(db, async (tx) => {
      const parentRef = battleRef(id);
      const parentSnap = await tx.get(parentRef);
      if (!parentSnap.exists()) throw new Error('Battle tapılmadı');
      const battle = battleFromData(parentSnap.id, parentSnap.data());
      if (battle.status === 'active') return battle;
      if (battle.status === 'finished') throw new Error('Battle bitib');
      if (battle.status !== 'joining' && battle.status !== 'locked') {
        throw new Error('Battle hələ başlamağa hazır deyil');
      }

      const attackers = battle.attackerPlayerIds ?? [];
      if (attackers.length < ALLIANCE_BATTLE_MIN_PER_SIDE) {
        throw new Error('Hücum tərəfində ən az 1 oyunçu olmalıdır');
      }

      const turn = initialTurnState(battle);
      if (!turn.turnPlayerId) throw new Error('Növbə təyin olunmadı');

      const seq = battle.eventSeq + 1;
      const eventDoc = newBattleEventRef(id);
      tx.update(parentRef, {
        eventSeq: seq,
        updatedAt: serverTimestamp(),
        status: 'active',
        turn: turn.turn,
        turnSide: turn.turnSide,
        turnPlayerId: turn.turnPlayerId,
        stateVersion: turn.stateVersion,
        turnStartAt: serverTimestamp(),
        turnDurationMs: BATTLE_TURN_DURATION_MS,
      });
      tx.set(
        eventDoc,
        battleEventWrite({
          eventId: eventDoc.id,
          battleId: id,
          playerId,
          type: 'turn_started',
          seq,
          meta: { turn: turn.turn, side: turn.turnSide },
        })
      );

      return {
        ...battle,
        eventSeq: seq,
        updatedAt: Date.now(),
        status: 'active' as const,
        turn: turn.turn,
        turnSide: turn.turnSide,
        turnPlayerId: turn.turnPlayerId,
        stateVersion: turn.stateVersion,
        turnStartAt: Date.now(),
        turnDurationMs: BATTLE_TURN_DURATION_MS,
        turnEndAt: Date.now() + BATTLE_TURN_DURATION_MS,
      };
    }),
    WRITE_MS,
    'Battle aktivləşdirilmədi.'
    )
  );
}

export function listenAllianceMapBattle(
  battleId: string,
  onChange: (view: AllianceBattleView | null) => void
): Unsubscribe {
  return onSnapshot(battleRef(battleId), (snap) => {
    if (!snap.exists()) {
      onChange(null);
      return;
    }
    onChange(viewAllianceBattle(battleFromData(snap.id, snap.data())));
  });
}

export function listenMyJoiningBattle(
  allianceId: string,
  onChange: (battleId: string | null) => void,
  viewer?: { playerId?: string; allianceId?: string }
): Unsubscribe {
  return onSnapshot(cooldownRef(allianceId), async (snap) => {
    if (!snap.exists()) {
      onChange(null);
      return;
    }
    const cd = cooldownFromData(allianceId, snap.data() as Record<string, unknown>);
    if (!cd.lastBattleId) {
      onChange(null);
      return;
    }
    const battleSnap = await getDoc(battleRef(cd.lastBattleId));
    if (!battleSnap.exists()) {
      onChange(null);
      return;
    }
    const battle = battleFromData(battleSnap.id, battleSnap.data());
    if (battle.status !== 'joining' && battle.status !== 'locked' && battle.status !== 'active') {
      onChange(null);
      return;
    }
    const arenaSnap = await getDoc(doc(db, ARENA_MATCH_COLLECTION, battle.id));
    if (arenaSnap.exists() && (arenaSnap.data() as { status?: string }).status === 'closed') {
      onChange(null);
      return;
    }
    const viewerAlliance = viewer?.allianceId || '';
    const viewerPlayer = viewer?.playerId || '';
    const inBattle = [...(battle.attackerPlayerIds ?? []), ...(battle.defenderPlayerIds ?? [])].includes(viewerPlayer);
    const fighting =
      Boolean(viewerAlliance) &&
      (viewerAlliance === battle.attackerAllianceId || viewerAlliance === battle.defenderAllianceId);
    if (!inBattle && !fighting) {
      onChange(null);
      return;
    }
    onChange(battle.id);
  });
}
