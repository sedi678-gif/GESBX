const {
  ApiError,
  applyCors,
  getAdminFirestore,
  sendJson,
  sha256,
  verifySecureRequest,
} = require('../services/apiSecurity');

const USER_ID_PATTERN = /^\d{1,20}$/;

module.exports = async function setXpModeHandler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS');
    return sendJson(res, 405, { error: 'METHOD_NOT_ALLOWED' });
  }

  try {
    const payload = req.body && typeof req.body === 'object' && !Array.isArray(req.body)
      ? req.body
      : {};
    const identity = await verifySecureRequest(req, 'setProPanelActive', payload, { requireIdempotency: true });
    const userId = String(payload.userId || '').trim();
    if (!USER_ID_PATTERN.test(userId) || typeof payload.active !== 'boolean'
      || Object.keys(payload).length !== 2) {
      throw new ApiError(400, 'INVALID_REQUEST');
    }

    const db = getAdminFirestore();
    const playerRef = db.doc(`players/${userId}`);
    const userRef = db.doc(`users/${userId}`);
    const operationRef = db.doc(`operation_ledger/${sha256(`${identity.uid}:${identity.operationId}`).slice(0, 48)}`);
    const now = Date.now();

    const result = await db.runTransaction(async (tx) => {
      const operationSnap = await tx.get(operationRef);
      if (operationSnap.exists) return operationSnap.data().result;

      const [playerSnap, userSnap] = await Promise.all([tx.get(playerRef), tx.get(userRef)]);
      if (!playerSnap.exists || !userSnap.exists) throw new ApiError(404, 'PROFILE_NOT_FOUND');

      const player = playerSnap.data() || {};
      const user = userSnap.data() || {};
      if (player.firebaseUid !== identity.uid || user.firebaseUid !== identity.uid) {
        throw new ApiError(403, 'PROFILE_OWNER_MISMATCH');
      }
      if (!player.identityVerifiedAt) throw new ApiError(409, 'PROFILE_NOT_BOUND');
      if (player.frozen === true || user.frozen === true || user.banned === true) {
        throw new ApiError(403, 'PROFILE_UNAVAILABLE');
      }

      const operationResult = {
        userPlan: player.userPlan || 'FREE',
        hasVipPass: player.hasVipPass === true,
        isVipLifetime: player.isVipLifetime === true,
        proPanelActive: payload.active,
      };
      tx.update(playerRef, { proPanelActive: payload.active, updatedAt: now });
      tx.create(operationRef, {
        authUid: identity.uid,
        playerId: userId,
        operationId: identity.operationId,
        action: 'setProPanelActive',
        result: operationResult,
        createdAt: new Date(now),
      });
      return operationResult;
    });

    return sendJson(res, 200, result);
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
      'PROFILE_NOT_BOUND', 'PROFILE_UNAVAILABLE',
    ]);
    const code = knownCodes.has(error.code) ? error.code : 'XP_MODE_UPDATE_FAILED';
    if (status >= 500) console.error('set-xp-mode failed:', error.message);
    return sendJson(res, status, { error: code });
  }
};
