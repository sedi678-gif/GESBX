const crypto = require('node:crypto');
const {
  ApiError,
  FieldValue,
  applyCors,
  getAdminFirestore,
  getServiceAccount,
  hmacRiskHash,
  sendJson,
  verifySecureRequest,
} = require('../services/apiSecurity');

const USER_ID_PATTERN = /^\\d{1,20}$/;

function deriveReferralKey() {
  const privateKey = getServiceAccount().private_key;
  return Buffer.from(crypto.hkdfSync(
    'sha256',
    Buffer.from(privateKey, 'utf8'),
    Buffer.from('gesbx-c4312', 'utf8'),
    Buffer.from('referral-code/v1', 'utf8'),
    32,
  ));
}

function makeReferralCode(uid) {
  return crypto.createHmac('sha256', deriveReferralKey())
    .update(`referral:${uid}`)
    .digest('hex')
    .slice(0, 10)
    .toUpperCase();
}

function verifiedAtMillis(value) {
  if (value && typeof value.toMillis === 'function') return value.toMillis();
  return Number(value);
}

module.exports = async function getMyReferralCodeHandler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS');
    return sendJson(res, 405, { error: 'METHOD_NOT_ALLOWED' });
  }

  try {
    const payload = req.body && typeof req.body === 'object' && !Array.isArray(req.body)
      ? req.body
      : {};
    const identity = await verifySecureRequest(req, 'getMyReferralCode', payload, {
      requireIdempotency: true,
      uidLimit: { max: 10, windowMs: 60_000 },
    });
    const userId = String(payload.userId || '').trim();
    if (!USER_ID_PATTERN.test(userId) || Object.keys(payload).length !== 1) {
      throw new ApiError(400, 'INVALID_REQUEST');
    }

    const db = getAdminFirestore();
    const [playerSnap, userSnap] = await Promise.all([
      db.doc(`players/${userId}`).get(),
      db.doc(`users/${userId}`).get(),
    ]);
    if (!playerSnap.exists || !userSnap.exists) throw new ApiError(404, 'PROFILE_NOT_FOUND');

    const player = playerSnap.data() || {};
    const user = userSnap.data() || {};
    if (player.firebaseUid !== identity.uid || user.firebaseUid !== identity.uid) {
      throw new ApiError(403, 'PROFILE_OWNER_MISMATCH');
    }
    const identityVerifiedAt = verifiedAtMillis(player.identityVerifiedAt);
    if (!Number.isFinite(identityVerifiedAt) || identityVerifiedAt <= 0) {
      throw new ApiError(409, 'PROFILE_NOT_VERIFIED');
    }
    if (player.frozen === true || user.frozen === true || user.banned === true) {
      throw new ApiError(403, 'PROFILE_UNAVAILABLE');
    }

    const code = makeReferralCode(identity.uid);
    const codeRef = db.doc(`referral_codes/${code}`);
    const installationHash = hmacRiskHash(identity.installationId, 'installation');
    const ipHash = identity.ip ? hmacRiskHash(identity.ip, 'ip') : null;
    await db.runTransaction(async (tx) => {
      const existing = await tx.get(codeRef);
      if (existing.exists && existing.data()?.authUid !== identity.uid) {
        throw new ApiError(409, 'REFERRAL_CODE_COLLISION');
      }
      tx.set(codeRef, {
        authUid: identity.uid,
        playerId: userId,
        installationHash: installationHash || null,
        ipHash: ipHash || null,
        createdAt: existing.exists ? existing.data().createdAt : FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    });

    return sendJson(res, 200, { code });
  } catch (error) {
    const status = error instanceof ApiError ? error.status : 500;
    const knownCodes = new Set([
      'AUTH_HEADERS_REQUIRED', 'AUTH_TOKEN_INVALID', 'APP_CHECK_INVALID',
      'APP_CHECK_PROJECT_MISMATCH', 'AUTH_OR_APP_CHECK_REQUIRED',
      'FIREBASE_SERVICE_ACCOUNT_MISSING', 'FIREBASE_SERVICE_ACCOUNT_INVALID',
      'FIREBASE_SERVICE_ACCOUNT_PROJECT_MISMATCH', 'FIREBASE_AUTH_VERIFIER_UNAVAILABLE',
      'PLAY_INTEGRITY_REQUIRED', 'PLAY_INTEGRITY_NOT_CONFIGURED', 'PLAY_INTEGRITY_REJECTED',
      'PLAY_INTEGRITY_UNAVAILABLE', 'RATE_LIMITED', 'SECURITY_CONFIGURATION_MISSING',
      'INVALID_REQUEST', 'PROFILE_NOT_FOUND', 'PROFILE_OWNER_MISMATCH',
      'PROFILE_NOT_VERIFIED', 'PROFILE_UNAVAILABLE', 'REFERRAL_CODE_COLLISION',
    ]);
    const code = knownCodes.has(error.code) ? error.code : 'REFERRAL_CODE_UNAVAILABLE';
    if (status >= 500) console.error('get-my-referral-code failed:', error.message);
    return sendJson(res, status, { error: code });
  }
};
