/* eslint @typescript-eslint/no-require-imports: off */
const { getFirestore } = require('firebase-admin/firestore');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const { FieldValue } = require('firebase-admin/firestore');
const { makeToken04 } = require('./zegoTokenFormat');

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

    // Purge credential fields left by the legacy seed script from the readable config doc.
    await db.doc('app_config/zego').set({
      appSign: FieldValue.delete(),
      serverSecret: FieldValue.delete(),
      updatedAt: Date.now(),
    }, { merge: true });

    const profiles = await db.collection('users').where('firebaseUid', '==', request.auth.uid).limit(2).get();
    const allowedIds = new Set([request.auth.uid]);
    profiles.forEach((profile) => allowedIds.add(zegoUserId(profile.id)));
    if (!allowedIds.has(zegoUserId(requestedUserId))) {
      throw new HttpsError('permission-denied', 'Bu Zego userId hesabınıza bağlı deyil.');
    }

    return {
      token: makeToken04(appId, secret, zegoUserId(requestedUserId), roomId, Math.floor(Date.now() / 1000), TOKEN_TTL_SEC),
      appId,
      expireSec: TOKEN_TTL_SEC,
    };
  },
);

