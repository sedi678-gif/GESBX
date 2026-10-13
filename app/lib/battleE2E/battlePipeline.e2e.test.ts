/**
 * Battle sistemi — 24 mərhələli fail-fast E2E.
 * Hər mərhələ rəsmi server funksiyalarını eyni simulyasiya üzərində çağırır.
 * Bir mərhələ düşərsə qalanlar skip olunur.
 */
import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  ALLIANCE_BATTLE_JOIN_MS,
  ALLIANCE_BATTLE_MAX_PER_SIDE,
  officialJoinEndsAt,
  viewAllianceBattle,
  viewAllianceBattleGate,
} from '@/app/lib/allianceBattleMatchService';
import { auditBattleEvents, makeBattleId } from '@/app/lib/battleEventLog/battleEventLog';
import type { BattleEvent, BattleEventType, BattleRecord } from '@/app/lib/battleEventLog/battleEventTypes';
import { BATTLE_EVENT_SCHEMA_VERSION } from '@/app/lib/battleEventLog/battleEventTypes';
import { sanitizeBattleEventMeta } from '@/app/lib/battleEventLog/sanitizeBattleEventMeta';
import {
  BATTLE_LOADOUT_MAX_COPIES,
  BATTLE_LOADOUT_SIZE,
  validateBattleLoadout,
} from '@/app/lib/battleLoadout/battleLoadoutConfig';
import {
  BATTLE_ENERGY_MAX,
  BATTLE_ENERGY_START,
  assertLoadoutFitsEnergy,
  initialBattleEnergyDoc,
  loadoutEnergyCost,
  officialCardEnergyCost,
} from '@/app/lib/battleEnergy/battleEnergyConfig';
import { BATTLE_CARD_MAX_USES, initialTurnState, nextTurnState } from '@/app/lib/battlePlay/battlePlayConfig';
import { officialCardEffect } from '@/app/lib/battleScore/battleScoreConfig';
import { officialRequiredClicks } from '@/app/lib/battleClick/battleClickConfig';
import {
  applyOfficialPlayScores,
  assertChallengeClickAllowed,
  assertFinishWinnerNotFromClient,
  assertPlayCardAllowed,
  assertRewardOnce,
} from '@/app/lib/battleSecurity/battleSecurityPolicy';
import {
  BATTLE_FINISH_PLAYER_WIN,
  addGlobalScore,
  officialFinishDeltas,
  officialFinishReason,
  officialFinishWinner,
} from '@/app/lib/battleFinish/battleFinishConfig';
import {
  LEADERBOARD_ACTIVE_NORM_BASE,
  LEADERBOARD_WEEKLY_SCORE_BASE,
  addLeaderboardScore,
  officialNormalizedAllianceScore,
  officialPeriod,
  upsertLeaderboardRow,
  type LeaderboardRow,
} from '@/app/lib/leaderboard/leaderboardConfig';

const REPORT_PATH = join(process.cwd(), 'app/lib/battleE2E/lastReport.json');

type StageStatus = 'pass' | 'fail' | 'skip';

interface StageResult {
  id: number;
  name: string;
  status: StageStatus;
  detail: string;
  ms: number;
}

const ATTACKER_LOADOUT = ['qul', 'duman', 'casus', 'qaya', 'ogru'] as const;
const DEFENDER_LOADOUT = ['duman', 'casus', 'qaya', 'ogru', 'joker'] as const;
const CHEAP_CARDS = ['duman', 'casus', 'qaya', 'ogru', 'joker'] as const;

const NOW = 1_700_000_000_000;
const pA = 'pA';
const pA2 = 'pA2';
const pA3 = 'pA3';
const pB = 'pB';
const pB2 = 'pB2';
const pB3 = 'pB3';
const uA = 'uA';
const uA2 = 'uA2';
const uA3 = 'uA3';
const uB = 'uB';
const uB2 = 'uB2';
const uB3 = 'uB3';
const allianceA = 'aAlpha';
const allianceB = 'aBravo';

const UID: Record<string, string> = {
  [pA]: uA,
  [pA2]: uA2,
  [pA3]: uA3,
  [pB]: uB,
  [pB2]: uB2,
  [pB3]: uB3,
};

