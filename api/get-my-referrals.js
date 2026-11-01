const {
  ApiError,
  applyCors,
  getAdminFirestore,
  sendJson,
  verifySecureRequest,
} = require('../services/apiSecurity');

const USER_ID_PATTERN = /^\d{1,20}$/;

function verifiedAtMillis(value) {
  if (value && typeof value.toMillis === 'function') return value.toMillis();
  return Number(value);
}

module.exports = async function getMyReferralsHandler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS');
    return sendJson(res, 405, { error: 'METHOD_NOT_ALLOWED' });
  }

  try {
    const payload = req.body && typeof req.body === 'object' && !Array.isArray(req.body)
      ? req.body
      : {};
    const identity = await verifySecureRequest(req, 'getMyReferrals', payload, { requireIdempotency: true });
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
    if (!Number.isFinite(verifiedAtMillis(player.identityVerifiedAt))
      || verifiedAtMillis(player.identityVerifiedAt) <= 0) {
      throw new ApiError(409, 'PROFILE_NOT_VERIFIED');
    }
    if (player.frozen === true || user.frozen === true || user.banned === true) {
      throw new ApiError(403, 'PROFILE_UNAVAILABLE');
    }

    const referralsSnap = await db.collection('referrals')
      .where('inviterPlayerId', '==', userId)
      .get();
    const uniqueReferrals = new Map();
    referralsSnap.forEach((doc) => {
      const referral = doc.data() || {};
      if (!['pending', 'active'].includes(String(referral.status || ''))) return;
      const referredId = String(referral.referredUid || referral.referredPlayerId || '').trim();
      if (!referredId) return;
      const previous = uniqueReferrals.get(referredId);
      if (!previous || referral.status === 'active') uniqueReferrals.set(referredId, referral.status);
    });

    let activeCount = 0;
    let pendingCount = 0;
    for (const status of uniqueReferrals.values()) {
      if (status === 'active') activeCount += 1;
      else pendingCount += 1;
    }

    return sendJson(res, 200, { activeCount, pendingCount });
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
      'PROFILE_NOT_VERIFIED', 'PROFILE_UNAVAILABLE',
    ]);
    const code = knownCodes.has(error.code) ? error.code : 'REFERRALS_UNAVAILABLE';
    if (status >= 500) console.error('get-my-referrals failed:', error.message);
    return sendJson(res, status, { error: code });
  }
};
