import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
} from 'firebase/firestore';
import { db } from '@/firebase';
import { requireFirebaseAuth } from '@/app/lib/firebaseAuth';
import { battleFromData, battleRef } from '@/app/lib/battleEventLog/battleEventLog';
import type { BattleRecord, BattleSide, BattleStatus } from '@/app/lib/battleEventLog/battleEventTypes';
import { sanitizePlayerId } from '@/app/lib/battleEventLog/sanitizeBattleEventMeta';
import { BATTLE_EVENTS_COLLECTION } from '@/app/lib/battleEventLog/battleEventTypes';
import { getBattleEnergy, type BattleEnergy } from '@/app/lib/battleEnergy';
import { battleScoreRef, officialBattleLeader, readBoundedScore, viewPlayerBattleScore } from '@/app/lib/battleScore';
import { canPlayOnTurn, viewTurnTimer } from '@/app/lib/battlePlay/battlePlayConfig';
import { serverNowMs, syncServerClock } from '@/app/lib/battlePlay/battleServerClock';
import { BATTLE_LOADOUT_COLLECTION } from '@/app/lib/battleLoadout/battleLoadoutConfig';
import { BATTLE_CHALLENGE_COLLECTION } from '@/app/lib/battleClick/battleClickConfig';
import { viewBattleChallenge, type BattleChallenge } from '@/app/lib/battleClick/battleClickService';
import { ARENA_MATCH_COLLECTION } from '@/app/game/arena/match/config';
import { replayBattleRequest } from './replayBattleRequest';

const LIVE_STATUS: BattleStatus[] = ['joining', 'locked', 'active'];
const HINT_PREFIX = 'battle_live_hint_';

export interface BattlePlayerStatus {
  playerId: string;
  joined: boolean;
  side: BattleSide | null;
  isTurn: boolean;
  loadoutLocked: boolean | null;
}

export interface BattleReconnectSnapshot {
  battle: BattleRecord;
  player: BattlePlayerStatus;
  energy: BattleEnergy | null;
  cardUsage: Record<string, number>;
  timer: ReturnType<typeof viewTurnTimer>;
  challenges: BattleChallenge[];
  score: {
    playerScore: number;
    attackerScore: number;
    defenderScore: number;
    leaderSide: BattleSide | null;
  };
  lastRequestId: string | null;
  eventSeq: number;
  stateVersion: number;
  serverNow: number;
}

function isLiveStatus(status: BattleStatus): boolean {
  return LIVE_STATUS.includes(status);
}

function sideOf(battle: BattleRecord, playerId: string): BattleSide | null {
  if ((battle.attackerPlayerIds ?? []).includes(playerId)) return 'attacker';
  if ((battle.defenderPlayerIds ?? []).includes(playerId)) return 'defender';
  return null;
}

function hintKey(playerId: string) {
  return `${HINT_PREFIX}${playerId}`;
}

/** Yalnız bərpa hint — source of truth deyil. */
export function rememberLiveBattleHint(playerId: string, battleId: string) {
  if (typeof sessionStorage === 'undefined') return;
  sessionStorage.setItem(hintKey(playerId), battleId);
}

export function clearLiveBattleHint(playerId: string) {
  if (typeof sessionStorage === 'undefined') return;
  sessionStorage.removeItem(hintKey(playerId));
}

function readLiveBattleHint(playerId: string): string | null {
  if (typeof sessionStorage === 'undefined') return null;
  const id = sessionStorage.getItem(hintKey(playerId));
  return id && id.trim() ? id.trim() : null;
}

async function readBattle(battleId: string): Promise<BattleRecord | null> {
  const snap = await getDoc(battleRef(battleId));
  if (!snap.exists()) return null;
  return battleFromData(snap.id, snap.data());
}

async function findLiveBattleId(playerId: string, hintedId: string | null): Promise<string | null> {
  if (hintedId) {
    const hinted = await readBattle(hintedId);
    if (hinted && isLiveStatus(hinted.status) && (hinted.participantIds ?? []).includes(playerId)) {
      return hinted.id;
    }
  }

  const snap = await getDocs(
    query(
      collection(db, BATTLE_EVENTS_COLLECTION),
      where('participantIds', 'array-contains', playerId)
    )
  );

  let best: BattleRecord | null = null;
  for (const item of snap.docs) {
    const battle = battleFromData(item.id, item.data());
    if (!isLiveStatus(battle.status)) continue;
    if (!best || battle.updatedAt > best.updatedAt) best = battle;
  }
  return best?.id ?? null;
}

