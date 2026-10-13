import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyOfficialPlayScores,
  assertChallengeClickAllowed,
  assertFinishWinnerNotFromClient,
  assertPlayCardAllowed,
  assertReconnectSnapshot,
  assertRewardOnce,
  assertScoreFromOfficialResult,
  assertServerClockNotClient,
  assertTurnTimeoutAllowed,
  fixtureBattle,
  inFlightReplay,
  officialClickNeed,
  officialPlayCardId,
} from './battleSecurityPolicy';
import { BATTLE_CARD_MAX_USES } from '@/app/lib/battlePlay/battlePlayConfig';
import { BATTLE_ENERGY_MAX, officialCardEnergyCost } from '@/app/lib/battleEnergy/battleEnergyConfig';
import { officialCardEffect, addOfficialScore, BATTLE_DAMAGE_MAX } from '@/app/lib/battleScore/battleScoreConfig';
import { officialFinishWinner, officialFinishDeltas } from '@/app/lib/battleFinish/battleFinishConfig';
import { addLeaderboardScore, LEADERBOARD_AWARD_MAX } from '@/app/lib/leaderboard/leaderboardConfig';
import { sanitizeBattleEventMeta, sanitizeBattleId } from '@/app/lib/battleEventLog/sanitizeBattleEventMeta';

const NOW = 1_007_000;
const PLAY = {
  uid: 'u1',
  playerId: 'p1',
  cardId: 'qaya',
  expectedStateVersion: 2,
  expectedEventSeq: 4,
  handIds: ['qaya', 'casus', 'duman', 'ogru', 'joker'],
  energy: 25,
  cardUsage: {} as Record<string, number>,
  cooldownUntil: {} as Record<string, number>,
  serverNow: NOW,
};

function play(overrides: Record<string, unknown> = {}) {
  return assertPlayCardAllowed({
    battle: fixtureBattle(),
    ...PLAY,
    ...overrides,
  } as Parameters<typeof assertPlayCardAllowed>[0]);
}

