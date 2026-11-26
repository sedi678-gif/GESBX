const crypto = require('node:crypto');
const { paypalPayoutRequest, paypalWebhook } = require('../services/paypalPayout');
const socialLikes = require('../services/socialLikes');
const privateMessages = require('../services/privateMessages');
const { getAdminAuth, getAdminFirestore, FieldValue } = require('../services/firebaseAdmin');

const ZEGO_APP_ID = Number(process.env.ZEGO_APP_ID || process.env.NEXT_PUBLIC_ZEGO_APP_ID || 0);
const ZEGO_SERVER_SECRET = String(process.env.ZEGO_SERVER_SECRET || '').trim();
const ZEGO_TOKEN_TTL_SEC = 3600;

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

function makeZegoToken04(userId, roomId) {
  if (Buffer.byteLength(ZEGO_SERVER_SECRET, 'utf8') !== 32) {
    throw new Error('ZEGO_SERVER_SECRET must be 32 bytes.');
  }
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = now + ZEGO_TOKEN_TTL_SEC;
  const payload = {
    app_id: ZEGO_APP_ID,
    user_id: userId,
    nonce: crypto.randomInt(1, 2147483647),
    ctime: now,
    expire: expiresAt,
    payload: JSON.stringify({ room_id: roomId }),
  };
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(ZEGO_SERVER_SECRET, 'utf8'), iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(payload), 'utf8'), cipher.final()]);
  const pack = (value) => {
    const bytes = Buffer.from(value);
    const length = Buffer.alloc(2);
    length.writeUInt16BE(bytes.length);
    return Buffer.concat([length, bytes]);
  };
  const expiry = Buffer.alloc(8);
  expiry.writeBigInt64BE(BigInt(expiresAt));
  return `04${Buffer.concat([expiry, pack(iv), pack(encrypted)]).toString('base64')}`;
}

async function zegoRegisterUserApi(req, res) {
  res.setHeader('Cache-Control', 'no-store, private');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'method_not_allowed' });
  }
  if (!Number.isInteger(ZEGO_APP_ID) || ZEGO_APP_ID <= 0 || ZEGO_APP_ID > 0xffffffff) {
    return res.status(503).json({ error: 'zego_app_id_not_configured' });
  }
  if (Buffer.byteLength(ZEGO_SERVER_SECRET, 'utf8') !== 32) {
    return res.status(503).json({ error: 'zego_server_secret_not_configured' });
  }

  try {
    const authorization = String(req.headers.authorization || '');
    const match = authorization.match(/^Bearer\s+(.+)$/i);
    if (!match) return res.status(401).json({ error: 'unauthorized' });
    const decoded = await getAdminAuth().verifyIdToken(match[1]);

    const requestedUserId = String(req.body?.userId || '').trim();
    if (!requestedUserId || requestedUserId.length > 120) {
      return res.status(400).json({ error: 'invalid_user_id' });
    }

    const firestore = getAdminFirestore();
    const callerProfiles = await firestore.collection('users')
      .where('firebaseUid', '==', decoded.uid).limit(2).get();
    if (callerProfiles.empty) {
      return res.status(403).json({ error: 'caller_profile_not_linked' });
    }

    const profileSnap = await firestore.collection('users').doc(requestedUserId).get();
    if (!profileSnap.exists) {
      return res.status(404).json({ error: 'callee_profile_not_found' });
    }
    const profile = profileSnap.data() || {};
    const canonicalId = String(profile.id || profileSnap.id);
    if (canonicalId !== requestedUserId || profile.frozen === true || profile.banned === true) {
      return res.status(403).json({ error: 'callee_not_available' });
    }

    const userId = zegoUserId(canonicalId);
    if (!userId || userId.length > 32) {
      return res.status(400).json({ error: 'invalid_zego_user_id' });
    }

    const timestamp = Math.floor(Date.now() / 1000);
    const signatureNonce = crypto.randomBytes(8).toString('hex');
    const signature = crypto.createHash('md5')
      .update(String(ZEGO_APP_ID) + signatureNonce + ZEGO_SERVER_SECRET + String(timestamp))
      .digest('hex');
    const params = new URLSearchParams({
      Action: 'UserRegister',
      AppId: String(ZEGO_APP_ID),
      SignatureNonce: signatureNonce,
      Timestamp: String(timestamp),
      SignatureVersion: '2.0',
      Signature: signature,
    });

    const userName = String(req.body?.userName || [profile.name, profile.surname].filter(Boolean).join(' ') || userId).slice(0, 256);
    const userAvatar = String(req.body?.userAvatar || profile.avatar || '').slice(0, 500);
    const zimResponse = await fetch('https://zim-api.zego.im/?' + params.toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        UserInfo: [{ UserId: userId, UserName: userName, ...(userAvatar ? { UserAvatar: userAvatar } : {}) }],
      }),
      cache: 'no-store',
    });
    const result = await zimResponse.json().catch(() => ({}));
    const errors = Array.isArray(result?.ErrorList) ? result.ErrorList : [];
    const onlyAlreadyRegistered = errors.length > 0 && errors.every((item) => Number(item?.SubCode) === 660700002);
    if (!zimResponse.ok || (Number(result?.Code) !== 0 && Number(result?.Code) !== 660700002) ||
        (errors.length > 0 && !onlyAlreadyRegistered)) {
      console.error('[ZEGO user registration]', { httpStatus: zimResponse.status, code: result?.Code, errors });
      return res.status(502).json({
        error: 'zego_user_registration_failed',
        code: result?.Code ?? null,
        message: String(result?.Message || 'ZEGO istifadəçini qeydiyyata ala bilmədi.'),
      });
    }

    return res.status(200).json({ registered: true, alreadyRegistered: onlyAlreadyRegistered });
  } catch (error) {
    console.error('[ZEGO user registration API]', error);
    const status = error?.code === 'auth/id-token-expired'
      || error?.code === 'auth/argument-error'
      || error?.code === 'auth/invalid-id-token' ? 401 : 500;
    return res.status(status).json({ error: status === 401 ? 'unauthorized' : 'zego_user_registration_failed' });
  }
}

