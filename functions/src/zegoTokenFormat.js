const crypto = require('node:crypto');

function makeToken04(appId, secret, userId, roomId, now = Math.floor(Date.now() / 1000), ttlSec = 3600) {
  if (Buffer.byteLength(secret, 'utf8') !== 32) throw new Error('Zego Server Secret must be 32 bytes.');
  const expiresAt = now + ttlSec;
  const payload = {
    app_id: appId,
    user_id: userId,
    nonce: crypto.randomInt(1, 2147483647),
    ctime: now,
    expire: expiresAt,
    payload: JSON.stringify({ room_id: roomId }),
  };
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(secret, 'utf8'), iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(payload), 'utf8'), cipher.final()]);
  const packString = (value) => {
    const bytes = Buffer.from(value);
    const length = Buffer.alloc(2);
    length.writeUInt16BE(bytes.length);
    return Buffer.concat([length, bytes]);
  };
  const expiry = Buffer.alloc(8);
  expiry.writeBigInt64BE(BigInt(expiresAt));
  return `04${Buffer.concat([expiry, packString(iv), packString(encrypted)]).toString('base64')}`;
}

module.exports = { makeToken04 };
