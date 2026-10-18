const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { makeToken04 } = require('../src/zegoTokenFormat');

test('Zego Token04 uses the documented version, expiry, IV, and AES-CBC payload layout', () => {
  const appId = 1347665418;
  const secret = '0123456789abcdef0123456789abcdef';
  const userId = 'user_123';
  const roomId = 'room_456';
  const now = 1_800_000_000;
  const token = makeToken04(appId, secret, userId, roomId, now, 3600);

  assert.equal(token.slice(0, 2), '04');
  const bytes = Buffer.from(token.slice(2), 'base64');
  assert.equal(Number(bytes.readBigInt64BE(0)), now + 3600);
  let offset = 8;
  const ivLength = bytes.readUInt16BE(offset); offset += 2;
  assert.equal(ivLength, 16);
  const iv = bytes.subarray(offset, offset + ivLength); offset += ivLength;
  const encryptedLength = bytes.readUInt16BE(offset); offset += 2;
  assert.equal(bytes.length, offset + encryptedLength);
  const encrypted = bytes.subarray(offset);
  const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(secret), iv);
  const payload = JSON.parse(Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8'));
  assert.equal(payload.app_id, appId);
  assert.equal(payload.user_id, userId);
  assert.equal(payload.ctime, now);
  assert.equal(payload.expire, now + 3600);
  assert.equal(JSON.parse(payload.payload).room_id, roomId);
});

test('Zego Token04 rejects non-32-byte server secrets', () => {
  assert.throws(() => makeToken04(1, 'short', 'user', 'room'), /32 bytes/);
});
