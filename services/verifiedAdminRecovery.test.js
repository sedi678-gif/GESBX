const test = require('node:test');
const assert = require('node:assert/strict');
const { isVerifiedAdminRecovery } = require('./verifiedAdminRecovery');

test('permits recovery only for the verified configured Firebase admin email', () => {
  assert.equal(isVerifiedAdminRecovery({ email: 'nebiyevsedi18@gmail.com', emailVerified: true }), true);
  assert.equal(isVerifiedAdminRecovery({ email: 'NEBIYEVSEDI18@GMAIL.COM', emailVerified: true }), true);
  assert.equal(isVerifiedAdminRecovery({ email: 'nebiyevsedi18@gmail.com', emailVerified: false }), false);
  assert.equal(isVerifiedAdminRecovery({ email: 'other@example.com', emailVerified: true }), false);
});