async function loadChallenges(battleId: string): Promise<BattleChallenge[]> {
  const snap = await getDocs(collection(db, 'battles', battleId, BATTLE_CHALLENGE_COLLECTION));
  return snap.docs
    .map((item) => viewBattleChallenge(item.id, item.data() as Record<string, unknown>))
    .filter((item) => item.status === 'active');
}

async function restoreBattleSessionWork(input: {
  playerId: string;
  battleId?: string | null;
}): Promise<BattleReconnectSnapshot | null> {
  await requireFirebaseAuth();
  const playerId = sanitizePlayerId(input.playerId);
  const hinted = input.battleId?.trim() || readLiveBattleHint(playerId);
  const battleId = await findLiveBattleId(playerId, hinted || null);
  if (!battleId) {
    clearLiveBattleHint(playerId);
    return null;
  }

  await syncServerClock().catch(() => {});
  const battle = await readBattle(battleId);
  if (!battle || !isLiveStatus(battle.status) || !(battle.participantIds ?? []).includes(playerId)) {
    clearLiveBattleHint(playerId);
    return null;
  }

  const arenaSnap = await getDoc(doc(db, ARENA_MATCH_COLLECTION, battle.id));
  if (arenaSnap.exists() && (arenaSnap.data() as { status?: string }).status === 'closed') {
    clearLiveBattleHint(playerId);
    return null;
  }

  const [energy, scoreSnap, loadoutSnap, challenges] = await Promise.all([
    getBattleEnergy(battleId, playerId),
    getDoc(battleScoreRef(battleId, playerId)),
    getDoc(doc(db, 'battles', battleId, BATTLE_LOADOUT_COLLECTION, playerId)),
    loadChallenges(battleId),
  ]);

  const side = sideOf(battle, playerId);
  const serverNow = serverNowMs();
  const playerScore = scoreSnap.exists()
    ? viewPlayerBattleScore(battleId, playerId, scoreSnap.data() as Record<string, unknown>).score
    : 0;
  const lead = officialBattleLeader(battle);

  rememberLiveBattleHint(playerId, battle.id);

  return {
    battle,
    player: {
      playerId,
      joined: Boolean(side),
      side,
      isTurn: canPlayOnTurn(battle, playerId),
      loadoutLocked: loadoutSnap.exists() ? Boolean(loadoutSnap.data()?.locked) : null,
    },
    energy,
    cardUsage: energy?.cardUsage ?? {},
    timer: viewTurnTimer(battle, serverNow),
    challenges,
    score: {
      playerScore: readBoundedScore(playerScore),
      attackerScore: lead.attackerScore,
      defenderScore: lead.defenderScore,
      leaderSide: lead.leaderSide,
    },
    lastRequestId: energy?.lastRequestId ?? null,
    eventSeq: battle.eventSeq,
    stateVersion: battle.stateVersion ?? 0,
    serverNow,
  };
}

/** Server snapshot — local energy/score/timer source of truth deyil. */
export function restoreBattleSession(input: {
  playerId: string;
  battleId?: string | null;
}): Promise<BattleReconnectSnapshot | null> {
  const playerId = String(input.playerId || '').trim();
  return replayBattleRequest(`restore:${playerId}`, () => restoreBattleSessionWork(input));
}

/** Refresh / telefon lock / online: server saatı + live battle yenidən oxunur. */
export function listenBattleReconnect(
  playerId: string,
  onChange: (snap: BattleReconnectSnapshot | null) => void
): () => void {
  let cancelled = false;

  const run = () => {
    if (!playerId.trim()) return;
    void restoreBattleSession({ playerId })
      .then((snap) => {
        if (!cancelled) onChange(snap);
      })
      .catch(() => {});
  };

  const onVisible = () => {
    if (document.visibilityState !== 'visible') return;
    void syncServerClock().catch(() => {});
    run();
  };
  const onOnline = () => {
    void syncServerClock().catch(() => {});
    run();
  };

  run();
  document.addEventListener('visibilitychange', onVisible);
  window.addEventListener('online', onOnline);
  window.addEventListener('focus', onVisible);

  return () => {
    cancelled = true;
    document.removeEventListener('visibilitychange', onVisible);
    window.removeEventListener('online', onOnline);
    window.removeEventListener('focus', onVisible);
  };
}