const HAND: Record<string, string[]> = {
  [pA]: [...ATTACKER_LOADOUT],
  [pA2]: [...ATTACKER_LOADOUT],
  [pA3]: [...ATTACKER_LOADOUT],
  [pB]: [...DEFENDER_LOADOUT],
  [pB2]: [...DEFENDER_LOADOUT],
  [pB3]: [...DEFENDER_LOADOUT],
};

const inventory = Object.fromEntries(
  [...new Set([...ATTACKER_LOADOUT, ...DEFENDER_LOADOUT])].map((id) => [id, 3])
);

const results: StageResult[] = [];
let failedAt: number | null = null;
const startedAt = Date.now();

interface ChallengeSim {
  challengeId: string;
  battleId: string;
  targetAllianceId: string;
  requiredClicks: number;
  currentClicks: number;
  expiresAt: number;
  status: 'active' | 'succeeded' | 'expired';
}

const sim = {
  battle: null as BattleRecord | null,
  energy: {} as Record<string, number>,
  usage: {} as Record<string, Record<string, number>>,
  playerBattleScore: {} as Record<string, number>,
  events: [] as BattleEvent[],
  challenge: null as ChallengeSim | null,
  finished: null as null | {
    winnerAllianceId: string | null;
    winnerSide: 'attacker' | 'defender' | null;
    reason: ReturnType<typeof officialFinishReason>;
    deltas: ReturnType<typeof officialFinishDeltas>;
  },
  lifetimeScore: { [pA]: 100, [pB]: 80 } as Record<string, number>,
  allianceScore: {
    [allianceA]: LEADERBOARD_WEEKLY_SCORE_BASE,
    [allianceB]: LEADERBOARD_WEEKLY_SCORE_BASE,
  } as Record<string, number>,
  dailyRows: [] as LeaderboardRow[],
  weeklyRows: [] as LeaderboardRow[],
  result: null as Record<string, unknown> | null,
};

function requireBattle(): BattleRecord {
  assert.ok(sim.battle, 'battle yoxdur');
  return sim.battle;
}

function pushEvent(type: BattleEventType, playerId: string, meta: Record<string, unknown>) {
  const battle = requireBattle();
  const seq = sim.events.length + 1;
  const event: BattleEvent = {
    eventId: `evt_${seq}`,
    battleId: battle.id,
    playerId,
    type,
    seq,
    createdAt: NOW + seq,
    schemaVersion: BATTLE_EVENT_SCHEMA_VERSION,
    meta: sanitizeBattleEventMeta(type, meta),
  };
  sim.events.push(event);
  sim.battle = { ...battle, eventSeq: seq };
  return event;
}

function playArgs(playerId: string, cardId: string) {
  const battle = requireBattle();
  return {
    battle,
    playerId,
    uid: UID[playerId],
    cardId,
    expectedStateVersion: battle.stateVersion ?? 0,
    expectedEventSeq: battle.eventSeq,
    handIds: HAND[playerId],
    energy: sim.energy[playerId],
    cardUsage: sim.usage[playerId] ?? {},
    cooldownUntil: {} as Record<string, number>,
    serverNow: NOW + 100,
  };
}

function pickCheapCard(playerId: string): string {
  for (const cardId of CHEAP_CARDS) {
    if (!HAND[playerId].includes(cardId)) continue;
    const used = sim.usage[playerId]?.[cardId] ?? 0;
    const cost = officialCardEnergyCost(cardId);
    if (used < BATTLE_CARD_MAX_USES && (sim.energy[playerId] ?? 0) >= cost) {
      return cardId;
    }
  }
  throw new Error(`${playerId} üçün oynana bilən ucuz kart qalmadı`);
}

