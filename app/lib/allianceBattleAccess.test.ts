import assert from 'node:assert/strict';
import test from 'node:test';
import { canReuseActiveAllianceBattle, canStartAllianceBattle } from './allianceBattleAccess';

test('only the alliance leader and promoted assistant leaders can start an attack', () => {
  const alliance = { leaderId: '10', assistantLeaderIds: ['20'] };
  assert.equal(canStartAllianceBattle(alliance, '10'), true);
  assert.equal(canStartAllianceBattle(alliance, '20'), true);
  assert.equal(canStartAllianceBattle(alliance, '30'), false);
});

test('a duplicate start request reuses the same live battle in every live phase', () => {
  for (const status of ['joining', 'locked', 'active']) {
    assert.equal(canReuseActiveAllianceBattle({
      status,
      attackerAllianceId: 'a',
      defenderAllianceId: 'b',
      requestedAttackerAllianceId: 'a',
      requestedDefenderAllianceId: 'b',
      arenaClosed: false,
    }), true);
  }
});

test('a different or closed battle is never reused', () => {
  const base = {
    status: 'active',
    attackerAllianceId: 'a',
    defenderAllianceId: 'b',
    requestedAttackerAllianceId: 'a',
    requestedDefenderAllianceId: 'b',
    arenaClosed: false,
  };
  assert.equal(canReuseActiveAllianceBattle({ ...base, requestedDefenderAllianceId: 'c' }), false);
  assert.equal(canReuseActiveAllianceBattle({ ...base, arenaClosed: true }), false);
});
