/* eslint @typescript-eslint/no-require-imports: off */
const crypto = require('node:crypto');
const { getFirestore } = require('firebase-admin/firestore');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');

const db = getFirestore();
const ZEGO_SERVER_SECRET = defineSecret('ZEGO_SERVER_SECRET');
const REGION = 'us-central1';
const TOKEN_TTL_SEC = 3600;

function zegoUserId(raw) {
  const source = String(raw || '').trim();
  let value = source.replace(/[^a-zA-Z0-9_]/g, '');
  if (!value) {
    let hash = 5381;
    for (const char of source || 'u') hash = (Math.imul(hash, 33) ^ char.charCodeAt(0)) >>> 0;
    value = `u${hash.toString(16)}`;
  }
  return value.slice(0, 32);
}

function makeToken(appId, secret, userId, roomId) {
  if (Buffer.byteLength(secret, 'utf8') !== 32) {
    throw new HttpsError('failed-precondition', 'Zego Server Secret 32 bayt olmalıdır.');
  }
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    app_id: appId,
    user_id: userId,
    nonce: crypto.randomInt(1, 2147483647),
    ctime: now,
    expire: now + TOKEN_TTL_SEC,
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
  expiry.writeBigInt64BE(BigInt(payload.expire));
  return `04${Buffer.concat([expiry, packString(iv), packString(encrypted)]).toString('base64')}`;
}

exports.createZegoToken = onCall(
  { region: REGION, enforceAppCheck: true, secrets: [ZEGO_SERVER_SECRET], maxInstances: 20 },
  async (request) => {
    if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Giriş tələb olunur.');
    const requestedUserId = String(request.data?.userId || '').trim();
    const roomId = String(request.data?.roomId || '').trim();
    const appId = Number(process.env.ZEGO_APP_ID || 0);
    const secret = ZEGO_SERVER_SECRET.value().trim();
    if (!requestedUserId || requestedUserId.length > 120 || !roomId || roomId.length > 64) {
      throw new HttpsError('invalid-argument', 'Zego userId və roomId etibarsızdır.');
    }
    if (!Number.isInteger(appId) || appId <= 0 || appId > 0xffffffff || !secret) {
      throw new HttpsError('failed-precondition', 'Zego server konfiqurasiyası yoxdur.');
    }

    const profiles = await db.collection('users').where('firebaseUid', '==', request.auth.uid).limit(2).get();
    const allowedIds = new Set([request.auth.uid]);
    profiles.forEach((profile) => allowedIds.add(zegoUserId(profile.id)));
    if (!allowedIds.has(zegoUserId(requestedUserId))) {
      throw new HttpsError('permission-denied', 'Bu Zego userId hesabınıza bağlı deyil.');
    }

    return {
      token: makeToken(appId, secret, zegoUserId(requestedUserId), roomId),
      appId,
      expireSec: TOKEN_TTL_SEC,
    };
  },
);