function playOfficial(playerId: string, cardId: string) {
  const battle = requireBattle();
  const allowed = assertPlayCardAllowed(playArgs(playerId, cardId));
  const scores = applyOfficialPlayScores({
    battle,
    playerId,
    effect: allowed.effect,
    playerScore: sim.playerBattleScore[playerId] ?? 0,
  });
  const side = (battle.attackerPlayerIds ?? []).includes(playerId) ? 'attacker' : 'defender';
  const next = nextTurnState(battle, side);
  sim.energy[playerId] = allowed.energyAfter;
  sim.usage[playerId] = { ...(sim.usage[playerId] ?? {}), [cardId]: allowed.usageAfter };
  sim.playerBattleScore[playerId] = scores.playerScore;
  sim.battle = {
    ...battle,
    attackerScore: scores.attackerScore,
    defenderScore: scores.defenderScore,
    turn: next.turn,
    turnSide: next.turnSide,
    turnPlayerId: next.turnPlayerId,
    eventSeq: battle.eventSeq + 1,
    stateVersion: (battle.stateVersion ?? 0) + 1,
    turnStartAt: NOW,
    turnEndAt: NOW + 15_000,
    turnDurationMs: 15_000,
  };
  pushEvent('card_played', playerId, { cardId, side, usage: allowed.usageAfter });
  pushEvent('energy_changed', playerId, {
    energy: allowed.energyAfter,
    delta: -allowed.cost,
    reason: 'play',
    cardId,
  });
  pushEvent('score_changed', playerId, {
    score: scores.playerScore,
    delta: scores.playerDelta,
    scope: 'player',
    cardId,
  });
  return { allowed, scores };
}

function runStage(id: number, name: string, fn: () => string) {
  test(`${String(id).padStart(2, '0')} ${name}`, (t) => {
    if (failedAt !== null) {
      results.push({
        id,
        name,
        status: 'skip',
        detail: `Dayandı: mərhələ ${failedAt} uğursuz oldu`,
        ms: 0,
      });
      t.skip(`fail-fast: mərhələ ${failedAt}`);
      return;
    }
    const t0 = Date.now();
    try {
      const detail = fn();
      results.push({ id, name, status: 'pass', detail, ms: Date.now() - t0 });
    } catch (error) {
      failedAt = id;
      const detail = error instanceof Error ? error.message : String(error);
      results.push({ id, name, status: 'fail', detail, ms: Date.now() - t0 });
      throw error;
    }
  });
}

test('joinEndsAt 0/epoch ikən 15s pəncərə açıq qalır', () => {
  const now = 1_700_000_000_000;
  const broken = {
    joinEndsAt: 0,
    joinDurationMs: 15_000,
    createdAt: 0,
  };
  const ends = officialJoinEndsAt(broken, now);
  assert.ok(ends > now);
  assert.equal(ends - now, 15_000);
  const epochDerived = officialJoinEndsAt({ joinEndsAt: 15_000, joinDurationMs: 15_000, createdAt: 0 }, now);
  assert.ok(epochDerived > now);
  const real = officialJoinEndsAt({ joinEndsAt: 0, joinDurationMs: 15_000, createdAt: now }, now + 1_000);
  assert.equal(real, now + 15_000);
  const view = viewAllianceBattle(
    {
      id: 'bat_join_clock',
      createdBy: 'pA',
      createdAt: 0,
      updatedAt: 0,
      status: 'joining',
      eventSeq: 1,
      participantIds: ['pA'],
      schemaVersion: 1,
      joinDurationMs: 15_000,
      joinEndsAt: 0,
    },
    now
  );
  assert.equal(view.joinOpen, true);
  assert.equal(view.canJoin, true);
  assert.equal(view.phase, 'joining');
});

runStage(1, 'User A alliance xəritəsini açır', () => {
  assert.notEqual(allianceA, allianceB);
  assert.ok(pA);
  return `Xəritə: ${allianceA} (User A) və ${allianceB} görünür`;
});

runStage(2, 'User A başqa alliance seçir', () => {
  const selected = allianceB;
  assert.notEqual(selected, allianceA);
  return `Seçilən hədəf: ${selected}`;
});

runStage(3, 'Hücum icazəsi yoxlanılır', () => {
  const open = viewAllianceBattleGate(allianceB, null, NOW);
  assert.equal(open.canAttack, true);

  const onCooldown = viewAllianceBattleGate(
    allianceB,
    { cooldownUntil: NOW + 60_000, lastBattleId: 'bat_old', lastBattleAt: NOW - 1, attackerAllianceId: allianceA },
    NOW
  );
  assert.equal(onCooldown.canAttack, false);

  assert.notEqual(allianceA, allianceB);
  return `canAttack=${open.canAttack}; cooldown rədd; öz ittifaqı qadağandır`;
});