describe('battle security audit', () => {
  describe('double click', () => {
    it('in-flight eyni play açarını bir Promise-ə bağlayır', async () => {
      let runs = 0;
      const work = () =>
        inFlightReplay('play:bat_audit_1:req1', async () => {
          runs += 1;
          await new Promise((resolve) => setTimeout(resolve, 20));
          return runs;
        });
      const [a, b] = await Promise.all([work(), work()]);
      assert.equal(a, 1);
      assert.equal(b, 1);
      assert.equal(runs, 1);
    });

    it('eyni uid ikinci klik-i duplicate sayır', () => {
      const out = assertChallengeClickAllowed({
        battle: fixtureBattle(),
        challenge: {
          challengeId: 'ch1',
          battleId: 'bat_audit_1',
          targetAllianceId: 'a2',
          requiredClicks: 3,
          currentClicks: 0,
          expiresAt: NOW + 5_000,
          status: 'active',
        },
        playerId: 'p3',
        playerAllianceId: 'a2',
        allianceMemberIds: ['p3'],
        allianceLeaderId: 'p3',
        clickAlreadyExists: true,
        serverNow: NOW,
      });
      assert.equal(out.duplicate, true);
    });
  });

  describe('duplicate request', () => {
    it('mövcud receipt enerji/xal təkrar yazmır', () => {
      const out = play({ receiptExists: true });
      assert.equal(out.duplicate, true);
      const reward = assertRewardOnce(true);
      assert.equal(reward.apply, false);
    });
  });

  describe('replay request', () => {
    it('bitmiş request yenidən gələndə reward tətbiq olunmur', () => {
      const first = assertRewardOnce(false);
      const replay = assertRewardOnce(true);
      assert.equal(first.apply, true);
      assert.equal(replay.apply, false);
      assert.equal(replay.duplicate, true);
    });
  });

  describe('dəyişdirilmiş card ID', () => {
    it('hovuzda olmayan ID-ni rədd edir', () => {
      assert.throws(() => officialPlayCardId('hack_card'), /hovuzunda yoxdur/);
      assert.throws(() => play({ cardId: 'nuke' }), /hovuzunda yoxdur/);
      assert.throws(() => play({ cardId: 1 }), /hovuzunda yoxdur/);
    });

    it('əldə olmayan rəsmi kartı rədd edir', () => {
      assert.throws(() => play({ cardId: 'usyan' }), /5-likdə yoxdur/);
    });
  });

  describe('saxta energy', () => {
    it('client energy sahəsini qəbul etmir', () => {
      assert.throws(() => play({ claimedEnergy: 999 }), /Saxta energy/);
      const official = officialCardEnergyCost('qaya');
      assert.equal(official, 5);
      const ok = play({ energy: 25, claimedEnergy: 25 });
      assert.equal(ok.cost, official);
      assert.equal(ok.energyAfter, 20);
    });
  });

  describe('saxta score', () => {
    it('kart xalı yalnız rəsmi cədvəldən gəlir', () => {
      assert.throws(() => play({ claimedScore: 999 }), /Saxta score/);
      const effect = officialCardEffect('qaya');
      assert.ok(effect);
      const applied = applyOfficialPlayScores({
        battle: fixtureBattle(),
        playerId: 'p1',
        effect,
        playerScore: 0,
      });
      assert.equal(applied.playerDelta, effect.playerDelta);
      assert.throws(() => addOfficialScore(0, 999, 10), /Qeyri-real/);
    });
  });

  describe('saxta damage', () => {
    it('client damage-i rədd edir, rəsmi damage cap-dən böyük ola bilməz', () => {
      assert.throws(() => play({ claimedDamage: 99 }), /Saxta damage/);
      const effect = officialCardEffect('qaya');
      assert.ok(effect);
      assert.ok(effect.damage <= BATTLE_DAMAGE_MAX);
      assert.notEqual(effect.damage, 99);
    });
  });

  describe('saxta winner', () => {
    it('winner yalnız battle score-dan hesablanır', () => {
      const battle = fixtureBattle({ attackerScore: 12, defenderScore: 40 });
      assert.throws(
        () =>
          assertFinishWinnerNotFromClient({
            battle,
            claimedWinnerSide: 'attacker',
            claimedWinnerAllianceId: 'a1',
          }),
        /Saxta winner/
      );
      const official = officialFinishWinner(battle);
      assert.equal(official.winnerSide, 'defender');
      assert.equal(official.winnerAllianceId, 'a2');
      assert.throws(
        () => assertFinishWinnerNotFromClient({ battle, claimedWinnerPlayerId: 'p1' }),
        /Saxta winner/
      );
    });
  });

  describe('expired timer manipulation', () => {
    it('vaxt bitməmiş timeout rədd edilir', () => {
      assert.throws(
        () =>
          assertTurnTimeoutAllowed({
            battle: fixtureBattle(),
            playerId: 'p1',
            expectedStateVersion: 2,
            serverNow: NOW,
          }),
        /Növbə hələ bitməyib/
      );
    });

    it('vaxt bitəndən sonra kart oynamaq rədd edilir', () => {
      assert.throws(() => play({ serverNow: 1_000_000 + 15_000 }), /Növbə vaxtı bitib/);
    });

    it('vaxt bitəndə timeout icazəlidir', () => {
      assert.doesNotThrow(() =>
        assertTurnTimeoutAllowed({
          battle: fixtureBattle(),
          playerId: 'p1',
          expectedStateVersion: 2,
          serverNow: 1_000_000 + 15_000,
        })
      );
    });
  });

  describe('client clock manipulation', () => {
    it('client saatı server saatını əvəz edə bilməz', () => {
      const server = assertServerClockNotClient(NOW, NOW + 3_600_000);
      assert.equal(server, NOW);
      assert.throws(() => play({ serverNow: 0 }), /Server saatı yoxdur/);
      assert.throws(
        () =>
          assertTurnTimeoutAllowed({
            battle: fixtureBattle({ turnStartAt: 1, turnDurationMs: 15_000 }),
            playerId: 'p1',
            expectedStateVersion: 2,
            serverNow: 0,
          }),
        /Server saatı yoxdur/
      );
    });
  });

  describe('battle ID manipulation', () => {
    it('boş və yad battle ID-ni rədd edir', () => {
      assert.throws(() => sanitizeBattleId(''), /battle ID/);
      assert.throws(
        () =>
          assertReconnectSnapshot({
            hintedBattleId: 'bat_stolen',
            liveBattle: fixtureBattle(),
            playerId: 'p1',
          }),
        /Battle ID uyğun gəlmir/
      );
    });
  });

  describe('başqa istifadəçinin battle-a giriş', () => {
    it('iştirakçı olmayan oyunçunu rədd edir', () => {
      assert.throws(() => play({ playerId: 'p99', uid: 'u99' }), /döyüşdə deyilsən/);
    });

    it('uid slot-a uyğun gəlmirsə rədd edir', () => {
      assert.throws(() => play({ uid: 'stolen_uid' }), /loadout-u deyil/);
    });
  });

  describe('başqa alliance adına request', () => {
    it('hədəf ittifaqdan olmayan klik rədd edilir', () => {
      assert.throws(
        () =>
          assertChallengeClickAllowed({
            battle: fixtureBattle(),
            challenge: {
              challengeId: 'ch1',
              battleId: 'bat_audit_1',
              targetAllianceId: 'a2',
              requiredClicks: 3,
              currentClicks: 0,
              expiresAt: NOW + 5_000,
              status: 'active',
            },
            playerId: 'p1',
            playerAllianceId: 'a1',
            allianceMemberIds: ['p1'],
            allianceLeaderId: 'p1',
            clickAlreadyExists: false,
            serverNow: NOW,
          }),
        /hədəf ittifaq/
      );
    });
  });

  describe('eyni kartı 3 dəfədən çox oynamaq', () => {
    it('4-cü istifadəni rədd edir', () => {
      assert.equal(BATTLE_CARD_MAX_USES, 3);
      assert.throws(() => play({ cardUsage: { qaya: 3 } }), /3 istifadəyə/);
      const third = play({ cardUsage: { qaya: 2 } });
      assert.equal(third.usageAfter, 3);
    });
  });

  describe('25 energy-dən artıq istifadə', () => {
    it('energy 25-dən yuxarı ola bilməz və cost-dan az qalıq rədd edilir', () => {
      assert.equal(BATTLE_ENERGY_MAX, 25);
      assert.throws(() => play({ energy: 4, cardId: 'qaya' }), /Kifayət qədər energy/);
      const ok = play({ energy: 5 });
      assert.ok(ok.energyAfter <= BATTLE_ENERGY_MAX);
      assert.ok(ok.energyAfter >= 0);
    });
  });

  describe('battle bitdikdən sonra card play', () => {
    it('finished battle-da play rədd edilir', () => {
      assert.throws(() => play({ battle: fixtureBattle({ status: 'finished' }) }), /aktiv deyil/);
    });
  });

  describe('challenge bitdikdən sonra click', () => {
    it('expired və succeeded challenge-ə klik rədd edilir', () => {
      const base = {
        battle: fixtureBattle(),
        playerId: 'p3',
        playerAllianceId: 'a2',
        allianceMemberIds: ['p3'],
        allianceLeaderId: 'p3',
        clickAlreadyExists: false,
        serverNow: NOW,
      };
      assert.throws(
        () =>
          assertChallengeClickAllowed({
            ...base,
            challenge: {
              challengeId: 'ch1',
              battleId: 'bat_audit_1',
              targetAllianceId: 'a2',
              requiredClicks: 3,
              currentClicks: 3,
              expiresAt: NOW + 5_000,
              status: 'succeeded',
            },
          }),
        /bitib/
      );
      assert.throws(
        () =>
          assertChallengeClickAllowed({
            ...base,
            challenge: {
              challengeId: 'ch1',
              battleId: 'bat_audit_1',
              targetAllianceId: 'a2',
              requiredClicks: 3,
              currentClicks: 1,
              expiresAt: NOW - 1,
              status: 'active',
            },
          }),
        /bitib/
      );
    });
  });

  describe('refresh zamanı duplicate reward', () => {
    it('finish/leaderboard receipt varsa ikinci mükafat yoxdur', () => {
      const refresh = assertRewardOnce(true);
      assert.equal(refresh.apply, false);
      assert.throws(() => addLeaderboardScore(10, LEADERBOARD_AWARD_MAX + 1), /yanlışdır/);
      const deltas = officialFinishDeltas({
        reason: 'score_reached',
        winnerSide: 'defender',
        attackerPlayerIds: ['p1'],
        defenderPlayerIds: ['p2'],
        attackerAllianceId: 'a1',
        defenderAllianceId: 'a2',
      });
      assert.equal(deltas.playerDeltas.p2, 8);
      assert.equal(deltas.allianceDeltas.a2, 6);
    });
  });

  describe('reconnect zamanı state manipulation', () => {
    it('client energy/score/timer snapshot-u əvəz etmir', () => {
      const snap = assertReconnectSnapshot({
        hintedBattleId: 'bat_audit_1',
        liveBattle: fixtureBattle({ attackerScore: 7, defenderScore: 2 }),
        playerId: 'p1',
        claimedEnergy: 30,
        claimedScore: 999,
        claimedTimerEnd: 1,
      });
      assert.equal(snap.attackerScore, 7);
      assert.equal(snap.defenderScore, 2);
      assert.equal(snap.energy, null);
      assert.throws(
        () =>
          assertReconnectSnapshot({
            hintedBattleId: 'bat_audit_1',
            liveBattle: fixtureBattle(),
            playerId: 'p99',
          }),
        /döyüşdə deyilsən/
      );
    });
  });

  describe('event meta sanitization', () => {
    it('winnerPlayerId və naməlum sahələri kəsir', () => {
      const meta = sanitizeBattleEventMeta('battle_finished', {
        winnerPlayerId: 'p1',
        winnerAllianceId: 'a2',
        reason: 'score_reached',
        extraHack: 'x',
      } as never);
      assert.equal((meta as { winnerPlayerId?: string }).winnerPlayerId, undefined);
      assert.equal((meta as { extraHack?: string }).extraHack, undefined);
      assert.equal(meta.winnerAllianceId, 'a2');
    });
  });

  describe('authorization / yad battle', () => {
    it('yad uid slot-u və yad alliance klikini rədd edir', () => {
      assert.throws(() => play({ uid: 'u-other' }), /loadout-u deyil/);
      assert.throws(
        () =>
          assertChallengeClickAllowed({
            battle: fixtureBattle(),
            challenge: {
              challengeId: 'ch1',
              battleId: 'bat_audit_1',
              targetAllianceId: 'a2',
              requiredClicks: 3,
              currentClicks: 0,
              expiresAt: NOW + 5_000,
              status: 'active',
            },
            playerId: 'p1',
            playerAllianceId: 'a9',
            allianceMemberIds: ['p9'],
            allianceLeaderId: 'p9',
            clickAlreadyExists: false,
            serverNow: NOW,
          }),
        /hədəf ittifaq|üzvü/
      );
    });
  });

  describe('click required client-dən gəlmir', () => {
    it('required klik sayı server bandındandır', () => {
      assert.equal(officialClickNeed('qul', new Array(3).fill('m')), 3);
      assert.equal(officialClickNeed('usyan', new Array(3).fill('m')), 6);
      assert.equal(officialClickNeed('qaya', new Array(3).fill('m')), 0);
    });
  });

  describe('player/alliance score yalnız result-dan', () => {
    it('battle-sız və saxta delta rədd edilir', () => {
      assert.throws(() => assertScoreFromOfficialResult({
        lastScoreBattleId: '',
        claimedDelta: 8,
        officialDelta: 8,
        maxDelta: 8,
      }), /battle ID/);
      assert.throws(() => assertScoreFromOfficialResult({
        lastScoreBattleId: 'bat_fin_1',
        previousBattleId: 'bat_fin_1',
        claimedDelta: 8,
        officialDelta: 8,
        maxDelta: 8,
      }), /Təkrar/);
      assert.throws(() => assertScoreFromOfficialResult({
        lastScoreBattleId: 'bat_fin_1',
        claimedDelta: 8,
        officialDelta: 2,
        maxDelta: 8,
      }), /Saxta score/);
      const ok = assertScoreFromOfficialResult({
        lastScoreBattleId: 'bat_fin_1',
        claimedDelta: 2,
        officialDelta: 2,
        maxDelta: 8,
      });
      assert.equal(ok.delta, 2);
    });
  });

  describe('click_completed challenge-ə bağlıdır', () => {
    it('requestId saxlanır, naməlum sahə kəsilir', () => {
      const meta = sanitizeBattleEventMeta('click_completed', {
        clicks: 3,
        required: 3,
        success: true,
        requestId: 'enr_play_1',
        winnerPlayerId: 'p1',
      } as never);
      assert.equal(meta.requestId, 'enr_play_1');
      assert.equal((meta as { winnerPlayerId?: string }).winnerPlayerId, undefined);
    });
  });
});