async function zegoTokenApi(req, res) {
  res.setHeader('Cache-Control', 'no-store, private');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'method_not_allowed' });
  }
  if (!Number.isInteger(ZEGO_APP_ID) || ZEGO_APP_ID <= 0 || ZEGO_APP_ID > 0xffffffff) {
    return res.status(503).json({ error: 'zego_app_id_not_configured' });
  }
  if (Buffer.byteLength(ZEGO_SERVER_SECRET, 'utf8') !== 32) {
    return res.status(503).json({ error: 'zego_server_secret_not_configured' });
  }

  try {
    const authorization = String(req.headers.authorization || '');
    const match = authorization.match(/^Bearer\s+(.+)$/i);
    if (!match) return res.status(401).json({ error: 'unauthorized' });
    const decoded = await getAdminAuth().verifyIdToken(match[1]);
    const requestedUserId = String(req.body?.userId || '').trim();
    const roomId = String(req.body?.roomId || '').trim();
    if (!requestedUserId || requestedUserId.length > 120 || !roomId || roomId.length > 64) {
      return res.status(400).json({ error: 'invalid_user_or_room' });
    }

    const profiles = await getAdminFirestore().collection('users')
      .where('firebaseUid', '==', decoded.uid).limit(2).get();
    const allowedIds = new Set([decoded.uid]);
    profiles.forEach((profile) => allowedIds.add(zegoUserId(profile.id)));
    if (!allowedIds.has(zegoUserId(requestedUserId))) {
      return res.status(403).json({ error: 'user_id_not_linked_to_account' });
    }

    return res.status(200).json({
      token: makeZegoToken04(zegoUserId(requestedUserId), roomId),
      appId: ZEGO_APP_ID,
      expireSec: ZEGO_TOKEN_TTL_SEC,
    });
  } catch (error) {
    console.error('[ZEGO token API]', error);
    const status = error?.code === 'auth/id-token-expired'
      || error?.code === 'auth/argument-error'
      || error?.code === 'auth/invalid-id-token' ? 401 : 500;
    return res.status(status).json({
      error: status === 401 ? 'unauthorized' : 'token_generation_failed',
    });
  }
}

module.exports = async function paypalApi(req, res) {
  const handler = String(req.query?.handler || 'request');
  if (handler === 'zego-token') return zegoTokenApi(req, res);
  if (handler === 'zego-register-user') return zegoRegisterUserApi(req, res);
  if (handler === 'social-likes') return socialLikes(req, res);
  if (handler === 'messages') return privateMessages(req, res);
  if (handler === 'webhook') return paypalWebhook(req, res);
  return paypalPayoutRequest(req, res);
};

module.exports.config = { api: { bodyParser: { sizeLimit: '2mb' } } };