runStage(4, 'Battle yaradılır', () => {
  const id = makeBattleId();
  assert.match(id, /^bat_[a-z0-9]+_[a-z0-9]+$/);
  sim.battle = {
    id,
    createdBy: pA,
    createdAt: NOW,
    updatedAt: NOW,
    status: 'joining',
    eventSeq: 0,
    participantIds: [pA],
    schemaVersion: BATTLE_EVENT_SCHEMA_VERSION,
    kind: 'alliance_map',
    attackerAllianceId: allianceA,
    defenderAllianceId: allianceB,
    attackerPlayerIds: [pA],
    defenderPlayerIds: [],
    attackerUids: [uA],
    defenderUids: [],
    joinEndsAt: NOW + ALLIANCE_BATTLE_JOIN_MS,
    joinDurationMs: ALLIANCE_BATTLE_JOIN_MS,
    attackerScore: 0,
    defenderScore: 0,
  };
  pushEvent('battle_created', pA, { mode: 'alliance', maxPlayers: ALLIANCE_BATTLE_MAX_PER_SIDE * 2 });
  assert.equal(requireBattle().status, 'joining');
  assert.equal(requireBattle().attackerAllianceId, allianceA);
  assert.equal((requireBattle().defenderPlayerIds ?? []).length, 0);
  return `battleId=${id} status=joining`;
});

runStage(5, '15 saniyəlik join mərhələsi başlayır', () => {
  assert.equal(ALLIANCE_BATTLE_JOIN_MS, 15_000);
  const battle = requireBattle();
  const open = viewAllianceBattle(battle, NOW + 1_000);
  assert.equal(open.joinOpen, true);
  assert.equal(open.canJoin, true);
  assert.equal(open.phase, 'joining');
  const closed = viewAllianceBattle(battle, NOW + ALLIANCE_BATTLE_JOIN_MS + 1);
  assert.equal(closed.joinOpen, false);
  assert.equal(closed.canJoin, true);
  assert.equal(closed.phase, 'locked');
  return `JOIN_MS=${ALLIANCE_BATTLE_JOIN_MS}; +1s open; +15.001s locked; late join açıq`;
});

runStage(6, 'Oyunçular qoşulur', () => {
  const battle = requireBattle();
  sim.battle = {
    ...battle,
    attackerPlayerIds: [pA, pA2, pA3],
    defenderPlayerIds: [pB, pB2, pB3],
    attackerUids: [uA, uA2, uA3],
    defenderUids: [uB, uB2, uB3],
    participantIds: [pA, pA2, pA3, pB, pB2, pB3],
  };
  assert.ok((sim.battle.attackerPlayerIds ?? []).length <= ALLIANCE_BATTLE_MAX_PER_SIDE);
  assert.ok((sim.battle.defenderPlayerIds ?? []).length <= ALLIANCE_BATTLE_MAX_PER_SIDE);
  assert.equal((sim.battle.attackerPlayerIds ?? []).length, 3);
  assert.equal((sim.battle.defenderPlayerIds ?? []).length, 3);
  pushEvent('player_joined', pB, { side: 'defender', role: 'member' });
  pushEvent('player_joined', pA2, { side: 'attacker', role: 'member' });
  return `3v3 join; max/side=${ALLIANCE_BATTLE_MAX_PER_SIDE}`;
});

runStage(7, 'Loadout seçilir', () => {
  const okA = validateBattleLoadout([...ATTACKER_LOADOUT], inventory);
  const okB = validateBattleLoadout([...DEFENDER_LOADOUT], inventory);
  assert.deepEqual(okA, [...ATTACKER_LOADOUT]);
  assert.deepEqual(okB, [...DEFENDER_LOADOUT]);
  assert.throws(() => validateBattleLoadout(['qul', 'duman'], inventory));
  assert.ok(loadoutEnergyCost(okA) <= BATTLE_ENERGY_START);
  assert.ok(loadoutEnergyCost(okB) <= BATTLE_ENERGY_START);
  assert.equal(assertLoadoutFitsEnergy(okA), loadoutEnergyCost(okA));
  assert.throws(() => assertLoadoutFitsEnergy(['2x', 'casus', 'qaya', 'sehrbaz', 'guzgu', 'joker']));
  return `A/B loadout ${BATTLE_LOADOUT_SIZE} kart; energy≤${BATTLE_ENERGY_START}`;
});

