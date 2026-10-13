import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BATTLE_FINISH_SCORE_WIN } from '@/app/lib/battleFinish/battleFinishConfig';
import { createMatchSnapshot } from './turnOrder';
import { applyArenaMatchCompletion } from './completion';
import { buildArenaRewardRecord, planArenaMatchRewards, toArenaRewardPublic } from './reward/eligibility';
import { resolveArenaRewardPayoutCheck } from './reward/payoutCheck';
import type { ArenaRewardRecord } from './reward/types';

function ids(...values: Array<string | null>): Array<string | null> {
  const next = [...values];
  while (next.length < 5) next.push(null);
  return next;
}

function matchReward(): ArenaRewardRecord {
  const closed = applyArenaMatchCompletion(
    {
      ...createMatchSnapshot({
        matchId: 'm11',
        createdBy: 'h1',
        homePlayerIds: ids('h1'),
        awayPlayerIds: ids('a1'),
        serverNow: 1_000,
        gameMode: '1v1',
      }),
      sideScores: { home: BATTLE_FINISH_SCORE_WIN, away: 0 },
    },
    2_000
  );
  const record = buildArenaRewardRecord({
    plan: planArenaMatchRewards(closed)[0],
    createdAt: 2_000,
    blocked: false,
    receiptExists: false,
  });
  assert.ok(record);
  return record as ArenaRewardRecord;
}

describe('arena stage 11 payout check', () => {
  it('does not approve a reward from an open period', () => {
    const record = matchReward();
    const decision = resolveArenaRewardPayoutCheck({
      record,
      periodClosed: false,
      rankingRow: null,
      recipientExists: true,
      recipientBanned: false,
      recipientFrozen: false,
      countryCode: 'AZ',
    });
    assert.equal(decision.apply, false);
    assert.equal(record.payoutReady, false);
    assert.equal(record.payoutCheckStatus, null);
  });

  it('approves a Stage 9 match reward only after the period is closed', () => {
    const record = matchReward();
    const decision = resolveArenaRewardPayoutCheck({
      record,
      periodClosed: true,
      rankingRow: null,
      recipientExists: true,
      recipientBanned: false,
      recipientFrozen: false,
      countryCode: 'AZ',
    });
    assert.equal(decision.apply, true);
    if (!decision.apply) return;
    assert.equal(decision.payoutCheckStatus, 'APPROVED');
    assert.equal(decision.payoutReady, true);
    const pub = toArenaRewardPublic({
      ...record,
      payoutCheckStatus: decision.payoutCheckStatus,
      payoutReady: decision.payoutReady,
      payoutCheckedAt: 3_000,
    });
    assert.equal(pub.payoutReady, true);
    assert.equal('securityStatus' in pub, false);
  });

  it('is idempotent once a payout check already exists', () => {
    const record = { ...matchReward(), payoutCheckStatus: 'APPROVED' as const, payoutReady: true, payoutCheckedAt: 1 };
    const again = resolveArenaRewardPayoutCheck({
      record,
      periodClosed: true,
      rankingRow: null,
      recipientExists: true,
      recipientBanned: false,
      recipientFrozen: false,
      countryCode: 'AZ',
    });
    assert.equal(again.apply, false);
  });

  it('does not convert REVIEW into APPROVED', () => {
    const record = { ...matchReward(), payoutCheckStatus: 'REVIEW' as const, payoutReady: false, payoutCheckedAt: 1 };
    const again = resolveArenaRewardPayoutCheck({
      record,
      periodClosed: true,
      rankingRow: null,
      recipientExists: true,
      recipientBanned: false,
      recipientFrozen: false,
      countryCode: 'AZ',
    });
    assert.equal(again.apply, false);
  });

  it('blocks a banned recipient and holds a frozen recipient for review', () => {
    const record = matchReward();
    const banned = resolveArenaRewardPayoutCheck({
      record,
      periodClosed: true,
      rankingRow: null,
      recipientExists: true,
      recipientBanned: true,
      recipientFrozen: false,
      countryCode: 'AZ',
    });
    assert.equal(banned.apply, true);
    if (banned.apply) {
      assert.equal(banned.payoutCheckStatus, 'BLOCKED');
      assert.equal(banned.payoutReady, false);
    }
    const frozen = resolveArenaRewardPayoutCheck({
      record,
      periodClosed: true,
      rankingRow: null,
      recipientExists: true,
      recipientBanned: false,
      recipientFrozen: true,
      countryCode: 'AZ',
    });
    assert.equal(frozen.apply, true);
    if (frozen.apply) {
      assert.equal(frozen.payoutCheckStatus, 'REVIEW');
      assert.equal(frozen.payoutReady, false);
    }
  });

  it('blocks weekly rewards that do not match finalized rank, country, or configured amount', () => {
    const weekly: ArenaRewardRecord = {
      ...matchReward(),
      sourceType: 'WEEKLY_RANKING',
      rewardType: 'WEEKLY_RANKING',
      recipientType: 'ALLIANCE',
      recipientId: 'HA',
      matchId: '',
      sourceId: '2026-09-28',
      periodId: '2026-09-28',
      rank: 1,
      amount: 10,
    };
    const missingRank = resolveArenaRewardPayoutCheck({
      record: weekly,
      periodClosed: true,
      rankingRow: null,
      recipientExists: true,
      recipientBanned: false,
      recipientFrozen: false,
      countryCode: 'AZ',
    });
    assert.equal(missingRank.apply, true);
    if (missingRank.apply) assert.equal(missingRank.payoutCheckStatus, 'BLOCKED');
    const country = resolveArenaRewardPayoutCheck({
      record: weekly,
      periodClosed: true,
      rankingRow: { id: 'HA', rank: 1 },
      recipientExists: true,
      recipientBanned: false,
      recipientFrozen: false,
      countryCode: 'TR',
    });
    assert.equal(country.apply, true);
    if (country.apply) assert.equal(country.payoutCheckStatus, 'BLOCKED');
    const noConfig = resolveArenaRewardPayoutCheck({
      record: weekly,
      periodClosed: true,
      rankingRow: { id: 'HA', rank: 1 },
      recipientExists: true,
      recipientBanned: false,
      recipientFrozen: false,
      countryCode: 'AZ',
    });
    assert.equal(noConfig.apply, true);
    if (noConfig.apply) {
      assert.equal(noConfig.payoutCheckStatus, 'BLOCKED');
      assert.equal(noConfig.payoutReady, false);
    }
  });

  it('never marks a ledger row as wallet credited', () => {
    const record = matchReward();
    assert.equal('walletCredited' in record, false);
    assert.equal(record.payoutReady, false);
  });
});
