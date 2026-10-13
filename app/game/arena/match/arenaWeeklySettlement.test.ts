import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  previousOfficialWeekKey,
  type LeaderboardBoard,
} from '@/app/lib/leaderboard/leaderboardConfig';
import {
  ARENA_REWARD_ALLOCATION,
  ARENA_REWARD_COUNTRY_CODE,
  lookupArenaRewardAllocation,
} from './reward/config';
import {
  arenaRewardId,
  assertWeeklyArenaRewardEligible,
  buildArenaRewardRecord,
  planWeeklyRankingRewards,
  toArenaRewardPublic,
} from './reward/eligibility';
import type { ArenaRewardAllocationTable } from './reward/types';

function closedWeekly(rows: LeaderboardBoard['rows']): LeaderboardBoard {
  return {
    kind: 'weekly',
    periodKey: '2026-09-28',
    timezone: 'Asia/Baku',
    status: 'closed',
    rows,
    version: 1,
    updatedAt: 1,
  };
}

describe('arena stage 10 weekly settlement', () => {
  it('does not invent weekly amounts when the allocation table is empty', () => {
    assert.deepEqual(ARENA_REWARD_ALLOCATION.entries, []);
    assert.equal(
      lookupArenaRewardAllocation({
        countryCode: ARENA_REWARD_COUNTRY_CODE,
        recipientType: 'ALLIANCE',
        rank: 1,
      }),
      null
    );
    const plans = planWeeklyRankingRewards({
      board: closedWeekly([{ id: 'HA', rank: 1, name: 'Home', score: 40 }]),
    });
    assert.deepEqual(plans, []);
  });

  it('skips an open weekly board', () => {
    const table: ArenaRewardAllocationTable = {
      entries: [
        {
          countryCode: 'AZ',
          recipientType: 'ALLIANCE',
          rank: 1,
          amount: 10,
          currency: 'AZN',
        },
      ],
    };
    const plans = planWeeklyRankingRewards({
      board: { ...closedWeekly([{ id: 'HA', rank: 1, name: 'Home', score: 40 }]), status: 'open' },
      table,
    });
    assert.deepEqual(plans, []);
  });

  it('allocates an ALLIANCE weekly reward from server rank and existing config only', () => {
    const table: ArenaRewardAllocationTable = {
      entries: [
        {
          countryCode: 'AZ',
          recipientType: 'ALLIANCE',
          rank: 1,
          amount: 10,
          currency: 'AZN',
        },
        {
          countryCode: 'TR',
          recipientType: 'ALLIANCE',
          rank: 1,
          amount: 99,
          currency: 'AZN',
        },
      ],
    };
    const board = closedWeekly([
      { id: 'HA', rank: 1, name: 'Home', score: 40 },
      { id: 'AA', rank: 2, name: 'Away', score: 10 },
    ]);
    const plans = planWeeklyRankingRewards({ board, countryCode: 'AZ', table });
    assert.equal(plans.length, 1);
    assert.equal(plans[0].recipientType, 'ALLIANCE');
    assert.equal(plans[0].recipientId, 'HA');
    assert.equal(plans[0].countryCode, 'AZ');
    assert.equal(plans[0].rank, 1);
    assert.equal(plans[0].amount, 10);
    assert.equal(plans[0].sourceType, 'WEEKLY_RANKING');
    assert.equal(plans[0].periodId, '2026-09-28');
    assertWeeklyArenaRewardEligible(board, plans[0], table);
    const record = buildArenaRewardRecord({
      plan: plans[0],
      createdAt: 9_000,
      blocked: false,
      receiptExists: false,
    });
    assert.ok(record);
    if (!record) return;
    assert.equal(record.status, 'APPROVED');
    assert.equal(toArenaRewardPublic(record).amount, 10);
    assert.equal('securityStatus' in toArenaRewardPublic(record), false);
    assert.equal('xp' in toArenaRewardPublic(record), false);
    const again = buildArenaRewardRecord({
      plan: plans[0],
      createdAt: 9_001,
      receiptExists: true,
      blocked: false,
    });
    assert.equal(again, null);
    assert.equal(arenaRewardId(plans[0]).includes('WEEKLY_RANKING'), true);
  });

  it('does not treat a USER config row as an alliance weekly reward', () => {
    const table: ArenaRewardAllocationTable = {
      entries: [
        {
          countryCode: 'AZ',
          recipientType: 'USER',
          rank: 1,
          amount: 5,
          currency: 'AZN',
        },
      ],
    };
    const plans = planWeeklyRankingRewards({
      board: closedWeekly([{ id: 'HA', rank: 1, name: 'Home', score: 40 }]),
      table,
    });
    assert.deepEqual(plans, []);
  });

  it('keeps country pools separate', () => {
    const table: ArenaRewardAllocationTable = {
      entries: [
        {
          countryCode: 'AZ',
          recipientType: 'ALLIANCE',
          rank: 1,
          amount: 10,
          currency: 'AZN',
        },
      ],
    };
    const az = planWeeklyRankingRewards({
      board: closedWeekly([{ id: 'HA', rank: 1, name: 'Home', score: 40 }]),
      countryCode: 'AZ',
      table,
    });
    const tr = planWeeklyRankingRewards({
      board: closedWeekly([{ id: 'HA', rank: 1, name: 'Home', score: 40 }]),
      countryCode: 'TR',
      table,
    });
    assert.equal(az.length, 1);
    assert.equal(tr.length, 0);
  });

  it('derives the previous official week from the existing period key', () => {
    assert.equal(previousOfficialWeekKey('2026-10-05'), '2026-09-28');
  });
});