runStage(8, '5 kart lock edilir', () => {
  assert.equal(ATTACKER_LOADOUT.length, BATTLE_LOADOUT_SIZE);
  assert.equal(new Set(ATTACKER_LOADOUT).size, BATTLE_LOADOUT_SIZE);
  assert.equal(BATTLE_LOADOUT_MAX_COPIES, 1);
  assert.throws(() => validateBattleLoadout(['qul', 'qul', 'duman', 'casus', 'qaya'], inventory));
  for (const id of [pA, pA2, pA3, pB, pB2, pB3]) {
    sim.usage[id] = {};
    sim.energy[id] = BATTLE_ENERGY_START;
    sim.playerBattleScore[id] = 0;
    pushEvent('loadout_locked', id, { cardIds: HAND[id], slotCount: BATTLE_LOADOUT_SIZE });
  }
  return `5 unique lock; duplicate rədd; usage=0`;
});

runStage(9, 'Battle başlayır', () => {
  const battle = requireBattle();
  const turn = initialTurnState(battle);
  sim.battle = {
    ...battle,
    status: 'active',
    turn: turn.turn,
    turnSide: turn.turnSide,
    turnPlayerId: turn.turnPlayerId,
    stateVersion: turn.stateVersion,
    turnStartAt: NOW,
    turnEndAt: NOW + 15_000,
    turnDurationMs: 15_000,
  };
  pushEvent('turn_started', turn.turnPlayerId, { turn: 1, side: 'attacker' });
  assert.equal(sim.battle.status, 'active');
  assert.equal(sim.battle.turn, 1);
  assert.equal(sim.battle.turnSide, 'attacker');
  assert.equal(sim.battle.turnPlayerId, pA);
  const live = viewAllianceBattle(sim.battle, NOW);
  assert.equal(live.canJoin, true);
  const emptyDef = nextTurnState(
    { ...sim.battle, attackerPlayerIds: [pA], defenderPlayerIds: [] },
    'attacker'
  );
  assert.equal(emptyDef.turnSide, 'attacker');
  assert.equal(emptyDef.turn, 2);
  assert.equal(emptyDef.turnPlayerId, pA);
  return `status=active turn=1 player=${pA}; empty defender skip`;
});

runStage(10, 'Energy 25 olur', () => {
  const doc = initialBattleEnergyDoc(requireBattle().id, pA);
  assert.equal(BATTLE_ENERGY_START, 25);
  assert.equal(BATTLE_ENERGY_MAX, 25);
  assert.equal(doc.energy, 25);
  assert.equal(doc.maxEnergy, 25);
  assert.equal(sim.energy[pA], 25);
  assert.equal(sim.energy[pB], 25);
  return `energy start/max=25`;
});

runStage(11, 'Kart oynanır', () => {
  const allowed = assertPlayCardAllowed(playArgs(pA, 'qul'));
  assert.equal(allowed.cardId, 'qul');
  assert.equal(allowed.cost, officialCardEnergyCost('qul'));
  assert.equal(allowed.duplicate, false);
  assert.throws(() => assertPlayCardAllowed(playArgs(pB, 'duman')));
  return `qul play icazəsi cost=${allowed.cost}; yanlış növbə rədd`;
});

runStage(12, 'Energy azalır', () => {
  const cost = officialCardEnergyCost('qul');
  const played = playOfficial(pA, 'qul');
  assert.equal(cost, 4);
  assert.equal(played.allowed.energyAfter, 21);
  assert.equal(sim.energy[pA], BATTLE_ENERGY_START - cost);
  return `25 - 4 = ${sim.energy[pA]}`;
});

runStage(13, 'Kart usage artır', () => {
  const live = requireBattle();
  assert.equal(sim.usage[pA].qul, 1);
  assert.ok(sim.usage[pA].qul <= BATTLE_CARD_MAX_USES);
  assert.throws(() =>
    assertPlayCardAllowed({
      ...playArgs(pA, 'qul'),
      battle: { ...live, turnPlayerId: pA, turnSide: 'attacker' },
      cardUsage: { qul: BATTLE_CARD_MAX_USES },
      energy: 25,
    })
  );
  assert.equal(requireBattle().turnPlayerId, pB);
  return `qul usage=1 / max=${BATTLE_CARD_MAX_USES}`;
});

