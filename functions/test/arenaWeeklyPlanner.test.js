const test = require('node:test');
const assert = require('node:assert/strict');
const { planWeeklyRewards } = require('../src/arenaWeeklyPlanner');

const board = {
  kind: 'weekly',
  periodKey: '2026-10-05',
  status: 'closed',
  rows: [
    { id: 'alliance-a', rank: 1, name: 'A', score: 100 },
    { id: 'alliance-b', rank: 2, name: 'B', score: 50 },
  ],
};
const allocation = { entries: [
  { countryCode: 'AZ', recipientType: 'ALLIANCE', rank: 1, amount: 10, currency: 'AZN' },
  { countryCode: 'AZ', recipientType: 'ALLIANCE', rank: 2, amount: 5, currency: 'AZN' },
] };

test('plans the configured closed-week ranks using server board rows', () => {
  const plans = planWeeklyRewards(board, allocation);
  assert.deepEqual(plans.map(({ rank, recipientId, amount }) => ({ rank, recipientId, amount })), [
    { rank: 1, recipientId: 'alliance-a', amount: 10 },
    { rank: 2, recipientId: 'alliance-b', amount: 5 },
  ]);
  assert.equal(plans[0].rewardType, 'WEEKLY_RANKING');
  assert.equal(plans[0].currency, 'AZN');
});

test('does not plan rewards for open boards, other countries, or unconfigured ranks', () => {
  assert.deepEqual(planWeeklyRewards({ ...board, status: 'open' }, allocation), []);
  assert.deepEqual(planWeeklyRewards(board, allocation, 'TR'), []);
  assert.deepEqual(planWeeklyRewards(board, { entries: [] }), []);
});

test('ignores invalid allocations and malformed or duplicate recipients', () => {
  const plans = planWeeklyRewards({
    ...board,
    rows: [
      { id: 'alliance-a', rank: 1 },
      { id: 'alliance-a', rank: 1 },
      { id: 'bad/id', rank: 1 },
    ],
  }, { entries: [...allocation.entries, { countryCode: 'AZ', recipientType: 'ALLIANCE', rank: 3, amount: -1, currency: 'AZN' }] });
  assert.equal(plans.length, 1);
  assert.equal(plans[0].recipientId, 'alliance-a');
});

test('rejects conflicting allocations for the same rank', () => {
  assert.throws(() => planWeeklyRewards(board, {
    entries: [
      allocation.entries[0],
      { countryCode: 'AZ', recipientType: 'ALLIANCE', rank: 1, amount: 20, currency: 'AZN' },
    ],
  }), /Duplicate weekly reward allocation/);
});
