const test = require('node:test');
const assert = require('node:assert/strict');
const { parseAdminUidAllowlist, isConfiguredAdminUid } = require('../src/adminAllowlist');

test('admin UID allowlist parses comma, whitespace, and semicolon separators', () => {
  assert.deepEqual(parseAdminUidAllowlist('uid-a, uid-b\nuid-c;uid-d'), ['uid-a', 'uid-b', 'uid-c', 'uid-d']);
});

test('configured admin UID check matches exact UID only', () => {
  assert.equal(isConfiguredAdminUid('uid-b', 'uid-a,uid-b'), true);
  assert.equal(isConfiguredAdminUid('uid-b-extra', 'uid-a,uid-b'), false);
  assert.equal(isConfiguredAdminUid('', 'uid-a,uid-b'), false);
  assert.equal(isConfiguredAdminUid('uid-a', ''), false);
});