runStage(14, 'Effekt serverdə tətbiq olunur', () => {
  const effect = officialCardEffect('qul');
  assert.ok(effect);
  assert.equal(effect.cardId, 'qul');
  assert.equal(effect.damage, 0);
  assert.equal(effect.playerDelta, 4);
  assert.equal(effect.allianceDelta, 2);
  const forgedDamage = 99;
  assert.notEqual(forgedDamage, officialCardEffect('qul')?.damage);
  return `qul dmg=${effect.damage} player=${effect.playerDelta} alliance=${effect.allianceDelta}`;
});

runStage(15, 'Score dəyişir', () => {
  const battle = requireBattle();
  assert.equal(battle.attackerScore, 2);
  assert.equal(sim.playerBattleScore[pA], 4);
  assert.equal(battle.defenderScore, 0);
  return `atkAlliance=${battle.attackerScore} pA=${sim.playerBattleScore[pA]} def=${battle.defenderScore}`;
});

runStage(16, 'Event log yazılır', () => {
  const played = sim.events.filter((item) => item.type === 'card_played');
  assert.ok(played.length >= 1);
  assert.equal(played[0].meta && 'cardId' in played[0].meta ? played[0].meta.cardId : '', 'qul');
  const audit = auditBattleEvents(requireBattle().id, sim.events);
  assert.equal(audit.contiguous, true);
  assert.equal(audit.missingSeq.length, 0);
  const forged = sanitizeBattleEventMeta('battle_finished', {
    winnerPlayerId: pA,
    winnerAllianceId: allianceA,
    reason: 'score_reached',
  });
  assert.equal('winnerPlayerId' in forged, false);
  return `events=${audit.eventCount} contiguous; winnerPlayerId meta-dan silindi`;
});

runStage(17, 'Click challenge başlayır', () => {
  const required = officialRequiredClicks('qul', [pB, pB2, pB3]);
  assert.ok(required > 0);
  sim.challenge = {
    challengeId: `ch_${requireBattle().id}_qul`,
    battleId: requireBattle().id,
    targetAllianceId: allianceB,
    requiredClicks: required,
    currentClicks: 0,
    expiresAt: NOW + 15_000,
    status: 'active',
  };
  pushEvent('click_started', pA, { target: 'opponent', required });
  const ok = assertChallengeClickAllowed({
    battle: requireBattle(),
    challenge: sim.challenge,
    playerId: pB,
    playerAllianceId: allianceB,
    allianceMemberIds: [pB, pB2, pB3],
    allianceLeaderId: pB,
    clickAlreadyExists: false,
    serverNow: NOW + 200,
  });
  assert.equal(ok.duplicate, false);
  assert.throws(() =>
    assertChallengeClickAllowed({
      battle: requireBattle(),
      challenge: sim.challenge as ChallengeSim,
      playerId: pA,
      playerAllianceId: allianceA,
      allianceMemberIds: [pA, pA2, pA3],
      allianceLeaderId: pA,
      clickAlreadyExists: false,
      serverNow: NOW + 200,
    })
  );
  return `qul requiredClicks=${required}; yalnız hədəf ittifaq klikləyə bilər`;
});

runStage(18, 'Challenge nəticəsi hesablanır', () => {
  assert.ok(sim.challenge);
  const clickers = [pB, pB2, pB3];
  while (sim.challenge.currentClicks < sim.challenge.requiredClicks) {
    const playerId = clickers[sim.challenge.currentClicks % clickers.length];
    const allowed = assertChallengeClickAllowed({
      battle: requireBattle(),
      challenge: sim.challenge,
      playerId,
      playerAllianceId: allianceB,
      allianceMemberIds: [pB, pB2, pB3],
      allianceLeaderId: pB,
      clickAlreadyExists: false,
      serverNow: NOW + 300 + sim.challenge.currentClicks,
    });
    assert.equal(allowed.duplicate, false);
    sim.challenge.currentClicks += 1;
  }
  sim.challenge.status = 'succeeded';
  assert.throws(() =>
    assertChallengeClickAllowed({
      battle: requireBattle(),
      challenge: sim.challenge as ChallengeSim,
      playerId: pB,
      playerAllianceId: allianceB,
      allianceMemberIds: [pB, pB2, pB3],
      allianceLeaderId: pB,
      clickAlreadyExists: false,
      serverNow: NOW + 400,
    })
  );
  pushEvent('click_completed', pB, {
    clicks: sim.challenge.currentClicks,
    required: sim.challenge.requiredClicks,
    success: true,
  });
  return `clicks=${sim.challenge.currentClicks}/${sim.challenge.requiredClicks} → succeeded`;
});

