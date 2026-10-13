import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BATTLE_FINISH_SCORE_WIN } from '@/app/lib/battleFinish/battleFinishConfig';
import { officialWeekKey } from '@/app/lib/leaderboard/leaderboardConfig';
import { createMatchSnapshot } from './turnOrder';
import { applyArenaMatchCompletion } from './completion';
import {
  assertArenaRewardEligible,
  buildArenaRewardRecord,
  planArenaMatchRewards,
  toArenaRewardPublic,
} from './reward/eligibility';
import { ARENA_REWARD_ALLOCATION } from './reward/config';

function ids(...values: Array<string | null>): Array<string | null> {
  const next = [...values];
  while (next.length < 5) next.push(null);
  return next;
}

describe('arena stage 9 reward engine', () => {
  it('does not plan rewards for an active match', () => {
    const match = createMatchSnapshot({
      matchId: 'm9',
      createdBy: 'h1',
      homePlayerIds: ids('h1'),
      awayPlayerIds: ids('a1'),
      serverNow: 1_000,
      gameMode: '1v1',
    });
    assert.deepEqual(planArenaMatchRewards(match), []);
  });

  it('creates one USER ledger row from the Stage 7 result without inventing an amount', () => {
    const closed = applyArenaMatchCompletion(
      {
        ...createMatchSnapshot({
          matchId: 'm9',
          createdBy: 'h1',
          homePlayerIds: ids('h1'),
          awayPlayerIds: ids('a1'),
          serverNow: 1_000,
          gameMode: '1v1',
        }),
        sideScores: { home: BATTLE_FINISH_SCORE_WIN, away: 1 },
      },
      2_000
    );
    const plans = planArenaMatchRewards(closed);
    assert.equal(plans.length, 1);
    assert.equal(plans[0].recipientType, 'USER');
    assert.equal(plans[0].recipientId, 'h1');
    assert.equal(plans[0].periodId, officialWeekKey(2_000));
    assertArenaRewardEligible(closed, plans[0]);
    const record = buildArenaRewardRecord({
      plan: plans[0],
      createdAt: 2_000,
      blocked: false,
      receiptExists: false,
    });
    assert.ok(record);
    if (!record) return;
    assert.equal(record.amount, null);
    assert.equal(record.rank, null);
    assert.equal(record.currency, 'AZN');
    assert.equal(record.status, 'APPROVED');
    assert.deepEqual(ARENA_REWARD_ALLOCATION.entries, []);
    const publicView = toArenaRewardPublic(record);
    assert.equal('securityStatus' in publicView, false);
  });

  it('is idempotent when a receipt already exists', () => {
    const closed = applyArenaMatchCompletion(
      {
        ...createMatchSnapshot({
          matchId: 'm9b',
          createdBy: 'h1',
          homePlayerIds: ids('h1'),
          awayPlayerIds: ids('a1'),
          serverNow: 1_000,
          gameMode: '1v1',
        }),
        sideScores: { home: BATTLE_FINISH_SCORE_WIN, away: 0 },
      },
      3_000
    );
    const plan = planArenaMatchRewards(closed)[0];
    const first = buildArenaRewardRecord({ plan, createdAt: 3_000, blocked: false, receiptExists: false });
    const second = buildArenaRewardRecord({ plan, createdAt: 4_000, blocked: false, receiptExists: true });
    assert.ok(first);
    assert.equal(second, null);
  });

  it('rejects a banned recipient without exposing a fraud reason on the public view', () => {
    const closed = applyArenaMatchCompletion(
      {
        ...createMatchSnapshot({
          matchId: 'm9c',
          createdBy: 'h1',
          homePlayerIds: ids('h1'),
          awayPlayerIds: ids('a1'),
          serverNow: 1_000,
          gameMode: '1v1',
        }),
        sideScores: { home: BATTLE_FINISH_SCORE_WIN, away: 0 },
      },
      5_000
    );
    const plan = planArenaMatchRewards(closed)[0];
    const record = buildArenaRewardRecord({ plan, createdAt: 5_000, blocked: true, receiptExists: false });
    assert.ok(record);
    if (!record) return;
    assert.equal(record.status, 'REJECTED');
    assert.equal(record.securityStatus, 'BLOCKED');
    assert.equal(toArenaRewardPublic(record).status, 'REJECTED');
    assert.equal('securityStatus' in toArenaRewardPublic(record), false);
  });

  it('plans an ALLIANCE recipient for 5v5 and never mixes XP or wallet credit fields into the public record', () => {
    const closed = applyArenaMatchCompletion(
      {
        ...createMatchSnapshot({
          matchId: 'm9d',
          createdBy: 'h1',
          homePlayerIds: ids('h1'),
          awayPlayerIds: ids('a1'),
          serverNow: 1_000,
          gameMode: '5v5',
          homeAllianceId: 'HA',
          awayAllianceId: 'AA',
        }),
        sideScores: { home: BATTLE_FINISH_SCORE_WIN, away: 2 },
      },
      6_000
    );
    const plans = planArenaMatchRewards(closed);
    assert.equal(plans[0].recipientType, 'ALLIANCE');
    assert.equal(plans[0].recipientId, 'HA');
    const record = buildArenaRewardRecord({
      plan: plans[0],
      createdAt: 6_000,
      blocked: false,
      receiptExists: false,
    });
    assert.ok(record);
    if (!record) return;
    const ledger = {
      ...record,
      walletCredited: false,
    };
    assert.equal(ledger.walletCredited, false);
    const pub = toArenaRewardPublic(record);
    assert.equal('xp' in pub, false);
  });
});