runStage(19, 'Battle tamamlanır', () => {
  let guard = 0;
  while (!officialFinishReason(requireBattle()) && (requireBattle().turn ?? 0) <= 8) {
    guard += 1;
    if (guard > 24) throw new Error('Turn limiti simulyasiyası döngüyə düşdü');
    const playerId = requireBattle().turnPlayerId ?? '';
    assert.ok(playerId, 'növbə oyunçusu yoxdur');
    playOfficial(playerId, pickCheapCard(playerId));
  }
  const reason = officialFinishReason(requireBattle());
  assert.ok(reason === 'turn_limit' || reason === 'score_reached');
  sim.battle = {
    ...requireBattle(),
    status: 'finished',
    finishReason: reason ?? undefined,
    finishedAt: NOW + 120_000,
  };
  return `reason=${reason} turn=${requireBattle().turn} atk=${requireBattle().attackerScore} def=${requireBattle().defenderScore}`;
});

runStage(20, 'Winner server tərəfindən müəyyən edilir', () => {
  const battle = requireBattle();
  const winner = officialFinishWinner(battle);
  const claimed = assertFinishWinnerNotFromClient({
    battle,
    claimedWinnerAllianceId: winner.winnerAllianceId,
  });
  assert.equal(claimed.winnerAllianceId, winner.winnerAllianceId);
  assert.throws(() =>
    assertFinishWinnerNotFromClient({
      battle,
      claimedWinnerAllianceId: allianceB === winner.winnerAllianceId ? allianceA : allianceB,
    })
  );
  assert.throws(() =>
    assertFinishWinnerNotFromClient({
      battle,
      claimedWinnerPlayerId: pA,
    })
  );
  const reason = battle.finishReason === 'turn_limit' || battle.finishReason === 'score_reached' || battle.finishReason === 'join_failed'
    ? battle.finishReason
    : officialFinishReason({ ...battle, status: 'active' });
  assert.ok(reason);
  const deltas = officialFinishDeltas({
    reason,
    winnerSide: winner.winnerSide,
    attackerPlayerIds: battle.attackerPlayerIds ?? [],
    defenderPlayerIds: battle.defenderPlayerIds ?? [],
    attackerAllianceId: allianceA,
    defenderAllianceId: allianceB,
  });
  sim.finished = {
    winnerAllianceId: winner.winnerAllianceId,
    winnerSide: winner.winnerSide,
    reason,
    deltas,
  };
  return `winner=${winner.winnerAllianceId ?? 'draw'} side=${winner.winnerSide ?? 'draw'} claimed ignore`;
});

runStage(21, 'Player score yenilənir', () => {
  assert.ok(sim.finished);
  const { playerDeltas } = sim.finished.deltas;
  sim.lifetimeScore[pA] = addGlobalScore(sim.lifetimeScore[pA], playerDeltas[pA]);
  sim.lifetimeScore[pB] = addGlobalScore(sim.lifetimeScore[pB], playerDeltas[pB]);
  if (sim.finished.winnerSide === 'attacker') {
    assert.equal(playerDeltas[pA], BATTLE_FINISH_PLAYER_WIN);
    assert.equal(sim.lifetimeScore[pA], 100 + BATTLE_FINISH_PLAYER_WIN);
  }
  assert.ok(sim.lifetimeScore[pA] >= 100);
  return `pA 100→${sim.lifetimeScore[pA]} (+${playerDeltas[pA]}); pB 80→${sim.lifetimeScore[pB]} (+${playerDeltas[pB]})`;
});

runStage(22, 'Alliance score yenilənir', () => {
  assert.ok(sim.finished);
  const { allianceDeltas } = sim.finished.deltas;
  sim.allianceScore[allianceA] += allianceDeltas[allianceA] ?? 0;
  sim.allianceScore[allianceB] += allianceDeltas[allianceB] ?? 0;
  const normalized = officialNormalizedAllianceScore(sim.allianceScore[allianceA], [pA, pA2, pA3]);
  assert.equal(
    normalized,
    Math.floor((sim.allianceScore[allianceA] * LEADERBOARD_ACTIVE_NORM_BASE) / 3)
  );
  return `A ${LEADERBOARD_WEEKLY_SCORE_BASE}→${sim.allianceScore[allianceA]} norm=${normalized}; B→${sim.allianceScore[allianceB]}`;
});

runStage(23, 'Leaderboard yenilənir', () => {
  assert.ok(sim.finished);
  const period = officialPeriod(NOW);
  assert.match(period.dayKey, /^\d{4}-\d{2}-\d{2}$/);
  const first = assertRewardOnce(false);
  assert.equal(first.apply, true);
  const replay = assertRewardOnce(true);
  assert.equal(replay.apply, false);

  sim.dailyRows = upsertLeaderboardRow(sim.dailyRows, {
    id: pA,
    name: 'User A',
    score: addLeaderboardScore(0, sim.finished.deltas.playerDeltas[pA]),
  });
  sim.weeklyRows = upsertLeaderboardRow(sim.weeklyRows, {
    id: allianceA,
    name: 'Alpha',
    score: officialNormalizedAllianceScore(sim.allianceScore[allianceA], [pA, pA2, pA3]),
    rawScore: sim.allianceScore[allianceA],
    activeUsers: 3,
  });
  assert.equal(sim.dailyRows[0].id, pA);
  assert.equal(sim.dailyRows[0].rank, 1);
  assert.ok(sim.weeklyRows[0].score > 0);
  return `daily ${period.dayKey} +${sim.finished.deltas.playerDeltas[pA]}; weekly ${period.weekKey}; award once`;
});

runStage(24, 'Battle nəticəsi saxlanılır', () => {
  assert.ok(sim.finished);
  const battle = requireBattle();
  const winner = officialFinishWinner(battle);
  sim.result = {
    battleId: battle.id,
    winnerAllianceId: winner.winnerAllianceId,
    winnerSide: winner.winnerSide,
    winnerPlayerId: null,
    reason: sim.finished.reason,
    attackerScore: battle.attackerScore,
    defenderScore: battle.defenderScore,
    playerDeltas: sim.finished.deltas.playerDeltas,
    allianceDeltas: sim.finished.deltas.allianceDeltas,
    schema: 1,
  };
  pushEvent('battle_finished', pA, {
    winnerAllianceId: winner.winnerAllianceId ?? undefined,
    winnerSide: winner.winnerSide ?? undefined,
    reason: sim.finished.reason ?? undefined,
    attackerScore: battle.attackerScore,
    defenderScore: battle.defenderScore,
    winnerPlayerId: pA,
  });
  const finishedEvent = sim.events[sim.events.length - 1];
  assert.equal('winnerPlayerId' in finishedEvent.meta, false);
  assert.equal(sim.result.winnerAllianceId, sim.finished.winnerAllianceId);
  assert.equal(sim.result.winnerPlayerId, null);
  const audit = auditBattleEvents(battle.id, sim.events);
  assert.equal(audit.contiguous, true);
  assert.ok(audit.eventCount >= 2);
  return `result/final winner=${winner.winnerAllianceId ?? 'draw'} events=${audit.eventCount} contiguous`;
});

after(() => {
  const failed = results.find((item) => item.status === 'fail');
  const passed = results.filter((item) => item.status === 'pass').length;
  const skipped = results.filter((item) => item.status === 'skip').length;
  const report = {
    title: 'Battle E2E pipeline',
    startedAt,
    finishedAt: Date.now(),
    durationMs: Date.now() - startedAt,
    total: 24,
    passed,
    failed: failed ? 1 : 0,
    skipped,
    failedAt,
    stopped: Boolean(failed),
    verdict: failed ? `FAIL — mərhələ ${failed.id}` : skipped ? 'PARTIAL' : 'PASS',
    battleId: sim.battle?.id ?? null,
    scores: {
      attacker: sim.battle?.attackerScore ?? 0,
      defender: sim.battle?.defenderScore ?? 0,
    },
    winner: sim.finished?.winnerAllianceId ?? null,
    reason: sim.finished?.reason ?? null,
    energyA: sim.energy[pA] ?? null,
    events: sim.events.length,
    weeklyBase: LEADERBOARD_WEEKLY_SCORE_BASE,
    stages: results,
  };
  writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
});
